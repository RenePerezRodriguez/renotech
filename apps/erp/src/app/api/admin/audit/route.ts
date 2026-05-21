/**
 * API ROUTE: /api/admin/audit
 * Solo accesible por admin, retorna info de auditoría directamente desde admin SDK
 * Bypass de Firestore rules
 */

import { adminAuth, adminDb } from '@/lib/firebase-admin';
import { NextRequest, NextResponse } from 'next/server';

// Verifica que el caller sea un GERENTE autenticado.
async function verifyAdminToken(req: NextRequest): Promise<{ ok: boolean; reason?: string }> {
  const authHeader = req.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return { ok: false, reason: 'missing_token' };
  }
  const token = authHeader.substring('Bearer '.length).trim();
  if (!token) return { ok: false, reason: 'missing_token' };
  try {
    const decoded = await adminAuth.verifyIdToken(token);
    if (decoded.role !== 'GERENTE') {
      return { ok: false, reason: 'forbidden' };
    }
    return { ok: true };
  } catch {
    return { ok: false, reason: 'invalid_token' };
  }
}

export async function GET(req: NextRequest) {
  const auth = await verifyAdminToken(req);
  if (!auth.ok) {
    const status = auth.reason === 'forbidden' ? 403 : 401;
    return NextResponse.json({ error: auth.reason || 'Unauthorized' }, { status });
  }
  
  const phase = req.nextUrl.searchParams.get('phase') || '1';
  
  try {
    if (phase === '1') {
      return auditPhase1();
    } else if (phase === '2') {
      return auditPhase2();
    } else if (phase === '3') {
      return auditPhase3();
    }
    
    return NextResponse.json({ error: 'Invalid phase' }, { status: 400 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error desconocido' },
      { status: 500 }
    );
  }
}

async function auditPhase1() {
  console.log('🔍 AUDITORÍA FASE 1: Arquitectura (Admin SDK)');
  
  const results = {
    catalogo_maestro: await auditCollection('catalogo_maestro', [
      'codigo', 'nombre', 'marca', 'categoriaId',
      'precioDefault', 'precioUSD', 'costoBase',
      'type', 'searchTags', 'createdAt', 'updatedAt'
    ]),
    productos: await auditCollection('productos', [
      'masterId', 'branchId', 'stock', 'minStock',
      'ubicacionFisica', 'abcClassLocal', 'isActive'
    ]),
    pedidos: await auditCollection('pedidos', [
      'fromBranchId', 'toBranchId', 'status', 'createdAt'
    ]),
    envios: await auditCollection('envios', [
      'fromBranchId', 'toBranchId', 'status', 'pedidoId', 'createdAt'
    ]),
    movimientos: await auditCollection('movimientos', [
      'date', 'productId', 'masterId', 'branchId',
      'type', 'quantity', 'previousStock', 'currentStock', 'referenceId'
    ])
  };
  
  return NextResponse.json({
    phase: 1,
    timestamp: new Date().toISOString(),
    results
  });
}

async function auditPhase2() {
  console.log('🔐 AUDITORÍA FASE 2: Seguridad (Admin SDK)');
  
  const results = {
    roles: await auditCollection('roles', ['name', 'permissions', 'isSystem']),
    users: await auditCollection('users', ['email', 'branchId', 'roleId', 'status']),
    branches: await auditCollection('branches', ['name', 'isHQ', 'isActive'])
  };
  
  return NextResponse.json({
    phase: 2,
    timestamp: new Date().toISOString(),
    results
  });
}

async function auditPhase3() {
  console.log('🧪 AUDITORÍA FASE 3: Funcionalidad (Admin SDK)');
  
  // Busca envíos recientes para validar ciclo completo
  const transfersSnapshot = await adminDb.collection('envios')
    .orderBy('createdAt', 'desc')
    .limit(5)
    .get();
  
  const transfers = [];
  for (const doc of transfersSnapshot.docs) {
    const data = doc.data();
    const items = await adminDb.collection(`envios/${doc.id}/items`).get();
    
    transfers.push({
      id: doc.id,
      status: data.status,
      fromBranch: data.fromBranchId,
      toBranch: data.toBranchId,
      itemCount: items.size,
      pedidoId: data.pedidoId || null,
      createdAt: data.createdAt?.toDate?.() || null
    });
  }
  
  // Busca movimientos recientes
  const movementsSnapshot = await adminDb.collection('movimientos')
    .orderBy('date', 'desc')
    .limit(10)
    .get();
  
  const movements = [];
  for (const doc of movementsSnapshot.docs) {
    const data = doc.data();
    const balanceCorrect = data.currentStock === (data.previousStock + data.quantity);
    
    movements.push({
      id: doc.id,
      type: data.type,
      quantity: data.quantity,
      previousStock: data.previousStock,
      currentStock: data.currentStock,
      balanceCorrect,
      hasReferenceId: !!data.referenceId,
      date: data.date?.toDate?.() || null
    });
  }
  
  return NextResponse.json({
    phase: 3,
    timestamp: new Date().toISOString(),
    recentTransfers: transfers,
    recentMovements: movements,
    movementBalanceIssues: movements.filter(m => !m.balanceCorrect)
  });
}

async function auditCollection(collectionName: string, requiredFields: string[]) {
  try {
    const snapshot = await adminDb.collection(collectionName)
      .limit(10)
      .get();
    
    if (snapshot.empty) {
      return {
        collectionName,
        status: 'EMPTY',
        docssampled: 0,
        issues: ['Colección vacía']
      };
    }
    
    const issues = [];
    let docsSampled = 0;
    
    for (const doc of snapshot.docs) {
      docsSampled++;
      const data = doc.data();
      
      // Validar campos requeridos
      for (const field of requiredFields) {
        if (!(field in data)) {
          issues.push(`Doc ${doc.id.substring(0, 8)}: Missing field '${field}'`);
        }
      }
      
      // Validaciones específicas por colección
      if (collectionName === 'movimientos') {
        const balance = data.previousStock + data.quantity;
        if (balance !== data.currentStock) {
          issues.push(
            `Doc ${doc.id.substring(0, 8)}: Balance ERROR ` +
            `(${data.previousStock} + ${data.quantity} = ${balance}, but got ${data.currentStock})`
          );
        }
      }
      
      if (collectionName === 'envios' || collectionName === 'pedidos') {
        const validStatuses = collectionName === 'envios'
          ? ['borrador', 'en_transito', 'recibido', 'cancelado']
          : ['borrador', 'enviado_a_validacion', 'validado', 'rechazado', 'despachado_parcial', 'despachado_completo', 'cancelado'];
        if (!validStatuses.includes(data.status)) {
          issues.push(`Doc ${doc.id.substring(0, 8)}: Invalid status '${data.status}'`);
        }
      }
      
      if (collectionName === 'productos') {
        if (!data.masterId) {
          issues.push(`Doc ${doc.id.substring(0, 8)}: CRITICAL - Missing masterId`);
        }
      }
    }
    
    return {
      collectionName,
      status: issues.length === 0 ? 'PASS' : issues.length > 2 ? 'FAIL' : 'PARTIAL',
      docsSampled,
      issues: issues.slice(0, 5) // Primeros 5 issues
    };
  } catch (error) {
    return {
      collectionName,
      status: 'ERROR',
      error: error instanceof Error ? error.message : String(error)
    };
  }
}
