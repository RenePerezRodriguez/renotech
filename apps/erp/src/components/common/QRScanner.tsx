'use client';

import { useEffect, useRef, useState } from 'react';
import { Html5QrcodeScanner, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import { X, Camera, RefreshCw, AlertCircle } from 'lucide-react';

interface QRScannerProps {
    onScan: (decodedText: string) => void;
    onClose: () => void;
    title?: string;
}

export default function QRScanner({ onScan, onClose, title = "Escanear Código" }: QRScannerProps) {
    const scannerRef = useRef<Html5QrcodeScanner | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        // Delay initialization bit to ensure DOM element is ready
        const timer = setTimeout(() => {
            try {
                const scanner = new Html5QrcodeScanner(
                    "qr-reader",
                    {
                        fps: 10,
                        qrbox: { width: 250, height: 250 },
                        aspectRatio: 1.0,
                        formatsToSupport: [
                            Html5QrcodeSupportedFormats.QR_CODE,
                            Html5QrcodeSupportedFormats.CODE_128,
                            Html5QrcodeSupportedFormats.EAN_13
                        ]
                    },
                    /* verbose= */ false
                );

                scanner.render(
                    (decodedText) => {
                        // Success callback
                        onScan(decodedText);
                        scanner.clear(); // Stop scanning after success
                        onClose();
                    },
                    () => {
                        // Error callback (triggered many times while searching)
                        // Silent in production usually, but we can log for debug
                    }
                );

                scannerRef.current = scanner;
            } catch {
                setError("No se pudo iniciar la cámara. Asegúrate de dar permisos.");
            }
        }, 300);

        return () => {
            clearTimeout(timer);
            if (scannerRef.current) {
                scannerRef.current.clear().catch(() => {});
            }
        };
    }, [onScan, onClose]);

    return (
        <div className="fixed inset-0 z-1000 flex items-center justify-center bg-slate-950/60 p-4 animate-in fade-in duration-300">
            <div className="bg-white dark:bg-[#111827] rounded-3xl shadow-[0_32px_128px_-16px_rgba(0,0,0,0.3)] max-w-lg w-full overflow-hidden animate-in zoom-in-95 duration-300 border border-slate-200 dark:border-white/10">
                {/* Header V2 */}
                <div className="flex items-center justify-between px-10 py-8 border-b border-slate-200/60 dark:border-white/10 bg-slate-50 dark:bg-white/5">
                    <div className="flex items-center gap-5">
                        <div className="w-12 h-12 bg-blue-500/10 dark:bg-blue-500/20 rounded-2xl flex items-center justify-center text-blue-600 dark:text-blue-400">
                            <Camera size={24} strokeWidth={2.5} />
                        </div>
                        <div>
                            <h3 className="text-xl font-black uppercase tracking-tight text-slate-900 dark:text-white leading-none">
                                Escáner <span className="text-blue-600 dark:text-blue-400">Óptico</span>
                            </h3>
                            <p className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.3em] mt-2 leading-none">
                                {title}
                            </p>
                        </div>
                    </div>
                    <button 
                        onClick={onClose} 
                        className="p-3 bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 text-slate-500 hover:text-slate-900 dark:hover:text-white rounded-2xl transition-all active:scale-90"
                    >
                        <X size={24} />
                    </button>
                </div>

                {/* Camera Container V2 */}
                <div className="p-10">
                    <div
                        id="qr-reader"
                        className="w-full bg-slate-900/10 dark:bg-black/40 rounded-3xl overflow-hidden border-2 border-dashed border-slate-200 dark:border-white/10 min-h-75 flex items-center justify-center relative shadow-inner"
                    >
                        {!error && (
                            <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-400 pointer-events-none z-0">
                                <div className="p-4 bg-white/50 dark:bg-white/5 rounded-full mb-4 animate-pulse">
                                    <RefreshCw className="animate-spin text-blue-500" size={32} />
                                </div>
                                <p className="text-[10px] font-black uppercase tracking-[0.2em]">Iniciando Sincronización...</p>
                            </div>
                        )}

                        {error && (
                            <div className="text-center p-12 z-10 bg-rose-500/10 rounded-3xl border border-rose-500/20">
                                <AlertCircle size={48} className="text-rose-500 mx-auto mb-4" />
                                <p className="text-rose-600 dark:text-rose-400 text-sm font-black uppercase tracking-tight mb-4">{error}</p>
                                <button
                                    onClick={() => window.location.reload()}
                                    className="px-6 py-3 bg-rose-500 text-white dark:text-slate-950 rounded-xl text-[10px] font-black uppercase tracking-widest shadow-lg active:scale-95 transition-all"
                                >
                                    Reintentar Conexión
                                </button>
                            </div>
                        )}
                    </div>
                </div>

                {/* Footer V2 */}
                <div className="px-10 py-6 bg-slate-50/50 dark:bg-[#111827]/40 border-t border-slate-200/60 dark:border-white/10">
                    <p className="text-[10px] text-slate-500 dark:text-slate-400 text-center uppercase tracking-[0.2em] font-black leading-relaxed">
                        Centra el código en el recuadro para <br/> identificación automática
                    </p>
                </div>
            </div>

            {/* Custom Styles for html5-qrcode UI cleanup V2 */}
            <style jsx global>{`
                #qr-reader {
                    border: none !important;
                    background: transparent !important;
                }
                #qr-reader__scan_region {
                    background: transparent !important;
                    display: flex !important;
                    justify-content: center !important;
                }
                #qr-reader__scan_region video {
                    border-radius: 1.5rem !important;
                    box-shadow: 0 20px 50px rgba(0,0,0,0.3) !important;
                }
                #qr-reader__dashboard {
                    padding: 1.5rem !important;
                    background: transparent !important;
                }
                #qr-reader__dashboard_section_csr button {
                    background: #3b82f6 !important;
                    color: white !important;
                    border: none !important;
                    padding: 0.75rem 1.5rem !important;
                    border-radius: 1rem !important;
                    font-weight: 900 !important;
                    text-transform: uppercase !important;
                    letter-spacing: 0.1em !important;
                    font-size: 0.75rem !important;
                    cursor: pointer !important;
                    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1) !important;
                    box-shadow: 0 10px 20px rgba(59, 130, 246, 0.3) !important;
                }
                #qr-reader__dashboard_section_csr button:hover {
                    background: #2563eb !important;
                    transform: translateY(-2px) !important;
                    box-shadow: 0 15px 30px rgba(59, 130, 246, 0.4) !important;
                }
                #qr-reader__dashboard_section_csr button:active {
                    transform: translateY(1px) !important;
                }
                #html5-qrcode-anchor-scan-type-change {
                    display: none !important;
                }
                #qr-reader__header_message {
                    display: none !important;
                }
                img[alt="Info icon"] { display: none !important; }
                img[alt="Camera menu icon"] { display: none !important; }
            `}</style>
        </div>
    );
}
