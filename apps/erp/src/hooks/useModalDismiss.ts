import { useEffect } from 'react';

/**
 * Hook unificado para cerrar modales con tecla Escape.
 * Para click-fuera, usar el handler `onBackdropClick` retornado en el div backdrop,
 * y `stopPropagation` en el panel interno.
 *
 * Uso:
 *   const { onBackdropClick } = useModalDismiss(isOpen, onClose);
 *   <div className="fixed inset-0 ..." onClick={onBackdropClick}>
 *     <div onClick={(e) => e.stopPropagation()}> ... </div>
 *   </div>
 */
export function useModalDismiss(
    isOpen: boolean,
    onClose: () => void,
    options: { closeOnEscape?: boolean; disabled?: boolean } = {}
) {
    const { closeOnEscape = true, disabled = false } = options;

    useEffect(() => {
        if (!isOpen || disabled || !closeOnEscape) return;
        const handler = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                e.stopPropagation();
                onClose();
            }
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [isOpen, disabled, closeOnEscape, onClose]);

    const onBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
        if (disabled) return;
        if (e.target === e.currentTarget) onClose();
    };

    return { onBackdropClick };
}
