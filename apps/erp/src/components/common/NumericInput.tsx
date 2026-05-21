'use client';

import { forwardRef, type InputHTMLAttributes, type KeyboardEvent, type ChangeEvent, type FocusEvent } from 'react';

interface NumericInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'onChange' | 'inputMode'> {
    value: string | number;
    onChange: (value: string) => void;
    allowNegative?: boolean;
}

/**
 * Numeric input that uses type="text" + inputMode="decimal" internally.
 * This avoids the Chrome limitation where .select() doesn't work on type="number".
 *
 * Features:
 * - Blocks invalid keys (e, E, +, and optionally -)
 * - Strips leading zeros (010 → 10, but keeps 0.5)
 * - Prevents multiple dots
 * - Selects all text on focus
 * - Shows numeric keyboard on mobile via inputMode="decimal"
 */
const NumericInput = forwardRef<HTMLInputElement, NumericInputProps>(
    ({ value, onChange, allowNegative = false, onKeyDown, onFocus, ...props }, ref) => {
        const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
            const blocked = allowNegative ? ['e', 'E', '+'] : ['-', 'e', 'E', '+'];
            if (blocked.includes(e.key)) e.preventDefault();
            onKeyDown?.(e);
        };

        const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
            let val = e.target.value;

            // Allow only digits, dot, and optionally minus
            const pattern = allowNegative ? /[^0-9.\-]/g : /[^0-9.]/g;
            val = val.replace(pattern, '');

            // Strip leading zeros (keep "0." for decimals, keep lone "0")
            val = val.replace(/^(-?)0+(\d)/, '$1$2');

            // Prevent multiple dots
            const dotIdx = val.indexOf('.');
            if (dotIdx !== -1) {
                val = val.slice(0, dotIdx + 1) + val.slice(dotIdx + 1).replace(/\./g, '');
            }

            // Minus only at start
            if (allowNegative) {
                const body = val.slice(1);
                if (body.includes('-')) {
                    val = val[0] + body.replace(/-/g, '');
                }
            }

            onChange(val);
        };

        const handleFocus = (e: FocusEvent<HTMLInputElement>) => {
            e.target.select();
            onFocus?.(e);
        };

        return (
            <input
                ref={ref}
                type="text"
                inputMode="decimal"
                {...props}
                value={value}
                onChange={handleChange}
                onKeyDown={handleKeyDown}
                onFocus={handleFocus}
            />
        );
    }
);

NumericInput.displayName = 'NumericInput';

export default NumericInput;
