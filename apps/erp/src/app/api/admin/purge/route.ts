import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase-admin';

const COLLECTIONS_TO_PURGE = [
    // === Logs y auditoría ===
    'admin_logs',
    'admin_audit_log',
    'audit_log',
    'alertas_auditoria',
    'audit_alerts',
    'logs_auditoria',

    // === Catálogo y productos ===
    'catalogo_maestro',
    'categorias',
    'categorias_v6',
    'marcas',
    'origenes',
    'productos',
    'productos_v6',
    'import_logs',

    // === Clientes y CRM ===
    'clientes',
    'recordatorios_cliente',
    'ventas_perdidas',

    // === Ventas, cotizaciones, créditos ===
    'ventas',
    'cotizaciones',
    'cuentas_corrientes',
    'cuotas',
    'installments',
    'sales',

    // === Compras y proveedores ===
    'compras',
    'purchases',
    'proveedores',
    'cuentas_proveedores',
    'empresas',
    'supplier_payments_history',

    // === Inventario y movimientos ===
    'movimientos',
    'stock_transfers',
    'stockTransfers',
    'transportes',
    'pedidos',
    'envios',

    // === Caja legacy ===
    'turnos_caja',
    'movimientos_caja',
    'gastos_operativos',
    'operational_expenses',

    // === Tesorería v2 ===
    'accounts',
    'cashier_sessions',
    'journal_entries',
    'bank_reconciliation_batches',
    'treasury_config',
    'cash_branch_locks',

    // === Aprobaciones ===
    'pending_void_approvals',
    'pending_discount_approvals',
    'discount_approvals',
    'sale_approvals',
    'expense_approvals',

    // === Analítica ===
    'resumenes_diarios',

    // === Estructura del sistema (purga total) ===
    'config',
    'counters',
    'roles',
];

async function deleteCollection(colName: string): Promise<{ deleted: boolean }> {
    const colRef = adminDb.collection(colName);
    // recursiveDelete borra TODO: documentos + subcolecciones + documentos fantasma
    // No verificamos si está vacío porque los ghost docs no aparecen en queries
    await adminDb.recursiveDelete(colRef);
    console.log(`[Purge] ${colName}: recursively deleted`);
    return { deleted: true };
}

export async function POST(request: NextRequest) {
    try {
        const token = request.headers.get('Authorization')?.split('Bearer ')[1];
        if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const decoded = await adminAuth.verifyIdToken(token);

        if (decoded.role !== 'GERENTE') {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        const branchDoc = await adminDb.collection('branches').doc(decoded.branchId as string).get();
        if (!branchDoc.exists || !branchDoc.data()?.isHQ) {
            return NextResponse.json({ error: 'Solo la casa matriz puede purgar' }, { status: 403 });
        }

        const results: { collection: string; status: string }[] = [];

        for (const colName of COLLECTIONS_TO_PURGE) {
            try {
                await deleteCollection(colName);
                results.push({ collection: colName, status: 'deleted' });
            } catch (error) {
                const msg = error instanceof Error ? error.message : String(error);
                console.error(`[Purge] Error in ${colName}:`, msg);
                results.push({ collection: colName, status: `error: ${msg}` });
            }
        }

        return NextResponse.json({ success: true, results });
    } catch (error: unknown) {
        console.error('[Purge] Fatal error:', error);
        const msg = error instanceof Error ? error.message : 'Unknown error';
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}
