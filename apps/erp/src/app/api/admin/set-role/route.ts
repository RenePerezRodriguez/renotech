import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase-admin';
import { buildCustomClaims, resolvePermissionsForRole } from '@/lib/permissions';

export async function POST(request: NextRequest) {
    try {
        const token = request.headers.get('Authorization')?.split('Bearer ')[1];
        if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        // Verify ID Token
        const decodedToken = await adminAuth.verifyIdToken(token);
        const isGerente = decodedToken.role === 'GERENTE';

        // Check if this is a first-time admin setup (no GERENTEs exist yet)
        let isFirstTimeSetup = false;
        if (!isGerente) {
            const gerentesSnapshot = await adminDb.collection('users').where('role', '==', 'GERENTE').limit(1).get();
            isFirstTimeSetup = gerentesSnapshot.empty;
        }

        // Authorization: Must be GERENTE, OR first-time setup (self-promote)
        if (!isGerente && !isFirstTimeSetup) {
            return NextResponse.json({ error: 'Forbidden: Requires GERENTE role' }, { status: 403 });
        }

        // On first-time setup, allow only self-promotion to GERENTE
        const body = await request.json();
        const { uid, role } = body;

        if (isFirstTimeSetup && uid !== decodedToken.uid) {
            return NextResponse.json({ error: 'First-time setup: can only promote yourself' }, { status: 403 });
        }

        if (!uid || !role) return NextResponse.json({ error: 'Missing uid or role' }, { status: 400 });

        // Prevent self-role-change (except first-time setup)
        if (!isFirstTimeSetup && uid === decodedToken.uid) {
            return NextResponse.json({ error: 'Cannot change your own role' }, { status: 400 });
        }

        // Validate role exists in Firestore
        const roleDoc = await adminDb.collection('roles').doc(role).get();
        if (!roleDoc.exists) {
            return NextResponse.json({ error: `Invalid role: ${role}` }, { status: 400 });
        }

        // Build custom claims with role + permissions snapshot
        const userDoc = await adminDb.collection('users').doc(uid).get();
        const userData = userDoc.exists ? userDoc.data() : {};
        const roleData = roleDoc.data() as { permissions?: string[] } | undefined;

        const claims = buildCustomClaims({
            role,
            branchId: (userData?.branchId as string | null) || null,
            permissions: resolvePermissionsForRole(role, roleData?.permissions),
        });

        // Set Custom User Claims
        await adminAuth.setCustomUserClaims(uid, claims);

        return NextResponse.json({ success: true, message: `Role ${role} assigned to ${uid}` });

    } catch (error: unknown) {
        console.error("Error setting role:", error);
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        return NextResponse.json({ error: errorMessage }, { status: 500 });
    }
}
