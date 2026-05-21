/**
 * BankReconciliationService — conciliación bancaria automática.
 * Modelo Caja + Tesorería v2.
 *
 * Flujo:
 *  1. Gerente importa extracto (CSV / paste manual): lista de líneas con fecha, monto, dirección, ref.
 *  2. Sistema crea un BankReconciliationBatch.
 *  3. Auto-matching: para cada línea, busca journal_entries de la cuenta con
 *     amount igual ± 0.01 BOB y fecha dentro de ±2 días, no conciliados.
 *  4. Al match: marca línea con matchedJournalEntryId y reconcilia el journal_entry.
 *  5. Líneas no matcheadas: gerente las concilia manualmente.
 */
import { db } from '@/lib/firebase';
import {
    collection, doc, getDoc, getDocs, query, where, updateDoc, serverTimestamp,
    orderBy, limit as fbLimit, setDoc
} from 'firebase/firestore';
import type {
    BankReconciliationBatch, BankStatementLine, JournalEntry
} from '@/types/treasury';
import { JournalService } from './JournalService';
import { logAdminAction } from '@/lib/audit';

const COLLECTION = 'bank_reconciliation_batches';
const MATCH_DATE_WINDOW_DAYS = 2;
const MATCH_AMOUNT_TOLERANCE = 0.01;

export const BankReconciliationService = {
    /** Importa un extracto y lanza matching automático */
    async importStatement(input: {
        accountId: string;
        accountName?: string;
        statementPeriodFrom: Date;
        statementPeriodTo: Date;
        lines: Omit<BankStatementLine, 'matched' | 'matchedJournalEntryId'>[];
        gerente: { uid: string; name: string };
        notes?: string;
    }): Promise<{ batchId: string; matchedCount: number; unmatchedCount: number }> {
        if (!input.accountId) throw new Error('accountId obligatorio');
        if (!input.lines.length) throw new Error('Extracto vacío');

        // Cargar journal_entries pendientes de la cuenta en el período (con tolerancia de 2 días alrededor).
        // Filtramos POR FECHA en server-side (índice composite accountId+reconciliationStatus+date)
        // para evitar full-scan de PENDING histórico.
        const fromExpanded = new Date(input.statementPeriodFrom);
        fromExpanded.setDate(fromExpanded.getDate() - MATCH_DATE_WINDOW_DAYS);
        const toExpanded = new Date(input.statementPeriodTo);
        toExpanded.setDate(toExpanded.getDate() + MATCH_DATE_WINDOW_DAYS);

        const candidatesQ = query(
            collection(db, 'journal_entries'),
            where('accountId', '==', input.accountId),
            where('reconciliationStatus', '==', 'PENDING'),
            where('date', '>=', fromExpanded),
            where('date', '<=', toExpanded)
        );
        const candidatesSnap = await getDocs(candidatesQ);
        const candidates: (JournalEntry & { _date: Date })[] = candidatesSnap.docs
            .map(d => {
                const data = d.data();
                return {
                    id: d.id,
                    ...data,
                    _date: data.date?.toDate?.() || new Date(data.date),
                } as JournalEntry & { _date: Date };
            });

        // Match
        const usedCandidateIds = new Set<string>();
        const linesWithMatch: BankStatementLine[] = input.lines.map(line => {
            const lineDate = line.date instanceof Date ? line.date : new Date(line.date);
            const candidate = candidates.find(c =>
                !usedCandidateIds.has(c.id!) &&
                Math.abs(c.amount - line.amount) <= MATCH_AMOUNT_TOLERANCE &&
                c.direction === line.direction &&
                Math.abs(c._date.getTime() - lineDate.getTime()) <= MATCH_DATE_WINDOW_DAYS * 86400_000
            );
            if (candidate) {
                usedCandidateIds.add(candidate.id!);
                return { ...line, matched: true, matchedJournalEntryId: candidate.id };
            }
            return { ...line, matched: false };
        });

        // Pre-asignar id de batch para enlazar reconciliaciones antes de persistir el documento.
        const batchRef = doc(collection(db, COLLECTION));

        // Reconciliar PRIMERO (cada `reconcile` es transaccional y valida que el entry siga PENDING).
        // Si falla un match, lo desmarcamos en `linesWithMatch` antes de persistir el batch para evitar
        // estados inconsistentes (matched=true apuntando a un entry que sigui\u00f3 PENDING).
        for (const line of linesWithMatch) {
            if (line.matched && line.matchedJournalEntryId) {
                try {
                    await JournalService.reconcile(line.matchedJournalEntryId, {
                        bankRef: line.bankRef,
                        userId: input.gerente.uid,
                        userName: input.gerente.name,
                        batchId: batchRef.id,
                    });
                } catch (e) {
                    console.warn(`[BankRecon] Fall\u00f3 reconciliar ${line.matchedJournalEntryId}, se marca como pendiente:`, e);
                    line.matched = false;
                    delete line.matchedJournalEntryId;
                }
            }
        }

        // Recalcular contadores tras posibles fallos.
        const finalMatchedCount = linesWithMatch.filter(l => l.matched).length;
        const finalUnmatchedCount = linesWithMatch.length - finalMatchedCount;

        await setDoc(batchRef, {
            accountId: input.accountId,
            accountName: input.accountName || '',
            statementPeriodFrom: input.statementPeriodFrom,
            statementPeriodTo: input.statementPeriodTo,
            statementLines: linesWithMatch,
            totalLines: linesWithMatch.length,
            matchedCount: finalMatchedCount,
            unmatchedCount: finalUnmatchedCount,
            status: finalUnmatchedCount === 0 ? 'COMPLETE' : (finalMatchedCount > 0 ? 'PARTIAL' : 'DRAFT'),
            createdAt: serverTimestamp(),
            createdBy: input.gerente.uid,
            createdByName: input.gerente.name,
            notes: input.notes || '',
            ...(finalUnmatchedCount === 0 ? { completedAt: serverTimestamp() } : {}),
        } as Omit<BankReconciliationBatch, 'id'>);

        await logAdminAction(input.gerente.uid, input.gerente.name, 'BANK_STATEMENT_IMPORT', batchRef.id,
            'HQ', `Cuenta ${input.accountName || input.accountId} \u00b7 ${finalMatchedCount}/${linesWithMatch.length} matcheados`);

        return { batchId: batchRef.id, matchedCount: finalMatchedCount, unmatchedCount: finalUnmatchedCount };
    },

    /** Reconcilia manualmente una línea no matcheada con un journal_entry específico */
    async manualMatch(batchId: string, lineIndex: number, journalEntryId: string, gerente: { uid: string; name: string }): Promise<void> {
        const batchRef = doc(db, COLLECTION, batchId);
        const snap = await getDoc(batchRef);
        if (!snap.exists()) throw new Error('Batch no encontrado');
        const batch = snap.data() as BankReconciliationBatch;
        const line = batch.statementLines[lineIndex];
        if (!line) throw new Error('Línea no encontrada');
        if (line.matched) throw new Error('La línea ya está matcheada');

        await JournalService.reconcile(journalEntryId, {
            bankRef: line.bankRef,
            userId: gerente.uid,
            userName: gerente.name,
            batchId,
        });

        const updatedLines = [...batch.statementLines];
        updatedLines[lineIndex] = { ...line, matched: true, matchedJournalEntryId: journalEntryId };
        const newMatchedCount = updatedLines.filter(l => l.matched).length;
        const newStatus = newMatchedCount === updatedLines.length ? 'COMPLETE' : 'PARTIAL';

        await updateDoc(batchRef, {
            statementLines: updatedLines,
            matchedCount: newMatchedCount,
            unmatchedCount: updatedLines.length - newMatchedCount,
            status: newStatus,
            ...(newStatus === 'COMPLETE' ? { completedAt: serverTimestamp() } : {}),
        });
    },

    async listBatches(accountId?: string): Promise<BankReconciliationBatch[]> {
        const constraints = [];
        if (accountId) constraints.push(where('accountId', '==', accountId));
        constraints.push(orderBy('createdAt', 'desc'));
        constraints.push(fbLimit(100));
        const q = query(collection(db, COLLECTION), ...constraints);
        const snap = await getDocs(q);
        const batches = snap.docs.map(d => {
            const data = d.data();
            return {
                id: d.id,
                ...data,
                statementPeriodFrom: data.statementPeriodFrom?.toDate?.() || data.statementPeriodFrom,
                statementPeriodTo: data.statementPeriodTo?.toDate?.() || data.statementPeriodTo,
                createdAt: data.createdAt?.toDate?.() || data.createdAt,
                completedAt: data.completedAt?.toDate?.() || data.completedAt,
            } as BankReconciliationBatch;
        });
        batches.sort((a, b) => {
            const aT = (a.createdAt as Date)?.getTime?.() || 0;
            const bT = (b.createdAt as Date)?.getTime?.() || 0;
            return bT - aT;
        });
        return batches;
    },
};
