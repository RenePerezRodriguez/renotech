'use client';

import { useAuth } from '@/contexts/AuthContext';
import { User, Mail, Shield, Save, UserCircle } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import ModuleHeader from '@/components/common/ModuleHeader';

export default function ProfilePage() {
    const { user, userName, role, refreshUserClaims } = useAuth();
    const [name, setName] = useState(userName || '');
    const [saving, setSaving] = useState(false);

    const handleSave = async () => {
        if (!user) return;
        setSaving(true);
        try {
            const { db } = await import('@/lib/firebase');
            const { updateDoc, doc } = await import('firebase/firestore');
            const { updateProfile } = await import('firebase/auth');

            // 1. Update Firestore
            await updateDoc(doc(db, 'users', user.uid), { displayName: name });

            // 2. Update Auth Profile
            await updateProfile(user, { displayName: name });

            toast.success("Perfil actualizado");
            await refreshUserClaims();
        } catch (error) {
            console.error("Error updating profile:", error);
            toast.error("Error al actualizar perfil");
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="flex-1 min-w-0 w-full max-w-full p-3 sm:p-4 md:p-6 lg:p-8 animate-in fade-in duration-500 flex flex-col space-y-4 sm:space-y-6 lg:space-y-8 bg-slate-50 dark:bg-[#020617] pb-20">
            <div className="max-w-3xl mx-auto w-full space-y-8">
                <ModuleHeader
                    title="Perfil de Operador"
                    subtitle="Gestión de Credenciales e Identidad Digital"
                    icon={UserCircle}
                    badge="Sincronizado"
                />

                <div className="bg-white dark:bg-[#111827] p-10 rounded-3xl border border-slate-200 dark:border-white/10 shadow-2xl space-y-10 transition-all duration-500 relative overflow-hidden">
                    {/* Decorative Background Icon */}
                    <User size={200} className="absolute -right-10 -bottom-10 opacity-[0.02] dark:opacity-[0.03] pointer-events-none rotate-12" />

                    <div className="flex flex-col md:flex-row items-center gap-10 pb-10 border-b border-slate-100 dark:border-white/10 relative z-10">
                        <div className="h-32 w-32 bg-slate-100 dark:bg-[#FFD700]/10 rounded-3xl flex items-center justify-center text-slate-400 dark:text-[#FFD700] shadow-inner group-hover:scale-105 transition-transform duration-500 border border-slate-200 dark:border-white/10">
                            <User size={64} strokeWidth={1.5} />
                        </div>
                        <div className="text-center md:text-left flex-1">
                            <div className="flex flex-col md:flex-row md:items-center gap-3 mb-2">
                                <h2 className="text-3xl font-black text-slate-900 dark:text-white uppercase tracking-tight">{userName}</h2>
                                <span className="inline-flex items-center gap-2 px-3 py-1 rounded-xl text-[9px] font-black uppercase tracking-widest bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20 w-fit mx-auto md:mx-0">
                                    <Shield size={12} strokeWidth={3} />
                                    {role || 'ADMINISTRADOR'}
                                </span>
                            </div>
                            <p className="text-sm font-bold text-slate-400 dark:text-slate-500 font-mono tracking-tight">{user?.email}</p>
                            
                            <div className="flex flex-wrap gap-4 mt-6 justify-center md:justify-start">
                                <div className="text-center md:text-left">
                                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] mb-1">Estado de Cuenta</p>
                                    <span className="text-xs font-black text-emerald-500 uppercase tracking-widest">Activo y Verificado</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8 relative z-10">
                        <div className="space-y-2">
                            <label className="block text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em] ml-1">Nombre Completo de Operador</label>
                            <div className="relative group">
                                <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-yellow-500 transition-colors">
                                    <User size={18} strokeWidth={2.5} />
                                </div>
                                <input
                                    type="text"
                                    value={name}
                                    onChange={e => setName(e.target.value)}
                                    className="w-full bg-slate-50 dark:bg-white/5 border border-slate-100 dark:border-white/10 rounded-2xl py-4 pl-12 pr-4 text-sm font-black text-slate-900 dark:text-white uppercase tracking-tight focus:bg-white dark:focus:bg-black/40 focus:border-yellow-500/50 outline-none transition-all shadow-sm focus:shadow-xl focus:shadow-yellow-500/5"
                                    placeholder="Ingrese nombre"
                                />
                            </div>
                        </div>
                        
                        <div className="space-y-2">
                            <label className="block text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em] ml-1">Dirección de Seguridad ID (Email)</label>
                            <div className="relative opacity-60">
                                <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">
                                    <Mail size={18} strokeWidth={2.5} />
                                </div>
                                <input
                                    type="email"
                                    value={user?.email || ''}
                                    disabled
                                    className="w-full bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-2xl py-4 pl-12 pr-4 text-sm font-bold text-slate-500 dark:text-white/40 cursor-not-allowed"
                                />
                            </div>
                        </div>
                    </div>

                    <div className="pt-10 flex justify-end relative z-10">
                        <button 
                            onClick={handleSave}
                            disabled={saving}
                            className="flex items-center gap-3 bg-slate-900 dark:bg-[#FFD700] text-white dark:text-black hover:opacity-90 px-10 py-4 rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] transition-all shadow-2xl shadow-slate-900/20 dark:shadow-[#FFD700]/20 disabled:opacity-50 active:scale-95"
                        >
                            {saving ? (
                                <div className="animate-spin border-2 border-current border-t-transparent rounded-full w-4 h-4" />
                            ) : (
                                <Save size={18} strokeWidth={3} />
                            )}
                            {saving ? 'Procesando...' : 'Actualizar Identidad'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
