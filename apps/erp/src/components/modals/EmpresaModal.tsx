'use client';

import { useState, useRef } from 'react';
import Image from 'next/image';
import { Empresa } from '@/types';
import { EmpresaService } from '@/services/EmpresaService';
import IndustrialModal from '@/components/common/IndustrialModal';
import { Building2, Upload, X, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { storage } from '@/lib/firebase';
import { ref as storageRef, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';

interface EmpresaModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess?: (empresa: Empresa) => void;
    initialData?: Empresa | null;
}

export default function EmpresaModal({ isOpen, onClose, onSuccess, initialData }: EmpresaModalProps) {
    const [nombre, setNombre] = useState(initialData?.nombre || '');
    const [notas, setNotas] = useState(initialData?.notas || '');
    const [logoUrl, setLogoUrl] = useState(initialData?.logoUrl || '');
    const [logoFile, setLogoFile] = useState<File | null>(null);
    const [previewUrl, setPreviewUrl] = useState<string | null>(initialData?.logoUrl || null);
    const [saving, setSaving] = useState(false);
    const [uploading, setUploading] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    if (!isOpen) return null;

    const handleFile = (file: File | null) => {
        if (!file) return;
        if (!file.type.startsWith('image/')) {
            toast.error('Solo se permiten imágenes');
            return;
        }
        if (file.size > 10 * 1024 * 1024) {
            toast.error('La imagen no puede superar 10MB (se comprimirá automáticamente)');
            return;
        }
        setLogoFile(file);
        setPreviewUrl(URL.createObjectURL(file));
    };

    /** Comprime una imagen a WebP con un máximo de `maxDim` px. */
    const compressImage = (file: File, maxDim = 512, quality = 0.85): Promise<File> =>
        new Promise((resolve, reject) => {
            // No tocar SVG ni GIF (preservan vector / animación)
            if (file.type === 'image/svg+xml' || file.type === 'image/gif') {
                resolve(file);
                return;
            }
            const img = new window.Image();
            const url = URL.createObjectURL(file);
            img.onload = () => {
                URL.revokeObjectURL(url);
                let { width, height } = img;
                if (width > maxDim || height > maxDim) {
                    if (width >= height) {
                        height = Math.round((height * maxDim) / width);
                        width = maxDim;
                    } else {
                        width = Math.round((width * maxDim) / height);
                        height = maxDim;
                    }
                }
                const canvas = document.createElement('canvas');
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                if (!ctx) { resolve(file); return; }
                ctx.drawImage(img, 0, 0, width, height);

                const tryEncode = (mime: string, q: number): Promise<File | null> =>
                    new Promise((res) => {
                        canvas.toBlob((blob) => {
                            if (!blob) { res(null); return; }
                            const ext = mime.split('/')[1];
                            const baseName = file.name.replace(/\.[^.]+$/, '');
                            res(new File([blob], `${baseName}.${ext}`, { type: mime }));
                        }, mime, q);
                    });

                // Intentar WebP primero (mejor ratio)
                tryEncode('image/webp', quality).then((webp) => {
                    if (webp && webp.size > 0) {
                        // Si el WebP es más grande que el original (raro), conservar original
                        resolve(webp.size < file.size ? webp : file);
                    } else {
                        // Fallback: navegador no soporta WebP → JPEG/PNG
                        const fallbackMime = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
                        tryEncode(fallbackMime, quality).then((fallback) => {
                            resolve(fallback && fallback.size < file.size ? fallback : file);
                        });
                    }
                });
            };
            img.onerror = () => {
                URL.revokeObjectURL(url);
                reject(new Error('No se pudo cargar la imagen'));
            };
            img.src = url;
        });

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!nombre.trim()) {
            toast.error('El nombre es obligatorio');
            return;
        }
        setSaving(true);
        try {
            let finalLogoUrl = logoUrl;

            // Upload logo if changed
            if (logoFile) {
                setUploading(true);
                const compressed = await compressImage(logoFile);
                const path = `empresas/${Date.now()}_${compressed.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
                const ref = storageRef(storage, path);
                await uploadBytes(ref, compressed);
                finalLogoUrl = await getDownloadURL(ref);
                // Delete previous if existed (extraer path desde download URL)
                if (initialData?.logoUrl) {
                    try {
                        const m = initialData.logoUrl.match(/\/o\/([^?]+)/);
                        if (m) {
                            const oldPath = decodeURIComponent(m[1]);
                            await deleteObject(storageRef(storage, oldPath));
                        }
                    } catch { /* ignore */ }
                }
                setUploading(false);
            }

            if (initialData?.id) {
                await EmpresaService.update(initialData.id, {
                    nombre: nombre.trim(),
                    notas: notas.trim(),
                    logoUrl: finalLogoUrl,
                });
                toast.success('Empresa actualizada');
                onSuccess?.({ ...initialData, nombre, notas, logoUrl: finalLogoUrl });
            } else {
                const id = await EmpresaService.create({
                    nombre: nombre.trim(),
                    notas: notas.trim(),
                    logoUrl: finalLogoUrl,
                    isActive: true,
                });
                toast.success('Empresa creada');
                onSuccess?.({ id, nombre, notas, logoUrl: finalLogoUrl, isActive: true });
            }
            onClose();
        } catch (err) {
            console.error(err);
            toast.error(err instanceof Error ? err.message : 'Error al guardar empresa');
        } finally {
            setSaving(false);
            setUploading(false);
        }
    };

    const removeLogo = () => {
        setLogoFile(null);
        setLogoUrl('');
        setPreviewUrl(null);
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    return (
        <IndustrialModal
            isOpen={isOpen}
            onClose={onClose}
            title={initialData ? 'Editar Empresa' : 'Nueva Empresa'}
            subtitle="Empresa Comercial"
            icon={<Building2 size={24} strokeWidth={2.5} />}
            iconBg="bg-purple-500"
            iconColor="text-white"
            maxWidth="max-w-xl"
        >
            <form onSubmit={handleSubmit} className="space-y-5 px-2">
                {/* Logo uploader */}
                <div>
                    <label className="block text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.25em] mb-2 ml-1">
                        Logo (opcional · se comprime automáticamente)
                    </label>
                    <div className="flex items-center gap-4">
                        <div className="w-20 h-20 rounded-2xl bg-slate-100 dark:bg-black/40 border-2 border-dashed border-slate-200 dark:border-white/10 flex items-center justify-center overflow-hidden relative shrink-0">
                            {previewUrl ? (
                                <Image src={previewUrl} alt="Logo" fill className="object-contain p-1" />
                            ) : (
                                <Building2 size={28} className="text-slate-300 dark:text-slate-700" />
                            )}
                        </div>
                        <div className="flex-1 flex flex-col gap-2">
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept="image/*"
                                onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
                                className="hidden"
                            />
                            <button
                                type="button"
                                onClick={() => fileInputRef.current?.click()}
                                className="flex items-center gap-2 px-3 py-2 bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 rounded-xl text-[10px] font-black uppercase tracking-widest text-slate-700 dark:text-slate-300 transition-colors"
                            >
                                <Upload size={12} /> Seleccionar imagen
                            </button>
                            {previewUrl && (
                                <button
                                    type="button"
                                    onClick={removeLogo}
                                    className="flex items-center gap-2 px-3 py-1.5 text-[10px] font-bold text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10 rounded-xl w-fit transition-colors"
                                >
                                    <X size={11} /> Quitar
                                </button>
                            )}
                        </div>
                    </div>
                </div>

                {/* Nombre */}
                <div>
                    <label className="block text-[9px] font-black text-blue-500 dark:text-blue-400 uppercase tracking-[0.25em] mb-1.5 ml-1">
                        Nombre de la Empresa (REQUERIDO)
                    </label>
                    <input
                        value={nombre}
                        onChange={(e) => setNombre(e.target.value)}
                        autoFocus
                        required
                        placeholder="Ej. GLOBALVOL PARTS"
                        className="w-full px-5 py-3 bg-slate-100 dark:bg-black/40 border-2 border-transparent focus:border-blue-500 focus:bg-white dark:focus:bg-black rounded-xl outline-none text-xs font-black text-slate-900 dark:text-white transition-all uppercase placeholder:text-slate-400 shadow-inner"
                    />
                </div>

                {/* Notas */}
                <div>
                    <label className="block text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.25em] mb-1.5 ml-1">
                        Notas (opcional)
                    </label>
                    <textarea
                        value={notas}
                        onChange={(e) => setNotas(e.target.value)}
                        rows={3}
                        placeholder="Comentarios generales sobre la empresa..."
                        className="w-full px-5 py-3 bg-slate-100 dark:bg-black/40 border-2 border-transparent focus:border-blue-500 focus:bg-white dark:focus:bg-black rounded-xl outline-none text-xs text-slate-900 dark:text-white transition-all placeholder:text-slate-400 shadow-inner resize-none"
                    />
                </div>

                <div className="flex gap-3 pt-2">
                    <button
                        type="button"
                        onClick={onClose}
                        className="flex-1 h-11 rounded-xl font-black uppercase text-[10px] tracking-widest text-slate-400 hover:text-slate-600 hover:bg-slate-50 dark:hover:bg-white/5 transition-all active:scale-95 border border-transparent hover:border-slate-200 dark:hover:border-white/10"
                    >
                        Cancelar
                    </button>
                    <button
                        type="submit"
                        disabled={saving || !nombre.trim()}
                        className="flex-2 bg-slate-900 dark:bg-purple-500 text-white h-11 rounded-xl font-black uppercase text-[10px] tracking-[0.2em] shadow-xl hover:shadow-purple-500/10 dark:hover:bg-purple-400 transition-all active:scale-95 flex items-center justify-center gap-3 disabled:opacity-30"
                    >
                        {saving ? (
                            <Loader2 size={16} className="animate-spin" />
                        ) : (
                            <Building2 size={16} strokeWidth={3} />
                        )}
                        {uploading ? 'SUBIENDO LOGO...' : saving ? 'GUARDANDO...' : (initialData ? 'GUARDAR' : 'CREAR EMPRESA')}
                    </button>
                </div>
            </form>
        </IndustrialModal>
    );
}
