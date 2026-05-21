/**
 * AccountFormModal — crear o editar una cuenta (CASH_DRAWER, BANK, WALLET).
 */
'use client';
import React, { useEffect, useState, useRef } from 'react';
import Image from 'next/image';
import { Wallet, Building2, Smartphone, Upload, X, QrCode } from 'lucide-react';
import IndustrialModal from '@/components/common/IndustrialModal';
import { AccountService } from '@/services/AccountService';
import type { Account, AccountType } from '@/types/treasury';
import { useBranch } from '@/contexts/BranchContext';
import { useAuth } from '@/contexts/AuthContext';
import { storage, db } from '@/lib/firebase';
import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { toast } from 'sonner';
import clsx from 'clsx';

interface Props {
    isOpen: boolean;
    onClose: () => void;
    onSaved: () => void;
    editing: Account | null;
}

const ALL_TYPE_OPTIONS: { value: AccountType; label: string; icon: React.ReactNode }[] = [
    { value: 'CASH_DRAWER', label: 'Cajón físico', icon: <Wallet size={14} /> },
    { value: 'BANK', label: 'Cuenta bancaria', icon: <Building2 size={14} /> },
    { value: 'WALLET', label: 'Billetera digital', icon: <Smartphone size={14} /> },
];
// Cajas/bóvedas se auto-crean con la sucursal — solo BANK y WALLET son creables manualmente
const CREATE_TYPE_OPTIONS = ALL_TYPE_OPTIONS.filter(o => o.value !== 'CASH_DRAWER');

export default function AccountFormModal({ isOpen, onClose, onSaved, editing }: Props) {
    const { user, role } = useAuth();
    const { currentBranch, branches } = useBranch();
    const [type, setType] = useState<AccountType>('BANK');
    const [name, setName] = useState('');
    const [branchId, setBranchId] = useState<string | null>(null);
    const [branchIds, setBranchIds] = useState<string[]>([]);
    const [cashDrawerPurpose, setCashDrawerPurpose] = useState<'POS' | 'VAULT'>('POS');
    const [bankName, setBankName] = useState('');
    const [accountNumber, setAccountNumber] = useState('');
    const [accountHolder, setAccountHolder] = useState('');
    const [qrImageUrl, setQrImageUrl] = useState('');
    const [notes, setNotes] = useState('');
    const [openingBalance, setOpeningBalance] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [uploadingQr, setUploadingQr] = useState(false);
    const [canEditOpeningBalance, setCanEditOpeningBalance] = useState(false);
    const [checkingSessions, setCheckingSessions] = useState(false);
    const [confirmOpen, setConfirmOpen] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleQrUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        if (!file.type.startsWith('image/')) {
            toast.error('Solo se permiten imágenes');
            return;
        }
        if (file.size > 2 * 1024 * 1024) {
            toast.error('Imagen muy grande (máx. 2 MB)');
            return;
        }
        setUploadingQr(true);
        try {
            const path = `treasury/qr/${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
            const sref = storageRef(storage, path);
            await uploadBytes(sref, file);
            const url = await getDownloadURL(sref);
            setQrImageUrl(url);
            toast.success('QR cargado');
        } catch (err) {
            console.error(err);
            toast.error('No se pudo subir la imagen');
        } finally {
            setUploadingQr(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    useEffect(() => {
        if (!isOpen) return;
        if (editing) {
            setType(editing.type);
            setName(editing.name);
            setBranchId(editing.branchId || null);
            setBranchIds(editing.branchIds || []);
            setCashDrawerPurpose(editing.cashDrawerPurpose || 'POS');
            setBankName(editing.bankName || '');
            setAccountNumber(editing.accountNumber || '');
            setAccountHolder(editing.accountHolder || '');
            setQrImageUrl(editing.qrImageUrl || '');
            setNotes(editing.notes || '');
            setOpeningBalance(String(editing.openingBalance || 0));

            // Verificar si ya existen sesiones para esta cuenta
            setCanEditOpeningBalance(false);
            setCheckingSessions(true);
            (async () => {
                try {
                    const sessionsSnap = await getDocs(query(
                        collection(db, 'cashier_sessions'),
                        where('cashDrawerId', '==', editing.id),
                        where('status', '!=', 'CANCELLED')
                    ));
                    setCanEditOpeningBalance(sessionsSnap.empty);
                } catch {
                    setCanEditOpeningBalance(false);
                } finally {
                    setCheckingSessions(false);
                }
            })();
        } else {
            setType('BANK');
            setName('');
            setBranchId(null);
            setCashDrawerPurpose('POS');
            setBankName('');
            setAccountNumber('');
            setAccountHolder('');
            setQrImageUrl('');
            setNotes('');
            setOpeningBalance('0');
            setCanEditOpeningBalance(false);
            setCheckingSessions(false);
        }
    }, [isOpen, editing, currentBranch]);

    useEffect(() => {
        if (editing) return;
        if (type !== 'CASH_DRAWER') setBranchId(null);
        else setBranchId(currentBranch?.id || null);
    }, [type, editing, currentBranch]);

    const canSubmitBase = !!user && role === 'GERENTE' && name.trim().length >= 3 && !submitting;

    const doSubmit = async () => {
        if (!canSubmitBase || !user) return;
        if (role !== 'GERENTE') {
            throw new Error('Solo GERENTE puede crear o editar cuentas.');
        }
        // Validated: user has GERENTE role (checked by canSubmit + explicit guard above)
        setSubmitting(true);
        setConfirmOpen(false);
        try {
            if (editing) {
                // Al editar, excluir type (inmutable — el selector está deshabilitado).
                // branchId SÍ se envía: GERENTE puede reasignar sucursal.
                const payload: Partial<Account> = {
                    name: name.trim(),
                    branchId: type === 'CASH_DRAWER' ? branchId : null,
                    branchIds: type !== 'CASH_DRAWER' ? branchIds : undefined,
                    acceptsPaymentMethods: type === 'CASH_DRAWER' ? ['EFECTIVO'] : ['QR', 'TRANSFERENCIA'],
                    cashDrawerPurpose: type === 'CASH_DRAWER' ? cashDrawerPurpose : undefined,
                    bankName: bankName.trim() || undefined,
                    accountNumber: accountNumber.trim() || undefined,
                    accountHolder: accountHolder.trim() || undefined,
                    qrImageUrl: qrImageUrl.trim() || undefined,
                    notes: notes.trim() || undefined,
                    isActive: true,
                    currency: 'BOB',
                };
                // Solo incluir openingBalance si realmente cambió Y está permitido editarlo
                // (no existen sesiones). Si no, omitirlo para evitar que AccountService
                // sobreescriba currentBalance, lo cual viola las reglas de Firestore.
                if (canEditOpeningBalance) {
                    const newBalance = parseFloat(openingBalance) || 0;
                    if (newBalance !== (editing.openingBalance || 0)) {
                        payload.openingBalance = newBalance;
                    }
                }
                await AccountService.update(editing.id!, payload, user.uid);
                toast.success('Cuenta actualizada');
            } else {
                const payload: Partial<Account> = {
                    name: name.trim(),
                    type,
                    branchId: type === 'CASH_DRAWER' ? branchId : null,
                    branchIds: type !== 'CASH_DRAWER' ? branchIds : undefined,
                    acceptsPaymentMethods: type === 'CASH_DRAWER' ? ['EFECTIVO'] : ['QR', 'TRANSFERENCIA'],
                    cashDrawerPurpose: type === 'CASH_DRAWER' ? cashDrawerPurpose : undefined,
                    bankName: bankName.trim() || undefined,
                    accountNumber: accountNumber.trim() || undefined,
                    accountHolder: accountHolder.trim() || undefined,
                    qrImageUrl: qrImageUrl.trim() || undefined,
                    notes: notes.trim() || undefined,
                    isActive: true,
                    currency: 'BOB',
                };
                await AccountService.create(payload as Omit<Account, 'id' | 'currentBalance' | 'createdAt' | 'updatedAt'>, user.uid);
                toast.success('Cuenta creada');
            }
            onSaved();
            onClose();
        } catch (e) {
            toast.error((e as Error).message);
        } finally {
            setSubmitting(false);
        }
    };

    const canSubmit = canSubmitBase && (type === 'CASH_DRAWER' ? !!branchId : branchIds.length > 0);

    const submit = () => {
        if (!canSubmit || !user) return;
        if (!editing && type === 'CASH_DRAWER') {
            // En creación, mostrar confirmación con información importante
            setConfirmOpen(true);
            return;
        }
        doSubmit();
    };

    return (
        <>
            <IndustrialModal
                isOpen={isOpen}
                onClose={onClose}
                title={editing ? 'Editar cuenta' : 'Nueva cuenta'}
                subtitle="Tesorería"
                theme="stealth"
                icon={<Wallet size={18} strokeWidth={2.5} />}
                maxWidth="max-w-xl"
                footer={
                    <div className="flex flex-col gap-2">
                    <div className="flex justify-end gap-2">
                        <button onClick={onClose} className="px-4 py-2 text-[10px] font-black uppercase tracking-[0.2em] rounded-xl border border-slate-200 dark:border-white/10 hover:bg-slate-100 dark:hover:bg-white/5 transition active:scale-95">
                            Cancelar
                        </button>
                        <button onClick={submit} disabled={!canSubmit}
                            className="px-4 py-2 text-[10px] font-black uppercase tracking-[0.2em] rounded-xl bg-yellow-500 hover:bg-yellow-400 text-black transition active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed shadow-sm">
                            {submitting ? 'Guardando…' : 'Guardar'}
                        </button>
                    </div>
                    {role !== 'GERENTE' && (
                        <div className="text-[9px] font-bold uppercase tracking-[0.15em] text-rose-500">
                            Solo GERENTE puede crear o editar cuentas.
                        </div>
                    )}
                </div>
                }
            >
                <div className="space-y-5">
                <div className="space-y-2">
                    <label className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-400 dark:text-slate-500">Tipo de cuenta</label>
                    {editing && type === 'CASH_DRAWER' ? (
                        /* Editando un CASH_DRAWER existente: mostrar badge fijo (no editable) */
                        <div className="rounded-xl border border-yellow-500 bg-yellow-500/10 px-4 py-3 flex items-center gap-2">
                            <Wallet size={14} className="text-yellow-500" />
                            <span className="text-[10px] font-black uppercase tracking-[0.15em] text-yellow-600 dark:text-yellow-400">Cajón físico</span>
                            <span className="ml-auto text-[8px] font-bold uppercase tracking-wider text-slate-400">Auto-creado con la sucursal</span>
                        </div>
                    ) : (
                        <div className={`grid grid-cols-${editing ? 3 : 2} gap-2`}>
                            {(editing ? ALL_TYPE_OPTIONS : CREATE_TYPE_OPTIONS).map(o => (
                                <button key={o.value} type="button" disabled={!!editing} onClick={() => setType(o.value)}
                                    className={clsx(
                                        'rounded-xl border px-3 py-3 text-[10px] font-black uppercase tracking-[0.15em] flex flex-col items-center gap-1.5 transition-all active:scale-95',
                                        type === o.value
                                            ? 'border-yellow-500 bg-yellow-500/10 text-slate-900 dark:text-yellow-500 shadow-sm'
                                            : 'border-slate-200 dark:border-white/10 bg-white dark:bg-white/5 text-slate-600 dark:text-slate-400 hover:border-slate-300 dark:hover:border-white/20',
                                        editing && 'opacity-50 cursor-not-allowed'
                                    )}>
                                    {o.icon}
                                    {o.label}
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                <div className="space-y-2">
                    <label className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-400 dark:text-slate-500">Nombre</label>
                    <input type="text" value={name} onChange={(e) => setName(e.target.value)} maxLength={80}
                        placeholder={type === 'CASH_DRAWER' ? 'Ej. Caja Principal Sucursal Centro' : type === 'BANK' ? 'Ej. BNB Cuenta Corriente' : 'Ej. Tigo Money'}
                        className="w-full rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-white/5 px-4 py-2.5 text-sm font-bold outline-none focus:border-yellow-500 dark:focus:border-yellow-500 transition" />
                </div>

                {type === 'CASH_DRAWER' && (
                    <>
                        <div className="space-y-2">
                            <label className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-400 dark:text-slate-500">Sucursal</label>
                            <select value={branchId || ''} onChange={(e) => setBranchId(e.target.value || null)}
                                className="w-full rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-white/5 px-4 py-2.5 text-sm font-bold outline-none focus:border-yellow-500 transition">
                                <option value="">— Seleccionar —</option>
                                {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                            </select>
                        </div>

                        <div className="space-y-2">
                            <label className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-400 dark:text-slate-500">Uso del cajón</label>
                            <div className="grid grid-cols-2 gap-2">
                                {(['POS', 'VAULT'] as const).map(value => (
                                    <button key={value} type="button" onClick={() => setCashDrawerPurpose(value)}
                                        className={clsx(
                                            'rounded-xl border px-3 py-3 text-[10px] font-black uppercase tracking-[0.15em] transition-all active:scale-95',
                                            cashDrawerPurpose === value
                                                ? 'border-yellow-500 bg-yellow-500/10 text-slate-900 dark:text-yellow-500 shadow-sm'
                                                : 'border-slate-200 dark:border-white/10 bg-white dark:bg-white/5 text-slate-600 dark:text-slate-400 hover:border-slate-300 dark:hover:border-white/20'
                                        )}
                                    >
                                        {value === 'POS' ? 'Caja POS' : 'Bóveda / Caja fuerte'}
                                    </button>
                                ))}
                            </div>
                            <p className="text-[9px] text-slate-500 dark:text-slate-400 uppercase tracking-wider">Solo los cajones marcados como POS aparecerán en la apertura de sesión.</p>
                        </div>
                    </>
                )}

                {(type === 'BANK' || type === 'WALLET') && (
                    <>
                        <div className="space-y-2">
                            <label className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-400 dark:text-slate-500">Sucursales asignadas</label>
                            <div className="flex flex-wrap gap-2">
                                {branches.map(b => (
                                    <button key={b.id} type="button" 
                                        onClick={() => {
                                            if (b.id) {
                                                if (branchIds.includes(b.id)) setBranchIds(branchIds.filter(id => id !== b.id));
                                                else setBranchIds([...branchIds, b.id]);
                                            }
                                        }}
                                        className={clsx(
                                            'rounded-xl border px-3 py-2 text-[10px] font-black uppercase tracking-[0.15em] transition-all active:scale-95',
                                            b.id && branchIds.includes(b.id)
                                                ? 'border-yellow-500 bg-yellow-500/10 text-slate-900 dark:text-yellow-500 shadow-sm'
                                                : 'border-slate-200 dark:border-white/10 bg-white dark:bg-white/5 text-slate-600 dark:text-slate-400 hover:border-slate-300 dark:hover:border-white/20'
                                        )}>
                                        {b.name}
                                    </button>
                                ))}
                            </div>
                            <p className="text-[8px] text-slate-500 uppercase tracking-wider">Debe asignar al menos una sucursal para que puedan usar esta cuenta.</p>
                        </div>
                        
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div className="space-y-2">
                                <label className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-400 dark:text-slate-500">Banco / proveedor</label>
                                <input type="text" value={bankName} onChange={(e) => setBankName(e.target.value)}
                                    className="w-full rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-white/5 px-4 py-2.5 text-sm font-bold outline-none focus:border-yellow-500 transition" />
                            </div>
                            <div className="space-y-2">
                                <label className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-400 dark:text-slate-500">Nº de cuenta</label>
                                <input type="text" value={accountNumber} onChange={(e) => setAccountNumber(e.target.value)}
                                    className="w-full rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-white/5 px-4 py-2.5 text-sm font-bold outline-none focus:border-yellow-500 transition" />
                            </div>
                        </div>
                        <div className="space-y-2">
                            <label className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-400 dark:text-slate-500">Titular (aparece en recibos)</label>
                            <input type="text" value={accountHolder} onChange={(e) => setAccountHolder(e.target.value)}
                                placeholder="Ej. RAZÓN SOCIAL S.R.L."
                                className="w-full rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-white/5 px-4 py-2.5 text-sm font-bold outline-none focus:border-yellow-500 transition" />
                        </div>
                        <div className="space-y-2">
                            <label className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-400 dark:text-slate-500">Imagen QR (opcional)</label>
                            <div className="flex items-start gap-3">
                                <div className="relative w-28 h-28 shrink-0 rounded-2xl border-2 border-dashed border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 overflow-hidden flex items-center justify-center">
                                    {qrImageUrl ? (
                                        <Image src={qrImageUrl} alt="QR" fill className="object-contain p-2" unoptimized />
                                    ) : (
                                        <QrCode size={28} className="text-slate-300 dark:text-slate-600" />
                                    )}
                                </div>
                                <div className="flex-1 space-y-2">
                                    <button type="button" onClick={() => fileInputRef.current?.click()} disabled={uploadingQr}
                                        className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-white/5 hover:bg-slate-50 dark:hover:bg-white/10 text-[10px] font-black uppercase tracking-[0.2em] transition active:scale-95 disabled:opacity-50">
                                        <Upload size={12} /> {uploadingQr ? 'Subiendo…' : qrImageUrl ? 'Cambiar' : 'Subir QR'}
                                    </button>
                                    {qrImageUrl && (
                                        <button type="button" onClick={() => setQrImageUrl('')}
                                            className="inline-flex items-center gap-1.5 px-3 py-2 text-[10px] font-black uppercase tracking-[0.2em] text-rose-500 hover:text-rose-600 transition">
                                            <X size={12} /> Quitar
                                        </button>
                                    )}
                                    <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Si la cuenta acepta QR, esta imagen aparecerá en los recibos al cliente. Máx. 2 MB.</p>
                                </div>
                                <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleQrUpload} />
                            </div>
                        </div>
                    </>
                )}

                {!editing && type === 'CASH_DRAWER' && (
                    <div className="p-4 rounded-2xl bg-blue-50 dark:bg-blue-500/5 border border-blue-200 dark:border-blue-500/10 space-y-2">
                        <p className="text-[10px] font-black uppercase tracking-wider text-blue-700 dark:text-blue-400">💰 Saldo inicial</p>
                        <p className="text-[10px] font-bold text-blue-600 dark:text-blue-300 leading-relaxed">
                            El saldo inicial de la caja se define al <strong>abrir la primera sesión</strong>, no al crear la cuenta.
                            Esto evita errores de tipeo y asegura que el saldo coincida exactamente con el efectivo físico contado.
                        </p>
                    </div>
                )}

                {editing && type === 'CASH_DRAWER' && canEditOpeningBalance && !checkingSessions && (
                    <div className="space-y-2">
                        <label className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-400 dark:text-slate-500">
                            Saldo de apertura (editable — sin sesiones aún)
                        </label>
                        <div className="relative">
                            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[10px] font-black uppercase tracking-wider text-slate-400">Bs.</span>
                            <input type="number" inputMode="decimal" min={0} step="0.01" value={openingBalance}
                                onChange={(e) => setOpeningBalance(e.target.value)}
                                className="w-full pl-12 pr-4 py-3 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-white/5 text-lg font-black tabular-nums tracking-tighter outline-none focus:border-yellow-500 transition" />
                        </div>
                        <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">
                            Podés corregir el saldo inicial porque aún no se ha abierto ninguna sesión sobre esta cuenta.
                        </p>
                    </div>
                )}
                {editing && type === 'CASH_DRAWER' && !canEditOpeningBalance && !checkingSessions && (
                    <div className="space-y-2">
                        <label className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-400 dark:text-slate-500">Saldo de apertura</label>
                        <div className="relative">
                            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[10px] font-black uppercase tracking-wider text-slate-400">Bs.</span>
                            <input type="number" value={openingBalance} disabled
                                className="w-full pl-12 pr-4 py-3 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-100 dark:bg-white/5 text-lg font-black tabular-nums tracking-tighter outline-none opacity-60 cursor-not-allowed" />
                        </div>
                        <p className="text-[9px] font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400">El saldo inicial ya no puede modificarse porque existen sesiones registradas sobre esta cuenta.</p>
                    </div>
                )}
                {editing && type === 'CASH_DRAWER' && checkingSessions && (
                    <div className="text-[10px] font-bold text-slate-400 italic py-2">Verificando sesiones…</div>
                )}

                <div className="space-y-2">
                    <label className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-400 dark:text-slate-500">Notas</label>
                    <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} maxLength={300}
                        className="w-full rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-white/5 px-4 py-2.5 text-sm font-bold outline-none focus:border-yellow-500 transition resize-none" />
                </div>
            </div>
        </IndustrialModal>

        {/* Modal de confirmación para creación de cuenta */}
        {confirmOpen && (
            <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setConfirmOpen(false)}>
                <div className="bg-white dark:bg-[#0d1117] rounded-3xl border border-slate-200 dark:border-white/10 shadow-2xl max-w-lg w-[calc(100%-2rem)] p-6 space-y-4 animate-in fade-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
                    <div className="flex items-start gap-3">
                        <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center shrink-0">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="text-amber-500"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                        </div>
                        <div className="flex-1 min-w-0">
                            <h3 className="text-sm font-black uppercase tracking-wider text-slate-900 dark:text-white">Confirmar creación de cuenta</h3>
                            <p className="text-[11px] font-bold text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                                Estás por crear la cuenta <strong className="text-slate-900 dark:text-white">{name.trim() || '(sin nombre)'}</strong>.
                            </p>
                            <div className="mt-3 p-3 rounded-xl bg-blue-50 dark:bg-blue-500/5 border border-blue-200 dark:border-blue-500/10 space-y-2">
                                <p className="text-[10px] font-black uppercase tracking-wider text-blue-700 dark:text-blue-400">💰 Información importante</p>
                                <ul className="text-[10px] font-bold text-blue-700 dark:text-blue-300 space-y-1.5 list-disc pl-4 leading-relaxed">
                                    <li>El saldo de la caja se define al <strong>abrir la primera sesión</strong>, no al crear la cuenta.</li>
                                    <li>Esto evita errores de tipeo y asegura que el saldo coincida exactamente con el efectivo físico contado.</li>
                                    <li>Una vez abierta la primera sesión, el sistema exige que el efectivo declarado coincida <strong>exactamente</strong> con el saldo del cajón.</li>
                                </ul>
                            </div>
                        </div>
                    </div>
                    <div className="flex justify-end gap-2 pt-2">
                        <button onClick={() => setConfirmOpen(false)}
                            className="px-4 py-2 text-[10px] font-black uppercase tracking-[0.2em] rounded-xl border border-slate-200 dark:border-white/10 hover:bg-slate-100 dark:hover:bg-white/5 transition active:scale-95">
                            Cancelar
                        </button>
                        <button onClick={doSubmit} disabled={submitting}
                            className="px-4 py-2 text-[10px] font-black uppercase tracking-[0.2em] rounded-xl bg-yellow-500 hover:bg-yellow-400 text-black transition active:scale-95 disabled:opacity-40 shadow-sm">
                            {submitting ? 'Creando…' : 'Sí, crear cuenta'}
                        </button>
                    </div>
                </div>
            </div>
        )}
        </>
    );
}
