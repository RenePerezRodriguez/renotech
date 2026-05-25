'use client';

import { useState, useRef, useEffect } from 'react';
import { HelpCircle, X, Play, RotateCcw } from 'lucide-react';
import { useTour } from '@/hooks/useTour';
import { TOUR_DEFINITIONS } from '@/lib/tours/definitions';
import { useAuth } from '@/contexts/AuthContext';

interface Props {
  /** Tour IDs relevant to the current page/module */
  tourIds: string[];
  className?: string;
}

/**
 * Botón "?" contextual que aparece en cualquier módulo.
 * Muestra un menú con los tours disponibles y los lanza.
 */
export default function TourButton({ tourIds, className = '' }: Props) {
  const { startTour, getSavedState } = useTour();
  const { role } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Filter tours by role
  const availableTours = tourIds
    .map(id => TOUR_DEFINITIONS[id])
    .filter(Boolean)
    .filter(t => !t.allowedRoles || (role && t.allowedRoles.includes(role)));

  const savedState = getSavedState();
  const hasSaved = savedState && tourIds.includes(savedState.tourId);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  if (!availableTours.length) return null;

  return (
    <div ref={ref} className={`relative ${className}`}>
      <button
        onClick={() => setOpen(v => !v)}
        aria-label="Guías interactivas"
        title="Guías interactivas"
        className="
          w-8 h-8 rounded-lg flex items-center justify-center
          text-slate-400 hover:text-slate-600 dark:hover:text-slate-300
          hover:bg-slate-100 dark:hover:bg-slate-800
          transition-colors border border-slate-200 dark:border-slate-700
        "
      >
        {open ? <X size={14} /> : <HelpCircle size={14} />}
      </button>

      {open && (
        <div
          className="
            absolute right-0 top-10 z-50 w-72
            bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700
            rounded-xl shadow-xl shadow-slate-900/10 dark:shadow-black/40
            overflow-hidden
            animate-in fade-in slide-in-from-top-2 duration-150
          "
          role="menu"
        >
          <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800">
            <p className="text-xs font-black uppercase tracking-widest text-slate-700 dark:text-slate-300">
              Guías interactivas
            </p>
            <p className="text-[10px] text-slate-400 mt-0.5">
              Te guío paso a paso por el sistema
            </p>
          </div>

          {hasSaved && (
            <button
              className="w-full px-4 py-2.5 flex items-center gap-3 hover:bg-amber-50 dark:hover:bg-amber-900/20 text-left border-b border-slate-100 dark:border-slate-800 group"
              onClick={() => {
                setOpen(false);
                const state = getSavedState();
                if (state) startTour(state.tourId, { startStep: state.stepIndex });
              }}
            >
              <span className="w-6 h-6 rounded-md bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center text-amber-600 shrink-0">
                <RotateCcw size={12} strokeWidth={2.5} />
              </span>
              <div>
                <p className="text-xs font-semibold text-amber-700 dark:text-amber-400">Continuar donde lo dejé</p>
                <p className="text-[10px] text-slate-400">
                  {TOUR_DEFINITIONS[savedState!.tourId]?.title}
                </p>
              </div>
            </button>
          )}

          <div className="py-1">
            {availableTours.map(tour => (
              <button
                key={tour.id}
                role="menuitem"
                className="w-full px-4 py-2.5 flex items-center gap-3 hover:bg-slate-50 dark:hover:bg-slate-800 text-left group"
                onClick={() => { setOpen(false); startTour(tour.id); }}
              >
                <span className="w-6 h-6 rounded-md bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-500 group-hover:bg-slate-900 group-hover:text-white dark:group-hover:bg-white dark:group-hover:text-slate-900 transition-colors shrink-0">
                  <Play size={10} />
                </span>
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-slate-800 dark:text-slate-200 truncate">{tour.title}</p>
                  <p className="text-[10px] text-slate-400 truncate">{tour.estimatedMinutes} min · {tour.steps.length} pasos</p>
                </div>
              </button>
            ))}
          </div>

        </div>
      )}
    </div>
  );
}
