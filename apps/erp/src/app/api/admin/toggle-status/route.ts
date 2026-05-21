
import { NextRequest, NextResponse } from 'next/server';
import { adminAuth } from '@/lib/firebase-admin';

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
        const { uid, disabled } = body;

        if (!uid || typeof disabled === 'undefined') return NextResponse.json({ error: 'Missing uid or status' }, { status: 400 });

        // Toggle User Status
        await adminAuth.updateUser(uid, { disabled });

        return NextResponse.json({ success: true, message: `User ${uid} ${disabled ? 'disabled' : 'enabled'}` });

    } catch (error: unknown) {
        console.error("Error updating user status:", error);
        return NextResponse.json({ error: error instanceof Error ? error.message : 'Unknown error' }, { status: 500 });
    }
}
