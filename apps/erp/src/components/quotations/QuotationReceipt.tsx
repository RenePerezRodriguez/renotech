'use client';

import { Quotation } from '@/types';
import { formatDate } from '@/utils/dateHelpers';

interface QuotationReceiptProps {
    quotation: Quotation | null;
}

export default function QuotationReceipt({ quotation }: QuotationReceiptProps) {
    if (!quotation) return null;

    const subtotal = quotation.subtotal || quotation.total;

    return (
        <div id="quotation-receipt" className="hidden print:block absolute top-0 left-0 w-full bg-white p-10 text-black z-9999">
            <div className="flex justify-between items-start mb-10 pb-5 border-b-2 border-slate-100">
                <div>
                    <h1 className="text-3xl font-black uppercase tracking-tighter mb-1">Cotización</h1>
                    <p className="text-slate-500 print:text-black font-bold uppercase text-[10px] tracking-widest">Renotech - Soluciones Automotrices</p>
                </div>
                <div className="text-right">
                    <p className="font-black text-lg uppercase mb-1"># {quotation.id?.slice(-6).toUpperCase() || 'NUEVA'}</p>
                    <p className="text-slate-500 print:text-black font-bold uppercase text-[10px] tracking-widest">Fecha: {formatDate(quotation.fecha)}</p>
                </div>
            </div>

            <div className="grid grid-cols-2 gap-10 mb-10 text-left">
                <div>
                    <p className="text-[10px] font-black text-slate-400 print:text-black uppercase tracking-[0.2em] mb-3">Cliente</p>
                    <div className="space-y-1">
                        <p className="font-black text-lg uppercase">{quotation.cliente?.razonSocial || 'Particular'}</p>
                        <p className="text-sm font-bold text-slate-600 print:text-black">NIT/CI: {quotation.cliente?.nit || '0'}</p>
                    </div>
                </div>
                <div className="text-right">
                    <p className="text-[10px] font-black text-slate-400 print:text-black uppercase tracking-[0.2em] mb-3">Detalles</p>
                    <p className="text-sm font-bold text-slate-600 print:text-black uppercase">Validez: Hasta {formatDate(quotation.validUntil)}</p>
                    <p className="text-sm font-bold text-slate-600 print:text-black uppercase">Estado: {quotation.status}</p>
                </div>
            </div>

            <table className="w-full mb-10 border-collapse text-left">
                <thead>
                    <tr className="border-b-2 border-gray-900 text-[10px] font-black uppercase tracking-widest">
                        <th className="py-4 px-2">Código</th>
                        <th className="py-4 px-2">Producto</th>
                        <th className="py-4 px-2 text-center">Cant.</th>
                        <th className="py-4 px-2 text-right">Unitario</th>
                        <th className="py-4 px-2 text-right">Subtotal</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                    {quotation.items?.map((item, index) => (
                        <tr key={index}>
                            <td className="py-4 px-2 font-mono text-[10px] font-bold text-slate-600">{item?.productCode || 'S/C'}</td>
                            <td className="py-4 px-2 font-bold uppercase text-xs">{item?.productName || 'N/A'}</td>
                            <td className="py-4 px-2 text-center font-bold text-xs">{item?.quantity ?? 0}</td>
                            <td className="py-4 px-2 text-right font-bold text-xs">Bs. {item?.unitPrice?.toFixed(2) ?? '0.00'}</td>
                            <td className="py-4 px-2 text-right font-black text-xs">Bs. {item?.subtotal?.toFixed(2) ?? '0.00'}</td>
                        </tr>
                    ))}
                </tbody>
            </table>

            <div className="flex justify-end pt-5 border-t-2 border-gray-900">
                <div className="w-64 space-y-2">
                    <div className="flex justify-between text-xs font-bold text-slate-500 print:text-black uppercase text-right">
                        <span>Subtotal</span>
                        <span>Bs. {subtotal.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between items-baseline pt-2 text-right">
                        <span className="font-black text-xs uppercase text-black">Total</span>
                        <span className="font-black text-2xl text-black">Bs. {quotation.total.toFixed(2)}</span>
                    </div>
                </div>
            </div>

            {quotation.notes && (
                <div className="mt-10 pt-5 border-t border-slate-100 text-left">
                    <p className="text-[10px] font-black text-slate-400 print:text-black uppercase tracking-widest mb-3">Notas / Términos</p>
                    <p className="text-xs font-medium text-slate-600 print:text-black italic whitespace-pre-line">{quotation.notes}</p>
                </div>
            )}

            <div className="mt-20 text-center border-t border-dashed border-slate-200 pt-10">
                <p className="text-[8px] text-slate-400 uppercase tracking-widest">Documento generado por Renotech</p>
            </div>
        </div>
    );
}
