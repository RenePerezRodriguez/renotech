'use client';

// IMPORTANTE: NO usar transformaciones (slide-in-from-*, zoom-in-*, translate-*) en este wrapper.
// Cualquier `transform` aquí crea un containing block para `position: fixed`, atrapando TODOS
// los modales debajo del Header (z-110). Solo usar fade/opacity.
export default function Template({ children }: { children: React.ReactNode }) {
    return (
        <div className="animate-in fade-in duration-300 ease-in-out">
            {children}
        </div>
    );
}
