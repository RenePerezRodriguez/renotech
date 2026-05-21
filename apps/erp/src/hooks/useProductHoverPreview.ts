import { useCallback, useRef, useState } from 'react';
import type { Product } from '@/types';

/**
 * Hook reutilizable para mostrar un preview de producto al pasar el cursor con delay.
 * Devuelve handlers para conectar a cualquier elemento y el estado actual del tooltip.
 */
export function useProductHoverPreview(delay = 1000) {
    const [hoverState, setHoverState] = useState<{ element: HTMLElement; product: Product } | null>(null);
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const onMouseEnter = useCallback((e: React.MouseEvent, product: Product) => {
        const el = e.currentTarget as HTMLElement;
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => {
            setHoverState({ element: el, product });
        }, delay);
    }, [delay]);

    const onMouseLeave = useCallback(() => {
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = null;
        setHoverState(null);
    }, []);

    const clear = useCallback(() => {
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = null;
        setHoverState(null);
    }, []);

    return { hoverState, onMouseEnter, onMouseLeave, clear };
}
