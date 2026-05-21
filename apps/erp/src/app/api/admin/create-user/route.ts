import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import { buildCustomClaims, resolvePermissionsForRole } from '@/lib/permissions';

export async function POST(request: NextRequest) {
    try {
        const token = request.headers.get('Authorization')?.split('Bearer ')[1];
        if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const decodedToken = await adminAuth.verifyIdToken(token);
        if (decodedToken.role !== 'GERENTE') {
            return NextResponse.json({ error: 'Forbidden: Requires GERENTE role' }, { status: 403 });
        }

        const body = await request.json();
        const { email, password, displayName, role, branchId, canAccessAllBranches } = body;

        // Validate required fields
        if (!email || !password || !displayName || !role) {
            return NextResponse.json({ error: 'Missing required fields: email, password, displayName, role' }, { status: 400 });
        }

        // Validate email format
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return NextResponse.json({ error: 'Invalid email format' }, { status: 400 });
        }

        // Validate password length
        if (password.length < 6) {
            return NextResponse.json({ error: 'Password must be at least 6 characters' }, { status: 400 });
        }

        // Validate role exists
        const roleDoc = await adminDb.collection('roles').doc(role).get();
        if (!roleDoc.exists) {
            return NextResponse.json({ error: `Invalid role: ${role}` }, { status: 400 });
        }

        // Get branch name if branchId provided
        let branchName: string | null = null;
        if (branchId) {
            const branchDoc = await adminDb.collection('branches').doc(branchId).get();
            if (!branchDoc.exists) {
                return NextResponse.json({ error: `Invalid branch: ${branchId}` }, { status: 400 });
            }
            branchName = branchDoc.data()?.name || null;
        }

        // 1. Create Firebase Auth user
        const userRecord = await adminAuth.createUser({
            email,
            password,
            displayName,
        });

        // 2. Set custom claims (incluye snapshot de permisos del rol)
        const roleData = roleDoc.data() as { permissions?: string[] } | undefined;
        await adminAuth.setCustomUserClaims(
            userRecord.uid,
            buildCustomClaims({
                role,
                branchId: branchId || null,
                permissions: resolvePermissionsForRole(role, roleData?.permissions),
            }),
        );

        // 3. Create Firestore document
        await adminDb.collection('users').doc(userRecord.uid).set({
            uid: userRecord.uid,
            email,
            displayName,
            role,
            roleId: role,
            status: 'ACTIVE',
            createdAt: FieldValue.serverTimestamp(),
            lastLogin: null,
            branchId: branchId || null,
            branchName,
            canAccessAllBranches: canAccessAllBranches || false,
        });

        return NextResponse.json({
            success: true,
            uid: userRecord.uid,
            message: `User ${email} created with role ${role}`,
        });

    } catch (error: unknown) {
        console.error('Error creating user:', error);
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        return NextResponse.json({ error: errorMessage }, { status: 500 });
    }
}
