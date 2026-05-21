'use client';

import { useEffect, useRef, useState, useCallback } from 'react';

const IDLE_TIMEOUT = 2 * 60 * 60 * 1000;      // 2 hours
const WARNING_BEFORE = 5 * 60 * 1000;          // warn 5 min before logout
const TICK_INTERVAL = 1000;                     // check every second

interface UseIdleTimeoutOptions {
    onLogout: () => void;
    enabled?: boolean;
}

export function useIdleTimeout({ onLogout, enabled = true }: UseIdleTimeoutOptions) {
    const lastActivityRef = useRef(Date.now());
    const [showWarning, setShowWarning] = useState(false);
    const [remainingSeconds, setRemainingSeconds] = useState(300);
    const onLogoutRef = useRef(onLogout);
    onLogoutRef.current = onLogout;

    const resetActivity = useCallback(() => {
        lastActivityRef.current = Date.now();
        setShowWarning(false);
    }, []);

    useEffect(() => {
        if (!enabled) return;

        const events = ['mousemove', 'mousedown', 'keypress', 'touchstart', 'scroll', 'click'];

        let lastEventTime = 0;
        const handler = () => {
            const now = Date.now();
            if (now - lastEventTime < 5000) return; // throttle: max 1 reset per 5s
            lastEventTime = now;
            lastActivityRef.current = now;
            setShowWarning(false);
        };

        events.forEach(e => window.addEventListener(e, handler, { passive: true }));

        const tick = setInterval(() => {
            const idle = Date.now() - lastActivityRef.current;

            if (idle >= IDLE_TIMEOUT) {
                clearInterval(tick);
                onLogoutRef.current();
                return;
            }

            if (idle >= IDLE_TIMEOUT - WARNING_BEFORE) {
                const remaining = Math.ceil((IDLE_TIMEOUT - idle) / 1000);
                setShowWarning(true);
                setRemainingSeconds(remaining);
            }
        }, TICK_INTERVAL);

        return () => {
            events.forEach(e => window.removeEventListener(e, handler));
            clearInterval(tick);
        };
    }, [enabled]);

    return { showWarning, remainingSeconds, resetActivity };
}
