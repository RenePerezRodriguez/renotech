'use client';

import { useState } from 'react';
import { AlertTriangle, AlertCircle, Info, X, ChevronDown, ChevronUp, ExternalLink } from 'lucide-react';
import type { ChatSystemAlert } from '@/types/chat';
import { useRouter } from 'next/navigation';

interface Props {
  alerts: ChatSystemAlert[];
  onDismiss: (id: string) => void;
}

const SEVERITY_CONFIG = {
  critical: {
    border: 'border-red-200 dark:border-red-800',
    bg: 'bg-red-50 dark:bg-red-950/30',
    icon: AlertTriangle,
    iconColor: 'text-red-500',
    titleColor: 'text-red-700 dark:text-red-400',
    msgColor: 'text-red-600 dark:text-red-500',
    btnColor: 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300 hover:bg-red-200 dark:hover:bg-red-900/60',
  },
  warning: {
    border: 'border-amber-200 dark:border-amber-800',
    bg: 'bg-amber-50 dark:bg-amber-950/30',
    icon: AlertCircle,
    iconColor: 'text-amber-500',
    titleColor: 'text-amber-700 dark:text-amber-400',
    msgColor: 'text-amber-600 dark:text-amber-500',
    btnColor: 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 hover:bg-amber-200 dark:hover:bg-amber-900/60',
  },
  info: {
    border: 'border-blue-200 dark:border-blue-800',
    bg: 'bg-blue-50 dark:bg-blue-950/30',
    icon: Info,
    iconColor: 'text-blue-500',
    titleColor: 'text-blue-700 dark:text-blue-400',
    msgColor: 'text-blue-600 dark:text-blue-500',
    btnColor: 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 hover:bg-blue-200 dark:hover:bg-blue-900/60',
  },
};

export default function AlertsPanel({ alerts, onDismiss }: Props) {
  const [collapsed, setCollapsed] = useState(true);
  const router = useRouter();

  if (alerts.length === 0) return null;

  const criticalCount = alerts.filter((a) => a.severity === 'critical').length;
  const warningCount = alerts.filter((a) => a.severity === 'warning').length;

  return (
    <div className="shrink-0 border-b border-slate-100 dark:border-slate-800">
      {/* Header strip */}
      <button
        onClick={() => setCollapsed((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-2 bg-slate-50/80 dark:bg-slate-900/60 hover:bg-slate-100 dark:hover:bg-slate-800/60 transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className="text-[9px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Alertas
          </span>
          <div className="flex items-center gap-1">
            {criticalCount > 0 && (
              <span className="px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-400">
                {criticalCount} crítica{criticalCount > 1 ? 's' : ''}
              </span>
            )}
            {warningCount > 0 && (
              <span className="px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400">
                {warningCount} aviso{warningCount > 1 ? 's' : ''}
              </span>
            )}
            {criticalCount === 0 && warningCount === 0 && (
              <span className="px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400">
                {alerts.length} info
              </span>
            )}
          </div>
        </div>
        {collapsed
          ? <ChevronDown size={12} className="text-slate-400" />
          : <ChevronUp size={12} className="text-slate-400" />
        }
      </button>

      {/* Alert cards */}
      {!collapsed && (
        <div className="px-3 py-2 space-y-2 max-h-56 overflow-y-auto">
          {alerts.map((alert) => {
            const cfg = SEVERITY_CONFIG[alert.severity];
            const Icon = cfg.icon;
            return (
              <div
                key={alert.id}
                className={`flex items-start gap-2.5 p-2.5 rounded-xl border ${cfg.bg} ${cfg.border}`}
                role="alert"
              >
                <Icon size={14} className={`shrink-0 mt-0.5 ${cfg.iconColor}`} />
                <div className="flex-1 min-w-0">
                  <p className={`text-[11px] font-bold leading-tight ${cfg.titleColor}`}>
                    {alert.title}
                  </p>
                  <p className={`text-[10px] mt-0.5 leading-snug ${cfg.msgColor}`}>
                    {alert.message}
                  </p>
                  {alert.action && (
                    <button
                      onClick={() => router.push(alert.action!.route)}
                      className={`mt-1.5 inline-flex items-center gap-1 text-[9px] font-semibold px-2 py-1 rounded-md transition-colors ${cfg.btnColor}`}
                    >
                      {alert.action.label}
                      <ExternalLink size={9} />
                    </button>
                  )}
                </div>
                <button
                  onClick={() => onDismiss(alert.id)}
                  title="Descartar"
                  className="shrink-0 p-0.5 rounded text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
                >
                  <X size={11} />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
