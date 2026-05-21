/**
 * Helpers compartidos para Cloud Functions de tesorería.
 */
import * as admin from 'firebase-admin';
import { HttpsError, CallableRequest } from 'firebase-functions/v2/https';

export function requireAuth(req: CallableRequest): { uid: string; role: string; branchId: string | null; name: string } {
    if (!req.auth) throw new HttpsError('unauthenticated', 'Debes iniciar sesión');
    const role = (req.auth.token.role as string) || 'ENCARGADO_VENTAS';
    const branchId = (req.auth.token.branchId as string) || null;
    const name = (req.auth.token.name as string) || (req.auth.token.email as string) || 'Usuario';
    return { uid: req.auth.uid, role, branchId, name };
}

export function requireGerente(req: CallableRequest) {
    const u = requireAuth(req);
    if (u.role !== 'GERENTE') throw new HttpsError('permission-denied', 'Solo el gerente puede ejecutar esta acción');
    return u;
}

export async function logAdmin(uid: string, name: string, action: string, target: string, branchId: string | null, details: string) {
    try {
        await admin.firestore().collection('audit_log').add({
            uid, userName: name, action, targetId: target,
            branchId: branchId || 'HQ', details,
            timestamp: admin.firestore.FieldValue.serverTimestamp(),
        });
    } catch (e) {
        console.error('[logAdmin] CRITICAL: audit log write failed', { uid, action, target, error: e });
        // Re-throw so callers know audit trail is broken
        throw new HttpsError('internal', 'No se pudo registrar la acción en el log de auditoría');
    }
}

export function round2(n: number): number {
    return Math.round(n * 100) / 100;
}
