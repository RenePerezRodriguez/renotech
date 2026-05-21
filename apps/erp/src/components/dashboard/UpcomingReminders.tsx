'use client';

import { useEffect, useState, useCallback } from 'react';
import { ReminderService } from '@/services/ReminderService';
import { ClientReminder } from '@/types';
import { ensureDate } from '@/utils/dateHelpers';
import { Bell, Calendar, User, Phone, CheckCircle2, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';

interface UpcomingRemindersProps {
    branchId: string;
}

export default function UpcomingReminders({ branchId }: UpcomingRemindersProps) {
    const [reminders, setReminders] = useState<ClientReminder[]>([]);
    const [loading, setLoading] = useState(true);

    const fetchReminders = useCallback(async () => {
        try {
            const data = await ReminderService.getUpcomingReminders(branchId, 15); // Next 15 days
            setReminders(data);
        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
        }
    }, [branchId]);

    useEffect(() => {
        fetchReminders();
    }, [fetchReminders]);

    const handleComplete = async (id: string) => {
        try {
            await ReminderService.completeReminder(id, 'Completado desde Dashboard');
            toast.success('Recordatorio completado');
            fetchReminders();
        } catch {
            toast.error('Error al completar');
        }
    };

    if (loading) return (
        <div className="bg-white dark:bg-[#111827] rounded-3xl border border-slate-200 dark:border-white/10 p-5 shadow-xl animate-pulse">
            <div className="h-4 w-32 bg-slate-100 dark:bg-white/5 rounded-full mb-6" />
            <div className="space-y-4">
                {[1, 2, 3].map(i => <div key={i} className="h-16 w-full bg-slate-50 dark:bg-white/5 rounded-2xl" />)}
            </div>
        </div>
    );

    if (reminders.length === 0) return null;

    return (
        <div className="bg-white dark:bg-[#111827] rounded-3xl border border-slate-200 dark:border-white/10 p-5 shadow-xl flex flex-col h-full ring-1 ring-amber-500/10">
            <div className="flex items-center justify-between mb-8">
                <div>
                    <h2 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] flex items-center gap-2">
                        <Bell size={14} className="text-amber-500" />
                        CRM Predictivo
                    </h2>
                    <p className="text-lg font-black text-slate-900 dark:text-white mt-1 uppercase tracking-tighter">Próximos Mantenimientos</p>
                </div>
                <span className="bg-amber-500 text-black text-[10px] font-black px-2 py-1 rounded-xl">
                    {reminders.length} PENDIENTES
                </span>
            </div>

            <div className="space-y-4 flex-1 overflow-auto custom-scrollbar pr-1">
                {reminders.map((r) => (
                    <div 
                        key={r.id} 
                        className="group flex flex-col p-4 rounded-2xl bg-slate-50 dark:bg-white/5 border border-transparent hover:border-amber-500/20 transition-all hover:bg-white dark:hover:bg-white/5 shadow-sm hover:shadow-lg hover:shadow-amber-500/5"
                    >
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-[10px] font-black text-amber-600 dark:text-amber-400 uppercase tracking-widest flex items-center gap-1.5">
                                <Calendar size={12} />
                                {ensureDate(r.scheduledDate).toLocaleDateString('es-BO', { day: '2-digit', month: 'short' })}
                            </span>
                            <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button 
                                    onClick={() => handleComplete(r.id!)}
                                    className="p-1.5 bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500 hover:text-white rounded-xl transition-colors"
                                    title="Marcar como Completado"
                                >
                                    <CheckCircle2 size={12} />
                                </button>
                                <button 
                                    className="p-1.5 bg-slate-500/10 text-slate-500 hover:bg-slate-500 hover:text-white rounded-xl transition-colors"
                                    title="Ver Detalles"
                                >
                                    <ExternalLink size={12} />
                                </button>
                            </div>
                        </div>

                        <div className="space-y-1">
                            <div className="flex items-center gap-2">
                                <User size={12} className="text-slate-400" />
                                <p className="text-[11px] font-black text-slate-900 dark:text-white uppercase wrap-break-word">{r.clientName}</p>
                            </div>
                            <div className="flex items-center gap-2">
                                <div className="p-1.5 bg-white dark:bg-[#111827] rounded-xl border border-slate-100 dark:border-white/10">
                                    <p className="text-[10px] font-bold text-slate-600 dark:text-slate-400 wrap-break-word">{r.productName}</p>
                                </div>
                            </div>
                            {r.clientPhone && (
                                <a 
                                    href={`tel:${r.clientPhone}`}
                                    className="flex items-center gap-2 mt-2 text-blue-500 hover:text-blue-600 transition-colors"
                                >
                                    <Phone size={10} />
                                    <span className="text-[9px] font-black uppercase tracking-widest">{r.clientPhone}</span>
                                </a>
                            )}
                        </div>
                    </div>
                ))}
            </div>

            <button className="mt-6 w-full py-3 bg-slate-900 dark:bg-white text-white dark:text-black rounded-xl text-[10px] font-black uppercase tracking-widest hover:opacity-90 transition-opacity active:scale-[0.98]">
                Ver Todos los Recordatorios
            </button>
        </div>
    );
}
