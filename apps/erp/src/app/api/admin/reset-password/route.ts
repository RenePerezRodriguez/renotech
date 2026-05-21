
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
        const { email } = body;

        if (!email) return NextResponse.json({ error: 'Missing email' }, { status: 400 });

        // Generate Password Reset Link
        const link = await adminAuth.generatePasswordResetLink(email);

        return NextResponse.json({ success: true, link });

    } catch (error: unknown) {
        console.error("Error generating reset link:", error);
        return NextResponse.json({ error: error instanceof Error ? error.message : 'Unknown error' }, { status: 500 });
    }
}
