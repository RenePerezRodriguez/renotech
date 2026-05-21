'use client';

import { QRCodeSVG } from 'qrcode.react';
import { Product } from '@/types';
import { X, Printer, Loader2 } from 'lucide-react';
import { PrintService } from '@/services/PrintService';
import { useState } from 'react';
import { toast } from 'sonner';

interface ProductLabelProps {
    product: Product;
    onClose: () => void;
}

export default function ProductLabel({ product, onClose }: ProductLabelProps) {
    const [isPrinting, setIsPrinting] = useState(false);

    const handlePrint = async () => {
        try {
            setIsPrinting(true);
            await PrintService.printProductQR(product);
        } catch {
            toast.error('Error al generar la etiqueta');
        } finally {
            setIsPrinting(false);
        }
    };

    return (
        <>
            {/* UI Modal - Hidden on Print */}
            <div className="fixed inset-0 z-1000 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 print:hidden">
                <div className="bg-white dark:bg-[#111827] rounded-2xl shadow-2xl max-w-sm w-full overflow-hidden">
                    {/* Header */}
                    <div className="flex items-center justify-between px-6 py-4 border-b dark:border-white/10">
                        <h3 className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
                            <Printer size={18} className="text-blue-500" />
                            Etiqueta de Producto
                        </h3>
                        <button onClick={onClose} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
                            <X size={20} />
                        </button>
                    </div>

                    {/* Preview Content */}
                    <div className="p-8 flex flex-col items-center bg-white">
                        <div className="text-[10px] font-black uppercase tracking-[0.2em] mb-2 text-blue-600">
                            RENOTECH
                        </div>
                        <div className="bg-white p-2 rounded-xl border border-slate-100 mb-4">
                            <QRCodeSVG
                                value={product.codigo || product.id || ''}
                                size={120}
                                level="H"
                            />
                        </div>
                        <div className="text-center space-y-1">
                            <h4 className="text-sm font-bold text-slate-900 leading-tight uppercase wrap-break-word px-4">
                                {product.nombre}
                            </h4>
                            <p className="text-[11px] font-mono font-bold text-slate-500 tracking-tighter">
                                {product.codigo}
                            </p>
                            <div className="mt-3 bg-slate-900 text-white px-4 py-1.5 rounded-full text-base font-black">
                                Bs. {product.precioSinFactura?.toFixed(2)}
                            </div>
                        </div>
                    </div>

                    {/* Footer */}
                    <div className="px-6 py-4 bg-slate-50 dark:bg-white/5/50 flex justify-end gap-3">
                        <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-400">
                            Cerrar
                        </button>
                        <button
                            onClick={handlePrint}
                            disabled={isPrinting}
                            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white px-6 py-2 rounded-xl text-sm font-bold shadow-lg shadow-blue-500/20 transition-all active:scale-95"
                        >
                            {isPrinting ? (
                                <Loader2 size={18} className="animate-spin" />
                            ) : (
                                <Printer size={18} />
                            )}
                            {isPrinting ? 'Generando...' : 'Imprimir'}
                        </button>
                    </div>
                </div>
            </div>

        </>
    );
}
