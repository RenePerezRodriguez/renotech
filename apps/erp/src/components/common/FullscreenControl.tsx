'use client';

import { useState, useEffect, useCallback } from 'react';
import { Maximize, Minimize } from 'lucide-react';
import clsx from 'clsx';

// Vendor-prefixed Fullscreen API (Safari, Firefox, IE/Edge legacy)
interface FullscreenDocument extends Document {
    webkitFullscreenElement?: Element | null;
    mozFullScreenElement?: Element | null;
    msFullscreenElement?: Element | null;
    webkitExitFullscreen?: () => Promise<void>;
    mozCancelFullScreen?: () => Promise<void>;
    msExitFullscreen?: () => Promise<void>;
}
interface FullscreenElement extends HTMLElement {
    webkitRequestFullscreen?: () => Promise<void>;
    mozRequestFullScreen?: () => Promise<void>;
    msRequestFullscreen?: () => Promise<void>;
}

/**
 * Boton compacto para entrar/salir de pantalla completa.
 * Disenado para integrarse al Header, no como widget flotante.
 */
export default function FullscreenControl() {
    const [isFullscreen, setIsFullscreen] = useState(false);

    useEffect(() => {
        const handleFullscreenChange = () => {
            const doc = document as FullscreenDocument;
            const active = !!(
                doc.fullscreenElement ||
                doc.webkitFullscreenElement ||
                doc.mozFullScreenElement ||
                doc.msFullscreenElement
            );
            setIsFullscreen(active);
        };

        document.addEventListener('fullscreenchange', handleFullscreenChange);
        document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
        document.addEventListener('mozfullscreenchange', handleFullscreenChange);
        document.addEventListener('MSFullscreenChange', handleFullscreenChange);

        return () => {
            document.removeEventListener('fullscreenchange', handleFullscreenChange);
            document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
            document.removeEventListener('mozfullscreenchange', handleFullscreenChange);
            document.removeEventListener('MSFullscreenChange', handleFullscreenChange);
        };
    }, []);

    const toggleFullscreen = useCallback(async () => {
        try {
            const docEl = document.documentElement as FullscreenElement;
            const doc = document as FullscreenDocument;

            const active = !!(
                doc.fullscreenElement ||
                doc.webkitFullscreenElement ||
                doc.mozFullScreenElement ||
                doc.msFullscreenElement
            );

            if (!active) {
                if (docEl.requestFullscreen) await docEl.requestFullscreen();
                else if (docEl.webkitRequestFullscreen) await docEl.webkitRequestFullscreen();
                else if (docEl.mozRequestFullScreen) await docEl.mozRequestFullScreen();
                else if (docEl.msRequestFullscreen) await docEl.msRequestFullscreen();
            } else {
                if (doc.exitFullscreen) await doc.exitFullscreen();
                else if (doc.webkitExitFullscreen) await doc.webkitExitFullscreen();
                else if (doc.mozCancelFullScreen) await doc.mozCancelFullScreen();
                else if (doc.msExitFullscreen) await doc.msExitFullscreen();
            }
        } catch {
            // Fullscreen toggle failed silently
        }
    }, []);

    return (
        <button
            type="button"
            onClick={toggleFullscreen}
            title={isFullscreen ? 'Salir de pantalla completa (ESC)' : 'Pantalla completa (F11)'}
            aria-label={isFullscreen ? 'Salir de pantalla completa' : 'Pantalla completa'}
            className={clsx(
                'hidden sm:inline-flex w-9 h-9 items-center justify-center rounded-xl border transition-colors',
                isFullscreen
                    ? 'text-yellow-700 bg-yellow-500/10 border-yellow-500/30 hover:bg-yellow-500/20 dark:text-yellow-400 dark:border-yellow-500/20'
                    : 'bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200 dark:bg-white/5 dark:text-slate-300 dark:border-white/10 dark:hover:bg-white/10'
            )}
        >
            {isFullscreen ? <Minimize size={16} strokeWidth={2.5} /> : <Maximize size={16} strokeWidth={2.5} />}
        </button>
    );
}