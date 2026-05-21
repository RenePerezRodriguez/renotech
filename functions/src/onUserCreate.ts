/**
 * Cloud Functions: User Management
 * 
 * IMPORTANTE: Estas funciones son CALLABLE (no Auth triggers)
 * Para usarlas desde el frontend:
 * 
 * import { httpsCallable } from "firebase/functions";
 * const createUserDoc = httpsCallable(functions, "createUserDoc");
 * await createUserDoc({ userId, email, branchId, roleId });
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { buildCustomClaims, resolvePermissionsForRole } from './permissions';

admin.initializeApp();

/**
 * CALLABLE: createUserDoc
 * Crea documento en Firestore cuando se crea usuario en Auth
 * Call desde frontend cuando autenticación exitosa
 */
export const createUserDoc = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError(
      'unauthenticated',
      'Usuario no autenticado'
    );
  }

  const userId = context.auth.uid;
  const email = context.auth.token.email || '';

  try {
    // Verificar si doc ya existe
    const userDocRef = admin.firestore().collection('users').doc(userId);
    const userDocSnap = await userDocRef.get();

    if (!userDocSnap.exists) {
      // Crear documento
      await userDocRef.set({
        email,
        uid: userId,
        branchId: data.branchId || null,
        roleId: data.roleId || 'ENCARGADO_VENTAS',
        status: 'ACTIVE',
        displayName: data.displayName || 'Usuario',
        photoURL: null,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        lastLogin: null
      });

      console.log('[createUserDoc] User doc creado:', userId);
    }

    // Establecer custom claims (IMPORTANTE para Firestore rules)
    const roleId = data.roleId || 'ENCARGADO_VENTAS';
    let rolePerms: string[] | undefined;
    try {
      const roleSnap = await admin.firestore().collection('roles').doc(roleId).get();
      rolePerms = (roleSnap.exists ? (roleSnap.data() as { permissions?: string[] })?.permissions : undefined) || undefined;
    } catch {
      // best-effort: si /roles no es legible, fallback a defaults
    }
    const customClaims = buildCustomClaims({
      role: roleId,
      branchId: data.branchId || null,
      permissions: resolvePermissionsForRole(roleId, rolePerms),
    });

    await admin.auth().setCustomUserClaims(userId, customClaims);
    console.log('[createUserDoc] Custom claims establecidos:', userId);

    return {
      success: true,
      userId,
      message: 'Usuario creado correctamente'
    };
  } catch (error) {
    console.error('[createUserDoc] ERROR:', error);
    throw new functions.https.HttpsError(
      'internal',
      error instanceof Error ? error.message : String(error)
    );
  }
});

/**
 * CALLABLE: updateUserClaims
 * Permite a admins actualizar custom claims
 */
export const updateUserClaims = functions.https.onCall(async (data, context) => {
  // Verificar que quien llama es GERENTE
  if (!context.auth || !context.auth.token.role || context.auth.token.role !== 'GERENTE') {
    throw new functions.https.HttpsError(
      'permission-denied',
      'Solo GERENTE puede actualizar claims de usuarios'
    );
  }

  const { userId, branchId, role, permissions } = data;

  if (!userId) {
    throw new functions.https.HttpsError('invalid-argument', 'userId requerido');
  }

  try {
    // 1. Actualizar documento en Firestore
    await admin.firestore().collection('users').doc(userId).update({
      branchId,
      roleId: role,
      status: 'ACTIVE',
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    // 2. Establecer custom claims en Auth (snapshot de permisos del rol).
    //    Si quien llama pasó `permissions` explícitamente, los respetamos
    //    (útil para overrides puntuales). Si no, usamos los defaults del rol
    //    o los permisos guardados en /roles/{role}.permissions.
    let resolvedPerms = permissions as string[] | undefined;
    if (!Array.isArray(resolvedPerms)) {
      let rolePerms: string[] | undefined;
      try {
        const roleSnap = await admin.firestore().collection('roles').doc(role).get();
        rolePerms = (roleSnap.exists ? (roleSnap.data() as { permissions?: string[] })?.permissions : undefined) || undefined;
      } catch {
        // best-effort
      }
      resolvedPerms = resolvePermissionsForRole(role, rolePerms);
    }
    const customClaims = buildCustomClaims({
      role,
      branchId: branchId || null,
      permissions: resolvedPerms,
    });

    await admin.auth().setCustomUserClaims(userId, customClaims);

    console.log('[updateUserClaims] Actualizados claims para:', userId);

    return {
      success: true,
      userId,
      claims: customClaims,
      message: 'Custom claims actualizados. Usuario debe logout/login.'
    };
  } catch (error) {
    console.error('[updateUserClaims] ERROR:', error);
    throw new functions.https.HttpsError('internal', error instanceof Error ? error.message : String(error));
  }
});

/**
 * CALLABLE: getUserClaims
 * Obtiene custom claims actuales (para debugging)
 */
export const getUserClaims = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'No autenticado');
  }

  const { userId } = data;
  const requestingUserId = context.auth.uid;

  // Solo puedes ver tus propios claims excepto si eres GERENTE
  if (userId !== requestingUserId && context.auth.token.role !== 'GERENTE') {
    throw new functions.https.HttpsError(
      'permission-denied',
      'Solo puedes ver tus propios claims'
    );
  }

  try {
    const user = await admin.auth().getUser(userId);
    return {
      userId,
      email: user.email,
      customClaims: user.customClaims || {}
    };
  } catch (error) {
    console.error('[getUserClaims] ERROR:', error);
    throw new functions.https.HttpsError('internal', error instanceof Error ? error.message : String(error));
  }
});

/**
 * CALLABLE: resyncRoleClaims
 *
 * Re-sincroniza los custom claims (`permissions`) de TODOS los usuarios
 * que tienen el rol indicado, leyendo el `permissions` actual del documento
 * `roles/{roleId}`. Esto se llama automáticamente cada vez que un GERENTE
 * edita los permisos de un rol personalizado para que el cambio surta
 * efecto sin requerir logout/login manual de cada usuario.
 *
 * Devuelve el conteo de usuarios actualizados.
 *
 * NOTA: Los usuarios afectados deben refrescar su token (la app llama
 * `auth.currentUser.getIdToken(true)` en el próximo evento) para ver los
 * nuevos permisos en sus reglas. Para el usuario activo es transparente
 * vía AuthContext.
 */
export const resyncRoleClaims = functions.https.onCall(async (data, context) => {
  if (!context.auth || context.auth.token.role !== 'GERENTE') {
    throw new functions.https.HttpsError(
      'permission-denied',
      'Solo GERENTE puede re-sincronizar permisos de roles'
    );
  }
  const { roleId } = data as { roleId?: string };
  if (!roleId) {
    throw new functions.https.HttpsError('invalid-argument', 'roleId requerido');
  }

  // Leer permisos actuales del rol
  const roleSnap = await admin.firestore().collection('roles').doc(roleId).get();
  if (!roleSnap.exists) {
    throw new functions.https.HttpsError('not-found', `Rol ${roleId} no existe`);
  }
  const rolePerms = (roleSnap.data() as { permissions?: string[] })?.permissions;
  const permissions = resolvePermissionsForRole(roleId, rolePerms);

  // Encontrar todos los users con este rol (campo legacy `role` o nuevo `roleId`)
  const usersByRole = await admin.firestore()
    .collection('users')
    .where('role', '==', roleId)
    .get();
  const usersByRoleId = await admin.firestore()
    .collection('users')
    .where('roleId', '==', roleId)
    .get();
  const seen = new Set<string>();
  const targets: { uid: string; branchId: string | null }[] = [];
  for (const snap of [usersByRole, usersByRoleId]) {
    snap.forEach((d) => {
      if (seen.has(d.id)) return;
      seen.add(d.id);
      const ud = d.data() as { branchId?: string | null };
      targets.push({ uid: d.id, branchId: ud.branchId ?? null });
    });
  }

  let updated = 0;
  for (const t of targets) {
    try {
      const claims = buildCustomClaims({ role: roleId, branchId: t.branchId, permissions });
      await admin.auth().setCustomUserClaims(t.uid, claims);
      updated++;
    } catch (err) {
      console.error('[resyncRoleClaims] failed for', t.uid, err);
    }
  }

  return { success: true, roleId, total: targets.length, updated };
});

/**
 * HELPER: getPermissionsForRole (legacy, sin uso interno)
 *
 * Mantenido temporalmente por compatibilidad si alguna llamada externa lo usa.
 * Internamente todas las rutas pasan ahora por `resolvePermissionsForRole`
 * en `./permissions`. Eliminar en una próxima ronda de limpieza.
 */
function getPermissionsForRole(role: string): string[] {
  // Backward compat: CAJERO → ENCARGADO_VENTAS
  const resolvedRole = role === 'CAJERO' ? 'ENCARGADO_VENTAS' : role;
  return resolvePermissionsForRole(resolvedRole);
}
// suppress unused warning while we keep the legacy export available
void getPermissionsForRole;
