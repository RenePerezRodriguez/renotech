'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { FileDown, Loader2, FileText, FileSpreadsheet, Download, HelpCircle } from 'lucide-react';
import { toast } from 'sonner';
import IndustrialModal from '@/components/common/IndustrialModal';
import { Pedido, PedidoItem, AppConfig } from '@/types';
import {
    PedidoExportService,
    PedidoExportFilters,
    DEFAULT_EXPORT_FILTERS,
    ExportPedidoItem,
} from '@/services/PedidoExportService';
import { ConfigService } from '@/services/ConfigService';
import { BrandService } from '@/services/BrandService';
import { CategoryService } from '@/services/CategoryService';

interface Props {
    isOpen: boolean;
    onClose: () => void;
    pedido: Pedido;
    items: PedidoItem[];
    isGerente: boolean;
    availableMarcas?: string[];
    availableCategorias?: string[];
}

export default function PedidoExportModal({
    isOpen,
    onClose,
    pedido,
    items,
    isGerente,
    availableMarcas = [],
    availableCategorias = [],
}: Props) {
    const [filters, setFilters] = useState<PedidoExportFilters>(() => ({
        ...DEFAULT_EXPORT_FILTERS,
        showHistory: isGerente, // Solo gerente puede ver historial
        showCosts: isGerente,
    }));
    const [generating, setGenerating] = useState<'pdf' | 'csv' | 'xlsx' | null>(null);
    const [loadedMarcas, setLoadedMarcas] = useState<string[]>([]);
    const [loadedCategorias, setLoadedCategorias] = useState<string[]>([]);

    // Reset al abrir
    useEffect(() => {
        if (isOpen) {
            setFilters({
                ...DEFAULT_EXPORT_FILTERS,
                showHistory: isGerente,
                showCosts: isGerente,
            });
            // Cargar listas globales de marcas y categorías (si aún no están)
            if (loadedMarcas.length === 0) {
                BrandService.getBrands()
                    .then(list => setLoadedMarcas(list.map(b => b.nombre).filter(Boolean)))
                    .catch(() => {});
            }
            if (loadedCategorias.length === 0) {
                CategoryService.getCategories()
                    .then(list => setLoadedCategorias(list.map(c => c.nombre).filter(Boolean)))
                    .catch(() => {});
            }
        }
    }, [isOpen, isGerente, loadedMarcas.length, loadedCategorias.length]);

    const update = <K extends keyof PedidoExportFilters>(key: K, value: PedidoExportFilters[K]) => {
        setFilters(prev => ({ ...prev, [key]: value }));
    };

    const dateFromStr = useMemo(
        () => filters.historyFrom ? filters.historyFrom.toISOString().split('T')[0] : '',
        [filters.historyFrom]
    );
    const dateToStr = useMemo(
        () => filters.historyTo ? filters.historyTo.toISOString().split('T')[0] : '',
        [filters.historyTo]
    );

    // Marcas y categorías: priorizar prop, luego catalog global
    const marcas = useMemo(() => {
        if (availableMarcas.length > 0) return availableMarcas;
        return loadedMarcas;
    }, [availableMarcas, loadedMarcas]);

    const categorias = useMemo(() => {
        if (availableCategorias.length > 0) return availableCategorias;
        return loadedCategorias;
    }, [availableCategorias, loadedCategorias]);

    const generate = async (format: 'pdf' | 'csv' | 'xlsx') => {
        setGenerating(format);
        const tId = toast.loading(
            format === 'pdf' ? 'Generando PDF...'
            : format === 'xlsx' ? 'Generando Excel...'
            : 'Generando CSV...'
        );
        try {
            // Forzar showHistory/showCosts a false si no es gerente
            const safeFilters: PedidoExportFilters = {
                ...filters,
                showHistory: isGerente && filters.showHistory,
                showCosts: isGerente && filters.showCosts,
            };

            const exportItems: ExportPedidoItem[] = await PedidoExportService.buildExportItems(
                pedido,
                items,
                safeFilters,
            );

            if (exportItems.length === 0) {
                toast.error('No hay ítems que coincidan con los filtros', { id: tId });
                setGenerating(null);
                return;
            }

            if (format === 'csv') {
                const csv = PedidoExportService.buildCsv(pedido, exportItems, safeFilters);
                PedidoExportService.downloadCsv(`${pedido.codigo}.csv`, csv);
                toast.success('Archivo CSV descargado', { id: tId });
            } else if (format === 'xlsx') {
                await PedidoExportService.downloadXlsx(`${pedido.codigo}.xlsx`, pedido, exportItems, safeFilters);
                toast.success('Archivo Excel descargado', { id: tId });
            } else {
                let config: AppConfig | undefined;
                try {
                    config = (await ConfigService.getConfig(pedido.fromBranchId)) || (await ConfigService.getConfig()) || undefined;
                } catch {
                    config = undefined;
                }

                const { pdf } = await import('@react-pdf/renderer');
                const PedidoExportPDF = (await import('./PedidoExportPDF')).default;
                const blob = await pdf(
                    <PedidoExportPDF pedido={pedido} items={exportItems} filters={safeFilters} config={config} />
                ).toBlob();
                const url = URL.createObjectURL(blob);
                window.open(url, '_blank');
                toast.success('PDF generado', { id: tId });
            }
        } catch (e) {
            console.error('[PedidoExportModal]', e);
            toast.error(e instanceof Error ? e.message : 'Error al exportar', { id: tId });
        } finally {
            setGenerating(null);
        }
    };

    return (
        <IndustrialModal
            isOpen={isOpen}
            onClose={onClose}
            title="Exportar pedido"
            subtitle={`${pedido.codigo} · ${pedido.fromBranchName}`}
            icon={<FileDown size={18} />}
            theme="cobalt"
            maxWidth="max-w-3xl"
            footer={
                <div className="flex flex-wrap gap-2 justify-end">
                    <button
                        type="button"
                        onClick={onClose}
                        className="px-4 py-2 rounded-xl border border-slate-200 dark:border-white/10 text-sm font-bold text-slate-700 dark:text-slate-300"
                        disabled={!!generating}
                    >
                        Cerrar
                    </button>
                    <button
                        type="button"
                        onClick={() => generate('csv')}
                        disabled={!!generating}
                        className="px-4 py-2 rounded-xl bg-emerald-600 text-white text-sm font-bold inline-flex items-center gap-2 disabled:opacity-50"
                        title="CSV plano (sin formato). Útil para importar a otros sistemas."
                    >
                        {generating === 'csv' ? <Loader2 size={14} className="animate-spin" /> : <FileSpreadsheet size={14} />}
                        CSV
                    </button>
                    <button
                        type="button"
                        onClick={() => generate('xlsx')}
                        disabled={!!generating}
                        className="px-4 py-2 rounded-xl bg-green-700 text-white text-sm font-bold inline-flex items-center gap-2 disabled:opacity-50"
                        title="Excel con anchos auto, formato de moneda y encabezados con estilo."
                    >
                        {generating === 'xlsx' ? <Loader2 size={14} className="animate-spin" /> : <FileSpreadsheet size={14} />}
                        Excel
                    </button>
                    <button
                        type="button"
                        onClick={() => generate('pdf')}
                        disabled={!!generating}
                        className="px-4 py-2 rounded-xl bg-cyan-600 text-white text-sm font-bold inline-flex items-center gap-2 disabled:opacity-50"
                    >
                        {generating === 'pdf' ? <Loader2 size={14} className="animate-spin" /> : <FileText size={14} />}
                        Generar PDF
                    </button>
                </div>
            }
        >
            <div className="space-y-5">
                {/* Sección: Visualización */}
                <Section title="Visualización">
                    <CheckRow
                        label="Mostrar costos y precios"
                        checked={filters.showCosts}
                        onChange={(v) => update('showCosts', v)}
                        disabled={!isGerente}
                        hint={!isGerente ? 'Solo GERENTE' : undefined}
                        tooltip="Incluye en el PDF el costo unitario y los precios sin/con factura de cada producto. Información sensible: solo visible para GERENTE."
                    />
                    <CheckRow
                        label="Mostrar historial de compras"
                        checked={filters.showHistory}
                        onChange={(v) => update('showHistory', v)}
                        disabled={!isGerente}
                        hint={!isGerente ? 'Solo GERENTE' : undefined}
                        tooltip="Agrega una columna con las últimas compras de cada producto (fecha, costo y proveedor). Útil para comparar precios y decidir cuánto cotizar."
                    />
                    <CheckRow
                        label="Incluir observación / notas"
                        checked={filters.includeNotes}
                        onChange={(v) => update('includeNotes', v)}
                        tooltip="Muestra la observación general del pedido y las notas individuales de cada ítem en el PDF."
                    />
                    <CheckRow
                        label="Mostrar logo / nombre de empresa"
                        checked={filters.showLogo}
                        onChange={(v) => update('showLogo', v)}
                        tooltip="Imprime el nombre de la empresa configurada en Ajustes en el encabezado del PDF."
                    />
                </Section>

                {/* Sección: Historial (solo gerente y si está activo) */}
                {isGerente && filters.showHistory && (
                    <Section title="Historial de compras">
                        <Field
                            label="Cantidad por producto"
                            tooltip="Cuántas compras anteriores se muestran por cada ítem en la columna Historial. Por ejemplo, 2 = las dos últimas compras (fecha, costo y proveedor)."
                        >
                            <select
                                value={filters.historyCount}
                                onChange={(e) => update('historyCount', Number(e.target.value) as 1 | 2 | 3 | 4 | 5)}
                                className={inputCls}
                            >
                                {[1, 2, 3, 4, 5].map(n => <option key={n} value={n}>{n}</option>)}
                            </select>
                        </Field>
                        <Field
                            label="Sucursal de referencia"
                            tooltip="Define desde qué sucursal se toman las compras del historial. HQ = solo Casa Matriz; Sucursal que despacha = la que va a entregar el pedido; Todas = histórico global."
                        >
                            <select
                                value={filters.historyBranchScope}
                                onChange={(e) => update('historyBranchScope', e.target.value as PedidoExportFilters['historyBranchScope'])}
                                className={inputCls}
                            >
                                <option value="HQ">Solo Casa Matriz (HQ)</option>
                                <option value="PEDIDO_TO">Sucursal que despacha</option>
                                <option value="ALL">Todas las sucursales</option>
                            </select>
                        </Field>
                        <Field
                            label="Desde"
                            tooltip="Límite inferior de fechas para el historial. Déjalo vacío para no filtrar por fecha de inicio."
                        >
                            <input
                                type="date"
                                value={dateFromStr}
                                onChange={(e) => update('historyFrom', e.target.value ? new Date(e.target.value) : undefined)}
                                className={inputCls}
                            />
                        </Field>
                        <Field
                            label="Hasta"
                            tooltip="Límite superior de fechas para el historial. Déjalo vacío para incluir compras hasta hoy."
                        >
                            <input
                                type="date"
                                value={dateToStr}
                                onChange={(e) => update('historyTo', e.target.value ? new Date(e.target.value) : undefined)}
                                className={inputCls}
                            />
                        </Field>
                    </Section>
                )}

                {/* Sección: Filtros y orden */}
                <Section title="Filtros y orden">
                    <Field
                        label="Ordenar por"
                        tooltip="Cómo se ordenan los ítems en el PDF/CSV. Por defecto, los productos con mayor cantidad pedida aparecen primero."
                    >
                        <select
                            value={filters.sortBy}
                            onChange={(e) => update('sortBy', e.target.value as PedidoExportFilters['sortBy'])}
                            className={inputCls}
                        >
                            <option value="quantity-desc">Cantidad (mayor primero)</option>
                            <option value="code-asc">Código (A-Z)</option>
                            <option value="marca-asc">Marca (A-Z)</option>
                            <option value="name-asc">Nombre (A-Z)</option>
                        </select>
                    </Field>
                    <Field
                        label="Filtrar por marca"
                        tooltip="Mostrar solo productos de una marca específica. Selecciona Todas para incluir todas."
                    >
                        <select
                            value={filters.filterMarca || ''}
                            onChange={(e) => update('filterMarca', e.target.value || undefined)}
                            className={inputCls}
                        >
                            <option value="">Todas</option>
                            {marcas.map(m => <option key={m} value={m}>{m}</option>)}
                        </select>
                    </Field>
                    <Field
                        label="Filtrar por categoría"
                        tooltip="Mostrar solo productos de una categoría específica. Selecciona Todas para incluir todas."
                    >
                        <select
                            value={filters.filterCategoria || ''}
                            onChange={(e) => update('filterCategoria', e.target.value || undefined)}
                            className={inputCls}
                        >
                            <option value="">Todas</option>
                            {categorias.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                    </Field>
                    <CheckRow
                        label="Incluir ítems anulados"
                        checked={filters.includeVoided}
                        onChange={(v) => update('includeVoided', v)}
                        tooltip="Por defecto los ítems anulados del pedido se omiten. Actívalo si necesitas un reporte completo con anulaciones."
                    />
                </Section>

                {/* Sección: Formato */}
                <Section title="Formato del documento">
                    <Field
                        label="Tamaño de papel (PDF)"
                        tooltip="Carta y A4 generan el PDF con encabezado de marca completo. Ticket 80mm es para impresoras térmicas (sin logo)."
                    >
                        <select
                            value={filters.paperSize}
                            onChange={(e) => update('paperSize', e.target.value as PedidoExportFilters['paperSize'])}
                            className={inputCls}
                        >
                            <option value="LETTER">Carta (US Letter)</option>
                            <option value="A4">A4</option>
                            <option value="TICKET80">Ticket 80mm</option>
                        </select>
                    </Field>
                </Section>

                <div className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-2 pt-2 border-t border-slate-100 dark:border-white/10">
                    <Download size={12} />
                    El PDF se abre en una nueva pestaña. El CSV se descarga directo (UTF-8 con BOM, separador <strong>;</strong> compatible con Excel ES).
                </div>
            </div>
        </IndustrialModal>
    );
}

const inputCls = 'w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-background text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-cyan-500/40';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <div>
            <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">{title}</div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">{children}</div>
        </div>
    );
}

function Field({ label, tooltip, children }: { label: string; tooltip?: string; children: React.ReactNode }) {
    return (
        <label className="flex flex-col gap-1">
            <span
                className="text-[11px] font-semibold text-slate-600 dark:text-slate-400 inline-flex items-center gap-1"
                title={tooltip}
            >
                {label}
                {tooltip && (
                    <HelpCircle
                        size={12}
                        className="text-slate-400 dark:text-slate-500 cursor-help"
                        aria-label={tooltip}
                    />
                )}
            </span>
            {children}
        </label>
    );
}

function CheckRow({
    label,
    checked,
    onChange,
    disabled,
    hint,
    tooltip,
}: {
    label: string;
    checked: boolean;
    onChange: (v: boolean) => void;
    disabled?: boolean;
    hint?: string;
    tooltip?: string;
}) {
    return (
        <label
            title={tooltip}
            className={`flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 dark:border-white/10 ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:bg-slate-50 dark:hover:bg-white/5'}`}
        >
            <input
                type="checkbox"
                checked={checked}
                onChange={(e) => onChange(e.target.checked)}
                disabled={disabled}
                className="accent-cyan-600"
            />
            <span className="text-sm text-slate-700 dark:text-slate-300 flex-1">{label}</span>
            {tooltip && !hint && (
                <HelpCircle size={12} className="text-slate-400 dark:text-slate-500" />
            )}
            {hint && <span className="text-[10px] text-amber-600 dark:text-amber-400 font-bold uppercase">{hint}</span>}
        </label>
    );
}
