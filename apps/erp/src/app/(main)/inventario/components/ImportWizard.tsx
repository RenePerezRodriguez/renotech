import React, { useState, useRef } from 'react';
import ExcelJS from 'exceljs';
import { Upload, X, Check, FileSpreadsheet, ArrowRight, Settings, AlertCircle, Download, RotateCcw, Tag, Plus } from 'lucide-react';
import { InventoryService } from '@/services/InventoryService';
import { extractImagesFromExcel } from '@/utils/excelHelper';
import { autoCategorize } from '@/utils/autoCategorize';
import { getBrandPrefix, generateProductCode } from '@/utils/productCodeGenerator';
import { FailedImportItem, ImportItem } from '@/types';
import { useBranch } from '@/contexts/BranchContext';
import { useAuth } from '@/contexts/AuthContext';
import { parseProductName } from '@/utils/productNameParser';
import { processAndCompressImage } from '@/utils/imageProcessing';
import { logAdminAction } from '@/lib/audit';
import { toast } from 'sonner';
import { confirmDialog } from '@/components/common/dialogs';
import { localDateStr } from '@/lib/utils';
import IndustrialModal from '@/components/common/IndustrialModal';
import clsx from 'clsx';

interface ImportWizardProps {
    onClose: () => void;
    onImportComplete: () => void;
}

type WizardStep = 'UPLOAD' | 'ANALYSIS' | 'CONFLICTS' | 'IMPORTING' | 'RESULT';

// ---- Helpers para reemplazar xlsx con exceljs ----
async function readWorkbook(file: File): Promise<ExcelJS.Workbook> {
    const data = await file.arrayBuffer();
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(data);
    return wb;
}

function sheetToRows(worksheet: ExcelJS.Worksheet): unknown[][] {
    const rows: unknown[][] = [];
    worksheet.eachRow({ includeEmpty: false }, (row) => {
        const arr: unknown[] = [];
        // row.values es 1-indexed; saltamos índice 0
        const vals = row.values as unknown[];
        for (let i = 1; i < vals.length; i++) {
            const v = vals[i];
            // Normalizar objetos de fórmula/hyperlink
            if (v && typeof v === 'object' && 'result' in (v as Record<string, unknown>)) {
                arr.push((v as { result: unknown }).result);
            } else if (v && typeof v === 'object' && 'text' in (v as Record<string, unknown>)) {
                arr.push((v as { text: unknown }).text);
            } else {
                arr.push(v ?? '');
            }
        }
        rows.push(arr);
    });
    return rows;
}

function sheetToJson(worksheet: ExcelJS.Worksheet): Record<string, unknown>[] {
    const rows = sheetToRows(worksheet);
    if (rows.length < 2) return [];
    const headers = (rows[0] as unknown[]).map(h => String(h ?? '').trim());
    return rows.slice(1).map(r => {
        const obj: Record<string, unknown> = {};
        headers.forEach((h, i) => {
            if (h) obj[h] = (r as unknown[])[i];
        });
        return obj;
    });
}

function downloadXlsxBuffer(buffer: ArrayBuffer, filename: string) {
    const blob = new Blob([buffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

interface Anomaly {
    row: number;
    code: string;
    issue: string;
}

interface InternalDuplicate {
    code: string;
    count: number;
    rows: number[];
}

interface AnalysisResult {
    totalRows: number;
    validRows: number;
    invalidRows: number;
    newColumns: string[];
    duplicates: number;
    internalDuplicates: InternalDuplicate[];
    uniqueProducts: number;
    previewData: Record<string, unknown>[];
    headers: string[];
    anomalies?: Anomaly[];
}

export default function ImportWizard({ onClose, onImportComplete }: ImportWizardProps) {
    // Get current branch context for multi-branch support
    const { currentBranch, isHQ } = useBranch();
    const { user: currentUser, userName } = useAuth();
    const branchId = currentBranch?.id || '';

    const [step, setStep] = useState<WizardStep>('UPLOAD');
    const [file, setFile] = useState<File | null>(null);
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
    const [duplicateStrategy, setDuplicateStrategy] = useState<'OVERWRITE' | 'UPDATE_STOCK_PRICE' | 'IGNORE'>('OVERWRITE');
    const [importLog, setImportLog] = useState<string[]>([]);
    const [importStats, setImportStats] = useState({ created: 0, updated: 0, errors: 0 });
    const [lastBatchId, setLastBatchId] = useState<string | null>(null);
    const [isReverting, setIsReverting] = useState(false);
    const [failedItems, setFailedItems] = useState<FailedImportItem[]>([]);
    const [batchLabel, setBatchLabel] = useState('');
    const [progress, setProgress] = useState({ current: 0, total: 0 });
    const [columnMapping, setColumnMapping] = useState<Record<string, string>>({});
    const [imagesMap, setImagesMap] = useState<Map<number, Blob>>(new Map());
    const [operationDate, setOperationDate] = useState(localDateStr());
    const [operationReason, setOperationReason] = useState('Migración Inicial');
    const [customReason, setCustomReason] = useState(false);

    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            setFile(e.target.files[0]);
            analyzeFile(e.target.files[0]);
        }
    };

    const handleDownloadErrors = async () => {
        if (failedItems.length === 0) return;
        const wb = new ExcelJS.Workbook();
        const ws = wb.addWorksheet('Errores');
        const keys = Object.keys(failedItems[0]);
        ws.columns = keys.map(k => ({ header: k, key: k, width: 20 }));
        const dataToExport = failedItems.map(item => ({
            'ERROR': item.error || '',
            'CODIGO': item.codigo || '',
            'NOMBRE': item.nombre || '',
            'MARCA': item.marca || '',
            'CATEGORIA': item.categoria || '',
            'CODIGO FABRICA': item.codigoFabrica || '',
            'STOCK': item.stock ?? '',
            'PRECIO': item.precio ?? '',
        }));
        ws.addRows(dataToExport as unknown as Record<string, unknown>[]);
        const buffer = await wb.xlsx.writeBuffer();
        downloadXlsxBuffer(buffer as ArrayBuffer, `import_errors_${new Date().toISOString().slice(0, 10)}.xlsx`);
    };

    const handleDownloadTemplate = async () => {
        const headers = [
            'ID RENOTECH', 
            'CODIGO FABRICA', 
            'CODIGO OE', 
            'NOMBRE', 
            'CATEGORIA', 
            'MARCA', 
            'ORIGEN', 
            'STOCK', 
            'COSTO UNITARIO',
            'PRECIO MAYORISTA',
            'PRECIO SIN FACTURA', 
            'PRECIO CON FACTURA', 
            'MIN STOCK',
            'CODIGO DE BARRAS',
            'ID PROVEEDOR'
        ];
        const sampleRow = [
            'RT-1001', 
            'FAB-456', 
            '7701477028', 
            'Filtro de Aceite', 
            'Filtros', 
            'Toyota', 
            'EE.UU.', 
            100, 
            25.00,
            40.00,
            45.00, 
            50.40, 
            10,
            '7700112233',
            'PROV-112'
        ];
        const wb = new ExcelJS.Workbook();
        const ws = wb.addWorksheet('Plantilla');
        ws.addRow(headers);
        ws.addRow(sampleRow);
        const buffer = await wb.xlsx.writeBuffer();
        downloadXlsxBuffer(buffer as ArrayBuffer, 'plantilla_maestra_renotech.xlsx');
    };

    const analyzeFile = async (file: File) => {
        setIsAnalyzing(true);
        setStep('ANALYSIS');

        try {
            const workbook = await readWorkbook(file);
            const sheet = workbook.worksheets[0];
            const jsonData = sheetToRows(sheet);

            if (jsonData.length < 2) {
                throw new Error("El archivo parece estar vacío o no tiene datos.");
            }

            const headers = (jsonData[0] as string[]).map(h => String(h).trim());
            const rows = jsonData.slice(1);

            // 1. Fetch Existing Products (Map of Code -> { id, price, cost })
            const existingMapData = await InventoryService.getProductMapForImport(branchId);
            // Convert to Map for component compatibility
            const existingProductsData = new Map(Object.entries(existingMapData));

            let duplicateCount = 0;
            const anomaliesList: { row: number; code: string; issue: string }[] = [];

            // 2. Process Rows
            const preview = (rows as unknown[][]).slice(0, 5).map((row: unknown[]) => {
                // Basic mapping for preview
                const entry: Record<string, unknown> = {};
                headers.forEach((h: string, i: number) => { entry[h] = row[i]; });
                return entry;
            });

            // Check duplicates & Anomalies
            (rows as unknown[][]).forEach((row: unknown[], index: number) => {
                const rowData: Record<string, unknown> = {};
                headers.forEach((h: string, i: number) => { rowData[h] = row[i]; });

                // Loose mapping helper
                const findVal = (keys: string[]) => {
                    for (const k of keys) {
                        if (rowData[k] !== undefined) return rowData[k];
                    }
                    return undefined;
                };

                const idRenotech = String(findVal(['ID', 'CÓDIGO INTERNO', 'ID RENOTECH', 'CODIGO_INTERNO']) || '').trim().toUpperCase();
                const factoryCode = String(findVal(['CODIGO FABRICA', 'COD. FABRICA', 'REFERENCIA', 'FABRICA', 'SERIAL', 'CÓDIGO FÁBRICA', 'CODIGO', 'CÓDIGO']) || '').trim().toUpperCase();
                const codigoOE = String(findVal(['CODIGO OEM', 'OEM', 'CODIGO OE', 'OE', 'NUMERO ORIGINAL', 'REF. ORIGINAL', 'CÓDIGO OE', 'CÓDIGO OEM']) || '').trim().toUpperCase();

                const existingData = (idRenotech && existingProductsData.get(idRenotech)) ||
                    (factoryCode && existingProductsData.get(factoryCode)) ||
                    (codigoOE && existingProductsData.get(codigoOE)) as { id: string, codigo: string, price: number, cost: number } | undefined;

                if (existingData) {
                    duplicateCount++;

                    // Anomaly Check
                    const rawPrice = findVal(['PRECIO C/F', 'PRECIO', 'PRECIO CON FACTURA', 'PRECIO_CON_FACTURA', 'PRECIO VENTA', 'PRECIO UNITARIO']);
                    const newPrice = typeof rawPrice === 'string' ? parseFloat(rawPrice.replace(/[^\d.-]/g, '')) : (Number(rawPrice) || 0);

                    const rawCost = findVal(['COSTO', 'COSTO UNITARIO', 'PRECIO COMPRA', 'P. COMPRA', 'COMPRA', 'COSTO_UNITARIO']);
                    const newCost = typeof rawCost === 'string' ? parseFloat(rawCost.replace(/[^\d.-]/g, '')) : (Number(rawCost) || 0);

                    if (newPrice > 0) {
                        // Spike > 500%
                        if (existingData.price > 0 && newPrice > existingData.price * 5) {
                            anomaliesList.push({ row: index + 2, code: idRenotech || factoryCode || codigoOE, issue: `Precio subió excesivamente (${existingData.price} -> ${newPrice})` });
                        }
                        // Below Cost
                        const costToCompare = newCost > 0 ? newCost : existingData.cost;
                        if (costToCompare > 0 && newPrice < costToCompare) {
                            anomaliesList.push({ row: index + 2, code: idRenotech || factoryCode || codigoOE, issue: `Precio menor al costo (${newPrice} < ${costToCompare})` });
                        }
                    }
                }
            });

            const compositeCounter = new Map<string, number[]>();
            (rows as unknown[][]).forEach((row: unknown[], index: number) => {
                const rData: Record<string, unknown> = {};
                headers.forEach((h: string, i: number) => { rData[h] = row[i]; });
                const fVal = (keys: string[]) => { for (const k of keys) { if (rData[k] !== undefined) return rData[k]; } return undefined; };
                
                const oe = String(fVal(['CODIGO OEM', 'OEM', 'CODIGO OE', 'OE', 'NUMERO ORIGINAL', 'REF. ORIGINAL', 'CÓDIGO OE', 'CÓDIGO OEM']) || '').trim().toUpperCase();
                const fab = String(fVal(['CODIGO FABRICA', 'COD. FABRICA', 'REFERENCIA', 'FABRICA', 'SERIAL', 'CÓDIGO FÁBRICA', 'CODIGO', 'CÓDIGO']) || '').trim().toUpperCase();
                const nom = String(fVal(['DESCRIPCION', 'PRODUCTO', 'NOMBRE', 'TITULAR', 'DESCRIPCIÓN']) || '').trim().toUpperCase();
                const mar = String(fVal(['MARCA', 'FABRICANTE', 'LABORATORIO']) || '').trim().toUpperCase();
                
                if (!oe && !fab && !nom && !mar) return;
                const compositeKey = `${oe}|||${fab}|||${nom}|||${mar}`;
                compositeCounter.set(compositeKey, [...(compositeCounter.get(compositeKey) || []), index + 2]);
            });

            const internalDups: InternalDuplicate[] = [];
            for (const [key, rowNums] of compositeCounter) {
                if (rowNums.length > 1) {
                    // Show a readable label: Code + Name + Marca
                    const [oe, fab, nom, mar] = key.split('|||');
                    const label = `${oe || fab || 'S/C'} - ${nom.slice(0, 40)} [${mar || 'Sin Marca'}]`;
                    internalDups.push({ code: label, count: rowNums.length, rows: rowNums });
                }
            }
            const totalMerged = internalDups.reduce((sum, d) => sum + (d.count - 1), 0);
            const uniqueCount = rows.length - totalMerged;

            // Detect new columns
            const knownColumns = [
                'ID', 'CODIGO FABRICA', 'COD. FABRICA', 'REFERENCIA', 'FABRICA', 'SERIAL', 'CÓDIGO FÁBRICA', 'CODIGO', 'CÓDIGO',
                'CODIGO OEM', 'OEM', 'CODIGO OE', 'OE', 'NUMERO ORIGINAL', 'REF. ORIGINAL', 'CÓDIGO OE', 'CÓDIGO OEM',
                'DESCRIPCION', 'PRODUCTO', 'NOMBRE', 'TITULAR', 'DESCRIPCIÓN',
                'PRECIO', 'PRECIO C/F', 'PRECIO CON FACTURA', 'PRECIO_CON_FACTURA',
                'PRECIO S/F', 'PRECIO SIN FACTURA', 'PRECIO_SIN_FACTURA',
                'STOCK', 'CANTIDAD', 'EXISTENCIA', 'SALDO',
                'COSTO', 'COSTO UNITARIO', 'PRECIO COMPRA', 'P. COMPRA', 'COMPRA', 'COSTO_UNITARIO',
                'MARCA', 'FABRICANTE', 'LABORATORIO',
                'ORIGEN', 'PROCEDENCIA',
                'CATEGORIA', 'CATEGORÍA',
                'FOTOGRAFIA', 'IMAGEN', 'FOTO',
                'UBICACION', 'UBICACIÓN', 'ESTANTE', 'POSICION', 'UBIC',
                'TOTAL COMPRA', 'TOTAL_COMPRA' // Added to ignore officially
            ];

            const newCols = headers.filter(h => {
                const upper = h.toUpperCase().trim();
                return !knownColumns.some(k => upper === k || upper.includes(k)); // Loose matching
            });

            // Extract Images
            try {
                const imgs = await extractImagesFromExcel(file);
                setImagesMap(imgs);
            } catch {
                // Non-critical: images are optional
            }

            setAnalysis({
                totalRows: rows.length,
                validRows: rows.length,
                invalidRows: 0,
                newColumns: newCols,
                duplicates: duplicateCount,
                internalDuplicates: internalDups,
                uniqueProducts: uniqueCount,
                anomalies: anomaliesList,
                previewData: preview,
                headers: headers
            });

        } catch (error) {
            const msg = error instanceof Error ? error.message : "Error desconocido";
            toast.error("Error analizando el archivo: " + msg);
            setStep('UPLOAD');
        } finally {
            setIsAnalyzing(false);
        }
    };

    const handleImport = async () => {
        if (!analysis || !file || !analysis.headers) return;
        if (!branchId) {
            toast.error('No hay sucursal seleccionada. No se puede importar.');
            return;
        }

        setStep('IMPORTING');
        setImportLog(prev => [...prev, "Iniciando importación...", `Estrategia: ${duplicateStrategy}`]);
        let existingCodes: string[] = [];
        let fullMap: Record<string, { id: string, codigo: string, price: number, cost: number }> = {};
        try {
            fullMap = await InventoryService.getProductMapForImport(branchId);
            existingCodes = Object.keys(fullMap);
        } catch {
            // Non-critical: pre-fetch codes is optimization
        }

        // Helper function to get max code number for a prefix from existing products
        const getMaxCodeNumberForPrefix = (prefix: string): number => {
            let max = 0;
            const pattern = new RegExp(`^${prefix}-(\\d+)$`, 'i');
            for (const code of existingCodes) {
                const match = code.match(pattern);
                if (match) {
                    const num = parseInt(match[1], 10);
                    if (num > max) max = num;
                }
            }
            return max;
        };

        // Track sequential numbers per brand prefix during this import
        const brandCodeCounters: Record<string, number> = {};

        try {
            const workbook = await readWorkbook(file);
            const sheet = workbook.worksheets[0];
            const jsonData = sheetToJson(sheet);

            interface RowData {
                [key: string]: unknown;
            }

            const productsToImport: ImportItem[] = [];

            for (const row of jsonData as RowData[]) {
                // Map using the interface roughly based on known headers
                const rowData: Record<string, unknown> = {};
                // Normalize keys for mapping (Uppercase and Trim)
                Object.keys(row).forEach(k => {
                    rowData[k.toUpperCase().trim()] = row[k];
                });

                // Helper to find value by multiple keys (Case-insensitive)
                const findVal = (keys: string[]) => {
                    for (const k of keys) {
                        const uppercased = k.toUpperCase().trim();
                        if (rowData[uppercased] !== undefined) return rowData[uppercased];
                    }
                    return undefined;
                };

                const rawId = String(findVal(['ID', 'CÓDIGO INTERNO', 'ID RENOTECH', 'CODIGO_INTERNO']) || '').trim().toUpperCase();
                const rawFabrica = String(findVal(['CODIGO FABRICA', 'COD. FABRICA', 'REFERENCIA', 'FABRICA', 'SERIAL', 'CÓDIGO FÁBRICA', 'CODIGO', 'CÓDIGO']) || '').trim().toUpperCase();
                const codigoOE = String(findVal(['CODIGO OEM', 'OEM', 'CODIGO OE', 'OE', 'NUMERO ORIGINAL', 'REF. ORIGINAL', 'CÓDIGO OE', 'CÓDIGO OEM']) || '').trim().toUpperCase();
                const rawNombre = String(findVal(['DESCRIPCION', 'PRODUCTO', 'NOMBRE', 'TITULAR', 'DESCRIPCIÓN']) || '').trim();
                const marca = String(findVal(['MARCA', 'FABRICANTE', 'LABORATORIO']) || '').trim();

                // Apply Smart Name Cleaning & Description Extraction
                const { baseName: nombre, newDesc: extractedDesc } = parseProductName(rawNombre);


                if (!nombre && !rawId && !rawFabrica && !codigoOE) continue; // Skip empty rows

                // Auto-generate code if ID not provided in Excel or NOT resolved internally
                const existingData = (rawId && fullMap[rawId]) ||
                    (rawFabrica && fullMap[rawFabrica]) ||
                    (codigoOE && fullMap[codigoOE]);

                let codigo = rawId;
                
                // Si la BD actual ya conoce este código OE o Fábrica, usamos obligatoriamente su Código oficial.
                if (existingData && existingData.codigo) {
                    codigo = existingData.codigo;
                }

                if (!codigo) {
                    // Get brand prefix and generate code
                    const prefix = getBrandPrefix(marca);
                    // Track sequential numbers per brand prefix during this import
                    if (brandCodeCounters[prefix] === undefined) {
                        brandCodeCounters[prefix] = getMaxCodeNumberForPrefix(prefix);
                    }
                    brandCodeCounters[prefix]++;
                    codigo = generateProductCode(marca, brandCodeCounters[prefix]);
                }

                // Auto-categorize based on product name if no category provided in Excel
                const explicitCategory = String(findVal(['CATEGORIA', 'CATEGORÍA']) || '').trim();
                const autoCategory = autoCategorize(nombre);
                const rawCategory = explicitCategory || autoCategory || 'General';
                
                // Normalización Title Case (Evita "filtro" vs "Filtro")
                const finalCategory = rawCategory.trim().toLowerCase().replace(/\b\w/g, (c: string) => c.toUpperCase());

                const parseNumeric = (val: unknown): number => {
                    if (val === undefined || val === null) return 0;
                    if (typeof val === 'number') return isNaN(val) ? 0 : val;
                    const parsed = parseFloat(String(val).replace(/[^\d.-]/g, ''));
                    return isNaN(parsed) ? 0 : parsed;
                };

                const mappedProduct: ImportItem = {
                    codigo: codigo,
                    codigoFabrica: rawFabrica,
                    codigoOE: codigoOE,
                    nombre: nombre,
                    marca: marca,
                    categoria: finalCategory,
                    stock: parseNumeric(findVal(['STOCK', 'CANTIDAD', 'EXISTENCIA', 'SALDO'])),
                    costo: parseNumeric(findVal(['COSTO', 'COSTO UNITARIO', 'PRECIO COMPRA', 'P. COMPRA', 'COMPRA', 'COSTO_UNITARIO'])),
                    precioConFactura: parseNumeric(findVal(['PRECIO C/F', 'PRECIO', 'PRECIO CON FACTURA', 'PRECIO_CON_FACTURA', 'PRECIO VENTA', 'PRECIO UNITARIO'])),
                    precioSinFactura: parseNumeric(findVal(['PRECIO S/F', 'PRECIO SIN FACTURA', 'PRECIO_SIN_FACTURA'])),
                    precioMayorista: parseNumeric(findVal(['PRECIO MAYORISTA', 'MAYORISTA', 'P. MAYORISTA'])),
                    origen: String(findVal(['ORIGEN', 'PROCEDENCIA', 'PROCEDENCIA ORIGEN']) || '').trim(),
                    ubicacionFisica: String(findVal(['UBICACION', 'UBICACIÓN', 'ESTANTE', 'POSICION', 'UBIC']) || '').trim(),
                    descripcion: extractedDesc,
                    imagenUrl: '', 
                    minStock: parseNumeric(findVal(['MIN STOCK', 'STOCK MINIMO', 'MINIMO', 'ALERTA STOCK']) || 5),
                    barcode: String(findVal(['CODIGO DE BARRAS', 'BARCODE', 'EAN', 'UPC']) || '').trim(),
                    supplierId: String(findVal(['ID PROVEEDOR', 'PROVEEDOR', 'SUPPLIER']) || '').trim(),
                    unidad: 'PZ',
                    isActive: true,
                    branchId: branchId
                };

                // Dynamic Columns (Industrial Flex-Schema)
                Object.keys(columnMapping).forEach(col => {
                    const action = columnMapping[col];
                    if (action === 'ignore') return;

                    const val = rowData[col];
                    if (val !== undefined) {
                        if (action === 'number') {
                            mappedProduct[col] = Number(val) || 0;
                        } else {
                            mappedProduct[col] = String(val).trim();
                        }
                    }
                });

                productsToImport.push(mappedProduct);
            }

            setImportLog(prev => [...prev, `Procesando ${productsToImport.length} productos...`]);

            // Upload Images
            if (imagesMap.size > 0) {
                setImportLog(prev => [...prev, `Detectadas ${imagesMap.size} imágenes. Subiendo a la nube...`]);
                let uploadedCount = 0;
                for (let i = 0; i < productsToImport.length; i++) {
                    const blob = imagesMap.get(i + 1);
                    if (blob) {
                        try {
                            const product = productsToImport[i];
                            
                            // Compress to WebP before upload
                            const compressedBlob = await processAndCompressImage(blob);
                            const fileName = `products/import_${Date.now()}_${product.codigo || i}.webp`;
                            
                            const url = await InventoryService.uploadImage(compressedBlob, fileName);
                            product.imagenUrl = url;
                            uploadedCount++;
                            if (uploadedCount % 10 === 0) setImportLog(prev => [...prev, `... ${uploadedCount} imágenes subidas`]);
                        } catch {
                            // Non-critical: image upload failure doesn't block import
                        }
                    }
                }
                setImportLog(prev => [...prev, `Carga de imágenes completada (${uploadedCount}).`]);
            }

            // Call Service with Strategy
            const result = await InventoryService.bulkImportProducts(
                productsToImport,
                branchId,
                duplicateStrategy,
                (current: number, total: number) => setProgress({ current, total }),
                isHQ,
                {
                    operationDate: operationDate,
                    reason: operationReason,
                    userId: currentUser?.uid,
                    userName: userName ?? undefined
                }
            );

            setImportStats({ created: result.created, updated: result.updated, errors: result.errors });

            if (result.failedItems && result.failedItems.length > 0) {
                setFailedItems(result.failedItems);
            } else {
                setFailedItems([]);
            }

            if (result.batchId) setLastBatchId(result.batchId);

            setStep('RESULT');
            await logAdminAction(
                currentUser?.uid || '?',
                currentUser?.email || '?',
                'BULK_IMPORT',
                result.batchId || '?',
                branchId,
                `Lote: ${batchLabel || 'Sin nombre'}, Creados: ${result.created}, Actualizados: ${result.updated}`
            );
            onImportComplete();

        } catch (error) {
            const msg = error instanceof Error ? error.message : "Error desconocido";
            setImportLog(prev => [...prev, `Error: ${msg}`]);
            toast.error("Falló la importación: " + msg);
            setStep('ANALYSIS');
        }
    };

    const handleUndo = async () => {
        if (!lastBatchId) return;
        const ok = await confirmDialog({
            title: 'Deshacer importación',
            message: 'Se eliminarán los productos creados. Las actualizaciones de stock NO se revertirán.',
            variant: 'danger',
            confirmText: 'Deshacer',
        });
        if (!ok) return;

        setIsReverting(true);
        try {
            const count = await InventoryService.revertBatchImport(lastBatchId, branchId);
            setImportLog(prev => [...prev, `Deshaciendo importación... ${count} productos eliminados.`]);
            toast.success(`Se deshizo la importación. ${count} productos eliminados.`);
            setLastBatchId(null);
            onClose(); // Close wizard after undo
        } catch (error) {
            const msg = error instanceof Error ? error.message : "Error desconocido";
            toast.error("Error al deshacer: " + msg);
        } finally {
            setIsReverting(false);
        }
    };

    return (
        <IndustrialModal
            isOpen={true}
            onClose={onClose}
            title="IMPORTADOR DE INVENTARIO"
            subtitle={
                step === 'UPLOAD' ? "Paso 1: Selección de Archivo" :
                step === 'ANALYSIS' ? "Paso 2: Análisis y Validación" :
                step === 'CONFLICTS' ? "Paso 3: Configuración de Datos" :
                step === 'IMPORTING' ? "Procesando Importación..." :
                "Resumen de Resultados Finales"
            }
            icon={<FileSpreadsheet size={22} className="text-emerald-500" />}
            maxWidth="max-w-5xl"
        >


                {/* Content */}
                <div className="flex-1 overflow-y-auto p-6">

                    {/* STEP 1: UPLOAD */}
                    {step === 'UPLOAD' && (
                        <div className="h-full flex flex-col items-center justify-center space-y-10 py-10">
                            <div
                                onClick={() => fileInputRef.current?.click()}
                                className="w-full max-w-2xl h-80 border-2 border-dashed border-slate-200 dark:border-white/10 rounded-3xl flex flex-col items-center justify-center cursor-pointer hover:border-emerald-500 hover:bg-emerald-50/50 dark:hover:bg-emerald-500/5 transition-all group relative overflow-hidden bg-slate-50/50 dark:bg-white/5 shadow-inner"
                            >
                                <div className="absolute inset-0 bg-linear-to-br from-emerald-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                                <div className="p-6 bg-emerald-500/10 dark:bg-emerald-500/20 rounded-3xl mb-6 group-hover:scale-110 group-hover:rotate-3 transition-all duration-500 shadow-2xl shadow-emerald-500/20">
                                    <Upload className="w-12 h-12 text-emerald-600 dark:text-emerald-400" />
                                </div>
                                <h3 className="text-2xl font-black text-slate-800 dark:text-white uppercase tracking-tight">Cargar Archivo Excel</h3>
                                <p className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mt-3">Soporta formatos .xlsx y .xls</p>
                            </div>
                            <input
                                type="file"
                                ref={fileInputRef}
                                className="hidden"
                                accept=".xlsx, .xls"
                                onChange={handleFileSelect}
                            />

                            <div className="flex gap-4">
                                <button
                                    onClick={handleDownloadTemplate}
                                    className="flex items-center gap-3 px-8 py-4 bg-white/50 dark:bg-white/5 hover:bg-white dark:hover:bg-white/10 rounded-2xl text-[10px] font-black uppercase tracking-widest text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-white/10 transition-all shadow-sm hover:-translate-y-0.5"
                                >
                                    <Download size={16} /> Bajar Plantilla Maestra
                                </button>
                            </div>
                        </div>
                    )}

                    {/* STEP 2: ANALYSIS */}
                    {step === 'ANALYSIS' && isAnalyzing && (
                        <div className="flex flex-col items-center justify-center h-64">
                            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mb-4"></div>
                            <p className="text-lg font-medium animate-pulse">Analizando archivo...</p>
                            <p className="text-sm text-slate-500">Buscando columnas, validando tipos y detectando duplicados.</p>
                        </div>
                    )}

                    {step === 'ANALYSIS' && !isAnalyzing && analysis && (
                        <div className="space-y-8 p-2">
                            {/* Stats Cards V2 */}
                            <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
                                <div className="bg-emerald-500/5 dark:bg-emerald-500/10 p-6 rounded-3xl border border-emerald-500/20 shadow-sm transition-all hover:bg-emerald-500/10">
                                    <div className="text-emerald-600 dark:text-emerald-400 text-[10px] font-black uppercase tracking-widest mb-1">Filas</div>
                                    <div className="text-3xl font-black text-slate-900 dark:text-white leading-none">{analysis.totalRows}</div>
                                </div>
                                <div className={`p-6 rounded-3xl border shadow-sm transition-all ${analysis.internalDuplicates.length > 0 ? 'bg-amber-500/5 dark:bg-amber-500/10 border-amber-500/20' : 'bg-emerald-500/5 dark:bg-emerald-500/10 border-emerald-500/20'}`}>
                                    <div className={`text-[10px] font-black uppercase tracking-widest mb-1 ${analysis.internalDuplicates.length > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400'}`}>Únicos</div>
                                    <div className="text-3xl font-black text-slate-900 dark:text-white leading-none">{analysis.uniqueProducts}</div>
                                    {analysis.internalDuplicates.length > 0 && <div className="text-[9px] text-amber-500 font-black mt-2 uppercase tracking-tighter">-{analysis.internalDuplicates.reduce((s, d) => s + (d.count - 1), 0)} fusiones</div>}
                                </div>
                                <div className={`p-6 rounded-3xl border shadow-sm transition-all ${analysis.duplicates > 0 ? 'bg-blue-500/5 dark:bg-blue-500/10 border-blue-500/20' : 'bg-slate-500/5 dark:bg-white/5 border-slate-200 dark:border-white/10'}`}>
                                    <div className={`text-[10px] font-black uppercase tracking-widest mb-1 ${analysis.duplicates > 0 ? 'text-blue-600 dark:text-blue-400' : 'text-slate-500'}`}>A Actualizar</div>
                                    <div className="text-3xl font-black text-slate-900 dark:text-white leading-none">{analysis.duplicates}</div>
                                </div>
                                <div className={`p-6 rounded-3xl border shadow-sm transition-all ${(analysis.uniqueProducts - analysis.duplicates) > 0 ? 'bg-indigo-500/5 dark:bg-indigo-500/10 border-indigo-500/20' : 'bg-slate-500/5 dark:bg-white/5 border-slate-200 dark:border-white/10'}`}>
                                    <div className={`text-[10px] font-black uppercase tracking-widest mb-1 ${(analysis.uniqueProducts - analysis.duplicates) > 0 ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-500'}`}>Nuevas</div>
                                    <div className="text-3xl font-black text-slate-900 dark:text-white leading-none">{analysis.uniqueProducts - analysis.duplicates}</div>
                                </div>
                                <div className={`p-6 rounded-3xl border shadow-sm transition-all ${analysis.anomalies && analysis.anomalies.length > 0 ? 'bg-rose-500/10 border-rose-500/30 animate-pulse' : 'bg-slate-500/5 dark:bg-white/5 border-slate-200 dark:border-white/10'}`}>
                                    <div className="text-rose-600 dark:text-rose-400 text-[10px] font-black uppercase tracking-widest mb-1">Alertas</div>
                                    <div className="text-3xl font-black text-slate-900 dark:text-white leading-none">{analysis.anomalies?.length || 0}</div>
                                </div>
                            </div>

                            {/* Anomalies Detected Details */}
                            {analysis.anomalies && analysis.anomalies.length > 0 && (
                                <div className="bg-rose-500/5 dark:bg-rose-500/10 p-8 rounded-3xl border border-rose-500/20 shadow-xl overflow-hidden relative">
                                    <div className="absolute top-0 right-0 w-32 h-32 bg-rose-500/10 blur-3xl -mr-16 -mt-16" />
                                    <h4 className="text-sm font-black uppercase tracking-[0.2em] flex items-center gap-3 mb-6 text-rose-600 dark:text-rose-400">
                                        <AlertCircle size={20} strokeWidth={3} />
                                        Alerta de Precios Critica
                                    </h4>
                                    <div className="max-h-52 overflow-y-auto space-y-3 pr-4 custom-scrollbar">
                                        {analysis.anomalies.map((anom: Anomaly, idx: number) => (
                                            <div key={idx} className="flex justify-between items-center bg-white/40 dark:bg-black/20 backdrop-blur-md p-4 rounded-2xl border border-rose-500/10 hover:border-rose-500/30 transition-all">
                                                <div className="flex flex-col">
                                                    <span className="font-black text-[10px] uppercase tracking-widest text-rose-500/80 mb-1">Código Affected</span>
                                                    <span className="font-mono text-sm font-black text-slate-900 dark:text-white">{anom.code}</span>
                                                </div>
                                                <span className="text-xs font-bold text-slate-600 dark:text-slate-400">{anom.issue}</span>
                                            </div>
                                        ))}
                                    </div>
                                    <p className="text-[10px] font-black uppercase tracking-widest text-rose-500/60 mt-6 text-center italic">Recomendamos revisar el archivo Excel o ajustar la estrategia de duplicados.</p>
                                </div>
                            )}

                            {/* Internal Duplicates Warning */}
                            {analysis.internalDuplicates.length > 0 && (
                                <div className="bg-amber-500/5 dark:bg-amber-500/10 p-8 rounded-3xl border border-amber-500/20 shadow-xl">
                                    <h4 className="text-sm font-black uppercase tracking-[0.2em] flex items-center gap-3 mb-6 text-amber-600 dark:text-amber-400">
                                        <RotateCcw size={20} className="rotate-45" strokeWidth={3} />
                                        Fusiones Internas Detectadas ({analysis.internalDuplicates.length})
                                    </h4>
                                    <div className="max-h-52 overflow-y-auto space-y-3 pr-4 custom-scrollbar">
                                        {analysis.internalDuplicates.map((dup, idx) => (
                                            <div key={idx} className="flex justify-between items-center bg-white/40 dark:bg-black/20 p-4 rounded-2xl border border-amber-500/10">
                                                <div className="flex flex-col">
                                                    <span className="font-black text-[10px] uppercase tracking-widest text-amber-500/80 mb-1">Referencia</span>
                                                    <span className="font-mono text-sm font-black text-slate-900 dark:text-white">{dup.code}</span>
                                                </div>
                                                <span className="text-[10px] font-black uppercase text-slate-500/60 tracking-widest">Filas: {dup.rows.join(', ')}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* New Columns Alert */}
                            {analysis.newColumns.length > 0 && (
                                <div className="bg-indigo-500/5 dark:bg-indigo-500/10 p-8 rounded-3xl border border-indigo-500/20 shadow-xl">
                                    <h4 className="text-sm font-black uppercase tracking-[0.2em] flex items-center gap-3 mb-6 text-indigo-600 dark:text-indigo-400">
                                        <Settings size={20} strokeWidth={3} />
                                        Mapeo de Atributos Personalizados
                                    </h4>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        {analysis.newColumns.map(col => (
                                            <div key={col} className="flex items-center justify-between p-4 bg-white/40 dark:bg-black/20 backdrop-blur-md rounded-2xl border border-indigo-500/10">
                                                <span className="font-black text-[10px] uppercase tracking-widest text-slate-900 dark:text-white wrap-break-word pr-2">{col}</span>
                                                <select
                                                    value={columnMapping[col] || 'text'}
                                                    onChange={(e) => setColumnMapping(prev => ({ ...prev, [col]: e.target.value }))}
                                                    className="appearance-none bg-indigo-500/10 dark:bg-white/5 border border-indigo-500/20 rounded-xl px-4 py-2 text-[10px] font-black uppercase tracking-widest text-indigo-600 dark:text-indigo-400 outline-none focus:ring-2 focus:ring-indigo-500/30 transition-all cursor-pointer shadow-inner"
                                                >
                                                    <option value="text">String</option>
                                                    <option value="number">Numeric</option>
                                                    <option value="ignore">Ignore</option>
                                                </select>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Duplicate Strategy V2 */}
                            <div className="bg-white/40 dark:bg-white/5 backdrop-blur-md p-8 rounded-3xl border border-slate-200 dark:border-white/10 shadow-xl mt-8">
                                <h4 className="text-sm font-black uppercase tracking-[0.2em] flex items-center gap-3 mb-6 text-slate-800 dark:text-white">
                                    <Settings size={20} strokeWidth={3} />
                                    Estrategia de Inteligencia de Datos
                                </h4>
                                <div className="grid grid-cols-1 gap-3">
                                    {([
                                        { id: 'OVERWRITE', title: 'Sobrescritura Total', desc: 'Recomendado para reimportaciones. Reemplaza stock, precios y datos con los del Excel.', activeClass: 'border-emerald-500 bg-emerald-500/10 shadow-lg shadow-emerald-500/5', radioClass: 'border-emerald-500 bg-emerald-500', textClass: 'text-emerald-600 dark:text-emerald-400' },
                                        { id: 'UPDATE_STOCK_PRICE', title: 'Abastecimiento (Suma Stock)', desc: 'SUMA las cantidades del Excel al stock actual. Ideal para registrar compras nuevas.', activeClass: 'border-amber-500 bg-amber-500/10 shadow-lg shadow-amber-500/5', radioClass: 'border-amber-500 bg-amber-500', textClass: 'text-amber-600 dark:text-amber-400' },
                                        { id: 'IGNORE', title: 'Solo Nuevos Registros', desc: 'Omite productos existentes y solo crea registros que no están en el sistema.', activeClass: 'border-slate-500 bg-slate-500/10 shadow-lg shadow-slate-500/5', radioClass: 'border-slate-500 bg-slate-500', textClass: 'text-slate-600 dark:text-slate-400' }
                                    ] as const).map((strat) => (
                                        <label key={strat.id} className={clsx("flex items-start gap-4 p-5 rounded-2xl border-2 cursor-pointer transition-all hover:translate-x-1", duplicateStrategy === strat.id ? strat.activeClass : 'border-slate-100 dark:border-white/10 bg-slate-50/50 dark:bg-black/20 text-slate-400 opacity-60 hover:opacity-100')}>
                                            <input
                                                type="radio"
                                                name="strategy"
                                                checked={duplicateStrategy === strat.id}
                                                onChange={() => setDuplicateStrategy(strat.id as typeof duplicateStrategy)}
                                                className="hidden"
                                            />
                                            <div className={clsx("w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 mt-0.5", duplicateStrategy === strat.id ? strat.radioClass : 'border-slate-300 dark:border-white/10')}>
                                                {duplicateStrategy === strat.id && <div className="w-2 h-2 bg-white rounded-full" />}
                                            </div>
                                            <div>
                                                <div className={clsx("text-xs font-black uppercase tracking-widest", duplicateStrategy === strat.id ? strat.textClass : 'text-slate-500')}>{strat.title}</div>
                                                <div className="text-[11px] font-bold text-slate-500 mt-1 leading-relaxed">{strat.desc}</div>
                                            </div>
                                        </label>
                                    ))}
                                </div>
                            </div>

                            {/* Batch Label V2 */}
                            <div className="bg-slate-900 dark:bg-black/40 p-8 rounded-3xl border border-white/5 shadow-2xl mt-8">
                                <h4 className="text-sm font-black uppercase tracking-[0.2em] flex items-center gap-3 mb-6 text-white">
                                    <Tag size={20} strokeWidth={3} className="text-yellow-500" />
                                    Identificador de Lote
                                </h4>
                                <input
                                    type="text"
                                    placeholder="Ej: ABASTECIMIENTO_ABRIL_2024"
                                    value={batchLabel}
                                    onChange={(e) => setBatchLabel(e.target.value)}
                                    className="w-full bg-white/5 border border-white/10 rounded-2xl px-6 py-4 text-sm font-black text-white uppercase tracking-widest outline-none focus:ring-4 focus:ring-yellow-500/20 focus:border-yellow-500/50 transition-all placeholder:text-white/20 shadow-inner"
                                />
                            </div>

                            {/* Fecha y Motivo de Operación */}
                            <div className="bg-blue-950 dark:bg-blue-950/60 p-8 rounded-3xl border border-blue-500/10 shadow-2xl mt-8">
                                <h4 className="text-sm font-black uppercase tracking-[0.2em] flex items-center gap-3 mb-2 text-white">
                                    <FileSpreadsheet size={20} strokeWidth={3} className="text-blue-400" />
                                    Registro en Kardex
                                </h4>
                                <p className="text-[10px] font-bold text-blue-300/60 mb-6">Estos datos se registrarán como movimiento de inventario en el historial de cada producto.</p>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                        <label className="text-[10px] font-black text-blue-300/80 uppercase tracking-widest block mb-2">Fecha de Operación</label>
                                        <input
                                            type="date"
                                            value={operationDate}
                                            onChange={(e) => setOperationDate(e.target.value)}
                                            className="w-full bg-white/5 border border-white/10 rounded-2xl px-6 py-4 text-sm font-black text-white tracking-widest outline-none focus:ring-4 focus:ring-blue-500/20 focus:border-blue-500/50 transition-all shadow-inner"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-[10px] font-black text-blue-300/80 uppercase tracking-widest block mb-2">Motivo Estratégico</label>
                                        {!customReason ? (
                                            <select
                                                value={operationReason}
                                                onChange={(e) => {
                                                    if (e.target.value === '__custom__') {
                                                        setCustomReason(true);
                                                        setOperationReason('');
                                                    } else {
                                                        setOperationReason(e.target.value);
                                                    }
                                                }}
                                                className="w-full bg-white/5 border border-white/10 rounded-2xl px-6 py-4 text-sm font-black text-white uppercase tracking-widest outline-none focus:ring-4 focus:ring-blue-500/20 focus:border-blue-500/50 transition-all shadow-inner appearance-none cursor-pointer"
                                            >
                                                <option value="Migración Inicial" className="bg-slate-900 text-white">Migración Inicial</option>
                                                <option value="Reposición de Stock" className="bg-slate-900 text-white">Reposición de Stock</option>
                                                <option value="Inventario Físico" className="bg-slate-900 text-white">Inventario Físico</option>
                                                <option value="Compra a Proveedor" className="bg-slate-900 text-white">Compra a Proveedor</option>
                                                <option value="Ajuste Contable" className="bg-slate-900 text-white">Ajuste Contable</option>
                                                <option value="__custom__" className="bg-slate-900 text-white">Personalizar...</option>
                                            </select>
                                        ) : (
                                            <div className="flex gap-2">
                                                <input
                                                    type="text"
                                                    value={operationReason}
                                                    onChange={(e) => setOperationReason(e.target.value)}
                                                    placeholder="Escribe el motivo..."
                                                    autoFocus
                                                    className="flex-1 bg-white/5 border border-white/10 rounded-2xl px-6 py-4 text-sm font-black text-white uppercase tracking-widest outline-none focus:ring-4 focus:ring-blue-500/20 focus:border-blue-500/50 transition-all shadow-inner placeholder:text-white/20"
                                                />
                                                <button
                                                    type="button"
                                                    onClick={() => { setCustomReason(false); setOperationReason('Migración Inicial'); }}
                                                    className="px-4 py-2 bg-white/5 border border-white/10 rounded-2xl text-[9px] font-black text-blue-300 uppercase tracking-widest hover:bg-white/10 transition-all"
                                                >
                                                    Volver
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* STEP 4: IMPORTING V2 */}
                    {step === 'IMPORTING' && (
                        <div className="flex flex-col items-center justify-center min-h-100 space-y-10 py-10 text-center">
                            <div className="relative">
                                <div className="absolute inset-0 bg-emerald-500 blur-3xl opacity-20 animate-pulse" />
                                <div className="relative w-24 h-24 border-8 border-emerald-500/10 border-t-emerald-500 rounded-full animate-spin shadow-2xl" />
                                <div className="absolute inset-0 flex items-center justify-center">
                                    <Upload className="text-emerald-500 animate-bounce" size={32} />
                                </div>
                            </div>
                            
                            <div className="space-y-2">
                                <h3 className="text-3xl font-black uppercase tracking-tight text-slate-900 dark:text-white leading-none">Inyectando Datos</h3>
                                <p className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.3em]">Procesando registros en tiempo real</p>
                            </div>

                            <div className="w-full max-w-xl space-y-4">
                                <div className="flex justify-between items-end mb-2 px-1">
                                    <span className="text-[10px] font-black uppercase tracking-widest text-emerald-600">Progreso Operativo</span>
                                    <span className="text-[10px] font-black text-slate-400">{Math.round((progress.current / (progress.total || 1)) * 100)}%</span>
                                </div>
                                <div className="w-full bg-slate-100 dark:bg-white/5 rounded-full h-4 overflow-hidden border border-slate-200 dark:border-white/10 p-1 shadow-inner">
                                    <div
                                        className="h-full bg-linear-to-r from-emerald-500 to-emerald-400 rounded-full transition-all duration-300 relative"
                                        style={{ width: `${progress.total > 0 ? (progress.current / progress.total) * 100 : 0}%` }}
                                    >
                                        <div className="absolute inset-0 bg-[linear-gradient(45deg,rgba(255,255,255,0.2)_25%,transparent_25%,transparent_50%,rgba(255,255,255,0.2)_50%,rgba(255,255,255,0.2)_75%,transparent_75%,transparent)] bg-size-[20px_20px] animate-[progress-stripe_1s_linear_infinite]" />
                                    </div>
                                </div>
                                <div className="flex justify-between text-[9px] font-black uppercase text-slate-400 tracking-widest px-1">
                                    <span>{progress.current} PROCESADOS</span>
                                    <span>{progress.total} TOTALES</span>
                                </div>
                            </div>

                            <div className="w-full max-w-2xl bg-slate-900 rounded-3xl border border-white/5 p-6 font-mono text-[10px] text-emerald-400/80 shadow-2xl overflow-hidden relative text-left">
                                <div className="absolute top-0 right-0 p-4 opacity-10">
                                    <FileSpreadsheet size={40} />
                                </div>
                                <div className="h-40 overflow-y-auto space-y-1 custom-scrollbar scroll-smooth">
                                    {importLog.map((log, i) => (
                                        <div key={i} className="flex gap-4">
                                            <span className="text-white/20">[{new Date().toLocaleTimeString()}]</span>
                                            <span className={log.includes('Error') ? 'text-rose-400' : ''}>{log}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* STEP 5: RESULT V2 */}
                    {step === 'RESULT' && (
                        <div className="flex flex-col items-center justify-center py-16 space-y-12">
                            <div className="relative group">
                                <div className="absolute inset-0 bg-emerald-500 blur-[80px] opacity-20 group-hover:opacity-40 transition-opacity" />
                                <div className="w-32 h-32 bg-emerald-500 dark:bg-emerald-400 rounded-3xl flex items-center justify-center shadow-[0_20px_50px_rgba(16,185,129,0.3)] transform -rotate-6 group-hover:rotate-0 transition-transform duration-500">
                                    <Check size={64} className="text-white dark:text-slate-950" strokeWidth={4} />
                                </div>
                            </div>
                            
                            <div className="text-center space-y-3">
                                <h2 className="text-4xl font-black uppercase tracking-tight text-slate-900 dark:text-white">Operación Exitosa</h2>
                                <p className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.4em]">Registros sincronizados con la base central</p>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 w-full max-w-3xl">
                                {([
                                    { label: 'Nuevos', value: importStats.created, icon: <Plus size={14} />, iconClass: 'bg-emerald-500/10 text-emerald-500' },
                                    { label: 'Actualizados', value: importStats.updated, icon: <RotateCcw size={14} />, iconClass: 'bg-blue-500/10 text-blue-500' },
                                    { label: 'Errores', value: importStats.errors, icon: <X size={14} />, iconClass: importStats.errors > 0 ? 'bg-rose-500/10 text-rose-500' : 'bg-slate-500/10 text-slate-500' }
                                ] as const).map((stat) => (
                                    <div key={stat.label} className="bg-white/50 dark:bg-white/5 backdrop-blur-md p-8 rounded-3xl border border-slate-200 dark:border-white/10 shadow-xl text-center flex flex-col items-center group transition-all hover:bg-white dark:hover:bg-white/10">
                                        <div className={clsx("w-8 h-8 rounded-full flex items-center justify-center mb-4 group-hover:scale-110 transition-transform", stat.iconClass)}>
                                            {stat.icon}
                                        </div>
                                        <div className="text-4xl font-black text-slate-900 dark:text-white mb-2">{stat.value}</div>
                                        <div className="text-[10px] font-black uppercase tracking-widest text-slate-400">{stat.label}</div>
                                    </div>
                                ))}
                            </div>

                            {importStats.errors > 0 && (
                                <button
                                    onClick={handleDownloadErrors}
                                    className="flex items-center gap-3 px-8 py-4 bg-rose-500/10 hover:bg-rose-500/20 rounded-2xl text-[10px] font-black uppercase tracking-widest text-rose-600 dark:text-rose-400 border border-rose-500/20 transition-all shadow-lg active:scale-95"
                                >
                                    <Download size={16} strokeWidth={3} /> Descargar Reporte de Anomalías
                                </button>
                            )}

                            <div className="flex items-center gap-2 bg-emerald-500/5 dark:bg-emerald-500/10 px-4 py-2 rounded-full border border-emerald-500/20 animate-in fade-in zoom-in duration-1000">
                                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                                <span className="text-[10px] font-black uppercase tracking-widest text-emerald-600 dark:text-emerald-400">Nuevas Marcas y Categorías integradas automáticamente</span>
                            </div>
                        </div>
                    )}

                </div>

                {/* Footer V2 */}
                <div className="mt-8 pt-8 border-t border-slate-100 dark:border-white/10 flex justify-between items-center">
                    <div className="flex gap-4">
                        {step === 'RESULT' && lastBatchId && (
                            <button
                                onClick={handleUndo}
                                disabled={isReverting}
                                className="px-6 py-4 bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 rounded-2xl text-[10px] font-black uppercase tracking-widest flex items-center gap-3 transition-all disabled:opacity-50"
                            >
                                <RotateCcw size={16} className={isReverting ? 'animate-spin' : ''} strokeWidth={3} />
                                {isReverting ? "Revirtiendo..." : "Deshacer Lote"}
                            </button>
                        )}
                    </div>

                    <div className="flex gap-4">
                        {step === 'UPLOAD' && (
                            <button 
                                onClick={onClose} 
                                className="px-8 py-4 text-slate-500 hover:text-slate-900 dark:hover:text-white text-[10px] font-black uppercase tracking-widest transition-colors"
                            >
                                Cancelar
                            </button>
                        )}

                        {step === 'ANALYSIS' && !isAnalyzing && (
                            <>
                                <button 
                                    onClick={() => setStep('UPLOAD')} 
                                    className="px-8 py-4 text-slate-500 hover:text-slate-900 dark:hover:text-white text-[10px] font-black uppercase tracking-widest transition-colors"
                                >
                                    Atrás
                                </button>
                                <button
                                    onClick={handleImport}
                                    className="px-10 py-4 bg-emerald-500 hover:bg-emerald-600 text-white dark:text-slate-950 rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] shadow-[0_10px_30px_rgba(16,185,129,0.3)] transition-all transform hover:-translate-y-0.5 active:translate-y-px flex items-center gap-3"
                                >
                                    Ejecutar Inyección <ArrowRight size={18} strokeWidth={3} />
                                </button>
                            </>
                        )}

                        {step === 'RESULT' && (
                            <button
                                onClick={onClose}
                                className="px-12 py-4 bg-slate-900 dark:bg-white text-white dark:text-slate-950 rounded-2xl text-[10px] font-black uppercase tracking-[0.3em] shadow-2xl transition-all transform hover:-translate-y-0.5 active:translate-y-px"
                            >
                                Finalizar Proceso
                            </button>
                        )}
                    </div>
                </div>
            </IndustrialModal>
    );
}
