'use client';

import { useState, useRef } from 'react';
import { storage } from '@/lib/firebase';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { Upload, X, CheckCircle2 } from 'lucide-react';
import Image from 'next/image';
import { processAndCompressImage } from '@/utils/imageProcessing';
import { toast } from 'sonner';

interface ImageUploadProps {
    value?: string;
    onChange: (url: string) => void;
    folder?: string;
    disabled?: boolean;
}

export default function ImageUpload({ value, onChange, folder = 'productos', disabled = false }: ImageUploadProps) {
    const [uploading, setUploading] = useState(false);
    const [progress, setProgress] = useState(0);
    const fileInputRef = useRef<HTMLInputElement>(null);


    const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        // Validación de tipo y tamaño
        if (!file.type.startsWith('image/')) {
            toast.error('Solo se permiten imágenes (JPG, PNG, WebP).');
            if (fileInputRef.current) fileInputRef.current.value = '';
            return;
        }
        const MAX_BYTES = 5 * 1024 * 1024; // 5 MB
        if (file.size > MAX_BYTES) {
            toast.error('La imagen supera 5 MB. Reduce su tamaño.');
            if (fileInputRef.current) fileInputRef.current.value = '';
            return;
        }

        setUploading(true);
        setProgress(0);

        try {
            // 1. Compress
            const compressedBlob = await processAndCompressImage(file);

            // 2. Upload
            const fileName = `${Date.now()}_${file.name.replace(/[^a-zA-Z0-9.]/g, '_')}.webp`;
            const storageRef = ref(storage, `${folder}/${fileName}`);
            const uploadTask = uploadBytesResumable(storageRef, compressedBlob);

            uploadTask.on(
                'state_changed',
                (snapshot) => {
                    const p = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
                    setProgress(p);
                },
                () => {
                    toast.error("No se pudo subir la imagen. Intenta nuevamente.");
                    setUploading(false);
                },
                async () => {
                    const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
                    onChange(downloadURL);
                    setUploading(false);
                }
            );
        } catch {
            toast.error("No se pudo procesar la imagen.");
            setUploading(false);
        }
    };

    return (
        <div className="space-y-4">
            <div
                onClick={() => !uploading && !disabled && fileInputRef.current?.click()}
                className={`
                    relative h-44 w-full border-2 border-dashed rounded-3xl flex flex-col items-center justify-center transition-all overflow-hidden group/upload
                    ${value ? 'border-emerald-500/50 bg-emerald-500/5 shadow-inner' : 'border-slate-200 dark:border-white/10 bg-slate-50/50 dark:bg-black/20 hover:border-blue-500/50 hover:bg-white dark:hover:bg-white/5'}
                    ${(uploading || disabled) ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
                `}
            >
                {value && !uploading ? (
                    <>
                        <Image src={value} alt="Preview" fill className="object-cover transition-transform duration-500 group-hover/upload:scale-110" />
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover/upload:opacity-100 transition-opacity flex items-center justify-center">
                            <p className="text-[10px] font-black uppercase tracking-widest text-white underline underline-offset-4">Cambiar Imagen</p>
                        </div>
                        {!disabled && (
                            <div className="absolute top-4 right-4 flex gap-2">
                                <button
                                    onClick={(e) => { e.stopPropagation(); onChange(''); }}
                                    className="w-8 h-8 flex items-center justify-center bg-rose-500 text-white rounded-xl shadow-xl hover:scale-110 active:scale-90 transition-all"
                                >
                                    <X size={14} strokeWidth={3} />
                                </button>
                            </div>
                        )}
                        <div className="absolute bottom-4 right-4 w-10 h-10 bg-emerald-500 text-white rounded-2xl flex items-center justify-center shadow-xl border border-white/20">
                            <CheckCircle2 size={20} />
                        </div>
                    </>
                ) : uploading ? (
                    <div className="flex flex-col items-center gap-4">
                        <div className="relative w-16 h-16">
                            <svg className="w-16 h-16 transform -rotate-90">
                                <circle
                                    className="text-slate-200 dark:text-white/10"
                                    strokeWidth="4"
                                    stroke="currentColor"
                                    fill="transparent"
                                    r="28"
                                    cx="32"
                                    cy="32"
                                />
                                <circle
                                    className="text-blue-500 transition-all duration-300"
                                    strokeWidth="4"
                                    strokeDasharray={175.92}
                                    strokeDashoffset={175.92 - (progress / 100) * 175.92}
                                    strokeLinecap="round"
                                    stroke="currentColor"
                                    fill="transparent"
                                    r="28"
                                    cx="32"
                                    cy="32"
                                />
                            </svg>
                            <span className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-[10px] font-black text-blue-500">
                                {Math.round(progress)}%
                            </span>
                        </div>
                        <span className="text-[9px] font-black uppercase tracking-[0.2em] text-blue-500 animate-pulse">Codificando WEBP...</span>
                    </div>
                ) : (
                    <div className="flex flex-col items-center gap-3 text-slate-400 group-hover/upload:text-blue-500 transition-colors">
                        <div className="w-14 h-14 bg-white dark:bg-white/5 rounded-2xl flex items-center justify-center shadow-sm border border-slate-100 dark:border-white/10 group-hover/upload:scale-110 transition-transform">
                            <Upload size={24} strokeWidth={2.5} />
                        </div>
                        <div className="text-center">
                            <p className="text-[10px] font-black uppercase tracking-widest ">Seleccionar Media</p>
                            <p className="text-[8px] uppercase font-bold tracking-tight opacity-50 mt-1">Soporta: JPG, PNG, WEBP</p>
                        </div>
                    </div>
                )}
            </div>
            <input
                type="file"
                ref={fileInputRef}
                onChange={handleUpload}
                className="hidden"
                accept="image/*"
            />
        </div>
    );
}
