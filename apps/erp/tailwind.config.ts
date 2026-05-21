import type { Config } from "tailwindcss";

const config: Config = {
    darkMode: 'class', // Enable manual dark mode toggle
    content: [
        "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
        "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
        "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
        "./src/**/*.{js,ts,jsx,tsx,mdx}",
    ],
    theme: {
        extend: {
            colors: {
                background: "var(--background)",
                foreground: "var(--foreground)",
            },
            // ─── Z-Index hierarchy ────────────────────────────────────────
            // sidebar: z-layout-sidebar (40)
            // header:  z-layout-header  (50)
            // modals:  z-modal          (200)
            // modal confirmations: z-modal-top (300)
            // dropdowns/tooltips: z-dropdown  (400)
            // critical overlays: z-overlay    (9000+)
            zIndex: {
                'layout-sidebar': '40',
                'layout-header':  '50',
                'modal':          '200',
                'modal-top':      '300',
                'dropdown':       '400',
                'overlay':        '9000',
                'overlay-top':    '9999',
            },
        },
    },
    plugins: [],
};
export default config;
