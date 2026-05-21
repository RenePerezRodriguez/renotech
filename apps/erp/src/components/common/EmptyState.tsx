import { LucideIcon, Ghost } from "lucide-react";


interface EmptyStateProps {
    title: string;
    description: string;
    icon?: LucideIcon;
    action?: React.ReactNode;
}

export default function EmptyState({
    title,
    description,
    icon: Icon = Ghost,
    action
}: EmptyStateProps) {
    return (
        <div className="flex flex-col items-center justify-center p-5 md:p-6 text-center rounded-2xl border border-dashed border-slate-200 dark:border-white/10 bg-slate-50/50 dark:bg-[#020617]/50">
            <div className="w-16 h-16 rounded-2xl bg-slate-100 dark:bg-white/5 flex items-center justify-center mb-4 text-slate-400 dark:text-slate-500">
                <Icon size={32} strokeWidth={1.5} />
            </div>
            <h3 className="text-sm font-black uppercase text-slate-900 dark:text-white mb-1">
                {title}
            </h3>
            <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 max-w-xs mx-auto mb-6">
                {description}
            </p>
            {action && (
                <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
                    {action}
                </div>
            )}
        </div>
    );
}
