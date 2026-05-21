
import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase-admin';

export async function POST(request: NextRequest) {
    try {
        const token = request.headers.get('Authorization')?.split('Bearer ')[1];
        if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const decodedToken = await adminAuth.verifyIdToken(token);

        const isGerente = decodedToken.role === 'GERENTE';

        if (!isGerente) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        const body = await request.json();
        const { uid } = body;

        if (!uid) return NextResponse.json({ error: 'Missing uid' }, { status: 400 });

        // Prevent self-deletion
        if (uid === decodedToken.uid) {
            return NextResponse.json({ error: 'Cannot delete your own account' }, { status: 400 });
        }

        // Delete from Auth + Firestore atomically
        await adminAuth.deleteUser(uid);
        await adminDb.collection('users').doc(uid).delete();

        return NextResponse.json({ success: true, message: `User ${uid} deleted` });

    } catch (error: unknown) {
        console.error("Error deleting user:", error);
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        return NextResponse.json({ error: errorMessage }, { status: 500 });
    }
}
