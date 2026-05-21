import { db } from '@/lib/firebase';
import { 
    collection, 
    addDoc, 
    updateDoc, 
    doc, 
    serverTimestamp, 
    getDocs, 
    query, 
    orderBy, 
    where, 
    runTransaction
} from 'firebase/firestore';
import { Client } from '@/types';
import { throwStandardError } from '@/utils/errorCodes';
import { JournalService } from './JournalService';

const COLLECTION_NAME = 'clientes';

export const ClientService = {
    createClient: async (client: Omit<Client, 'id'>, branchId: string) => {
        const docRef = await addDoc(collection(db, COLLECTION_NAME), {
            ...client,
            branchId,
            balance: 0, 
            isActive: true, // Auto-active
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
        });
        return docRef.id;
    },

    // Update
    updateClient: async (id: string, data: Partial<Client>) => {
        const docRef = doc(db, COLLECTION_NAME, id);
        await updateDoc(docRef, {
            ...data,
            updatedAt: serverTimestamp()
        });
    },

    // Soft-Delete (Architecture: flow:137)
    deleteClient: async (id: string) => {
        const docRef = doc(db, COLLECTION_NAME, id);
        await updateDoc(docRef, { 
            isActive: false, 
            updatedAt: serverTimestamp() 
        });
    },

    // Get All (Non-realtime)
    getAllClients: async (branchId?: string) => {
        let q = query(
            collection(db, COLLECTION_NAME), 
            where('isActive', '!=', false),
            orderBy('isActive'),
            orderBy('razonSocial')
        );
        if (branchId) {
            q = query(q, where('branchId', '==', branchId));
        }
        const snapshot = await getDocs(q);
        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Client));
    },

    /**
     * Registro de Abono / Pago de Crédito (Industrial)
     * Reduce el balance del cliente y registra el ingreso en caja.
     */
    async registerPayment(
        clientId: string,
        amount: number,
        method: 'EFECTIVO' | 'QR' | 'TRANSFERENCIA',
        userId: string,
        userName: string,
        branchId: string,
        notes: string,
        _shiftId?: string
    ): Promise<void> {
        const resolved = await JournalService.resolveAccountId({
            branchId,
            paymentMethod: method,
            cashierId: method === 'EFECTIVO' ? userId : undefined,
        });

        await runTransaction(db, async (transaction) => {
            const clientRef = doc(db, COLLECTION_NAME, clientId);
            const clientSnap = await transaction.get(clientRef);
            
            if (!clientSnap.exists()) throwStandardError('SYS_TRANSACTION_FAILED', 'Cliente no encontrado');
            
            const currentBalance = clientSnap.data().saldoDeudor || 0;
            if (amount <= 0) {
                throwStandardError('SYS_TRANSACTION_FAILED', 'El monto del abono debe ser mayor a 0');
            }
            if (amount > currentBalance + 0.01) {
                throwStandardError('SYS_TRANSACTION_FAILED', `El abono excede el saldo deudor (Bs. ${currentBalance.toFixed(2)})`);
            }
            const newBalance = Math.max(0, currentBalance - amount);

            // Read account BEFORE writes
            const accRead = await JournalService.txReadAccount(transaction, resolved.accountId);
            // Si el destino es CASH_DRAWER (EFECTIVO), re-validar dentro de la TX que la sesión
            // sigue OPEN. Evita race: cierre forzado entre resolveAccountId y commit.
            if (resolved.sessionId) {
                await JournalService.txEnsureSessionOpen(transaction, resolved.sessionId);
            }

            // 1. Update Client saldoDeudor
            transaction.update(clientRef, { 
                saldoDeudor: newBalance,
                updatedAt: serverTimestamp() 
            });

            // 2. Register journal entry (account-based v2)
            JournalService.txWriteEntry(transaction, accRead, {
                accountId: resolved.accountId,
                amount,
                paymentMethod: method,
                category: 'ABONO_CLIENTE',
                description: `Abono: ${notes} (Socio: ${clientSnap.data().razonSocial})`,
                referenceType: 'NONE',
                referenceId: clientId,
                sessionId: resolved.sessionId,
                branchId,
                userId,
                userName,
            });

            // 3. Register Global Audit Log
            const auditRef = doc(collection(db, 'logs_auditoria'));
            transaction.set(auditRef, {
                action: 'CLIENT_PAYMENT',
                adminId: userId,
                adminEmail: userName,
                details: `Abono de ${amount} Bs. para ${clientSnap.data().razonSocial}. Saldo Deudor Resultante: ${newBalance} Bs.`,
                branchId,
                timestamp: serverTimestamp()
            });
        });
    }
};
