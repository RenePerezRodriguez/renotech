"use client"

import { useTheme } from "@/contexts/ThemeContext"
import { Toaster as Sonner, toast } from "sonner"
import { useEffect, useRef, useCallback } from "react"

type ToasterProps = React.ComponentProps<typeof Sonner>

function playNotificationSound(type: 'success' | 'error' | 'info') {
    try {
        const ctx = new AudioContext();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        gain.gain.value = 0.08;

        if (type === 'success') {
            osc.frequency.value = 880;
            osc.type = 'sine';
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
            osc.start(ctx.currentTime);
            osc.stop(ctx.currentTime + 0.15);
        } else if (type === 'error') {
            osc.frequency.value = 300;
            osc.type = 'triangle';
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
            osc.start(ctx.currentTime);
            osc.stop(ctx.currentTime + 0.25);
        } else {
            osc.frequency.value = 660;
            osc.type = 'sine';
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.1);
            osc.start(ctx.currentTime);
            osc.stop(ctx.currentTime + 0.1);
        }

        osc.onended = () => ctx.close();
    } catch {
        // AudioContext not available — silent fallback
    }
}

const Toaster = ({ ...props }: ToasterProps) => {
    const { theme } = useTheme()
    const originalToast = useRef({ success: toast.success, error: toast.error, info: toast.info, warning: toast.warning });

    const wrapWithSound = useCallback(() => {
        const orig = originalToast.current;

        // Mensajes técnicos del SDK que NUNCA deben mostrarse al usuario.
        // Si llegan a un toast es porque algún catch genérico propagó err.message
        // sin traducir. Los registramos en consola para debug, pero no spameamos UI.
        const isRawSdkError = (msg: unknown): boolean => {
            if (typeof msg !== 'string') return false;
            return /missing or insufficient permissions|firebaseerror|firestore\/permission-denied|quota exceeded|failed to get document/i.test(msg);
        };

        toast.success = (...args: Parameters<typeof toast.success>) => {
            playNotificationSound('success');
            return orig.success(...args);
        };
        toast.error = (...args: Parameters<typeof toast.error>) => {
            if (isRawSdkError(args[0])) {
                console.error('[toast.error suppressed - raw SDK error]:', ...args);
                return '' as ReturnType<typeof orig.error>;
            }
            playNotificationSound('error');
            return orig.error(...args);
        };
        toast.info = (...args: Parameters<typeof toast.info>) => {
            playNotificationSound('info');
            return orig.info(...args);
        };
        toast.warning = (...args: Parameters<typeof toast.warning>) => {
            if (isRawSdkError(args[0])) {
                console.error('[toast.warning suppressed - raw SDK error]:', ...args);
                return '' as ReturnType<typeof orig.warning>;
            }
            playNotificationSound('error');
            return orig.warning(...args);
        };
    }, []);

    useEffect(() => {
        wrapWithSound();
    }, [wrapWithSound]);

    return (
        <Sonner
            position="top-center"
            theme={theme as ToasterProps["theme"]}
            className="toaster group"
            toastOptions={{
                classNames: {
                    toast:
                        "group toast group-[.toaster]:bg-white group-[.toaster]:text-slate-950 group-[.toaster]:border-slate-200 group-[.toaster]:shadow-lg dark:group-[.toaster]:bg-gray-950 dark:group-[.toaster]:text-gray-50 dark:group-[.toaster]:border-gray-800",
                    description: "group-[.toast]:text-slate-500 dark:group-[.toast]:text-slate-400",
                    actionButton:
                        "group-[.toast]:bg-slate-900 group-[.toast]:text-gray-50 dark:group-[.toast]:bg-slate-50 dark:group-[.toast]:text-slate-900",
                    cancelButton:
                        "group-[.toast]:bg-slate-100 group-[.toast]:text-slate-500 dark:group-[.toast]:bg-gray-800 dark:group-[.toast]:text-slate-400",
                },
            }}
            {...props}
        />
    )
}

export { Toaster }
