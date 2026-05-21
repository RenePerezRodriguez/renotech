'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';

export default function BranchesRedirectPage() {
    const router = useRouter();

    useEffect(() => {
        router.replace('/configuracion/sucursales');
    }, [router]);

    return (
        <div className="flex items-center justify-center h-full">
            <Loader2 className="animate-spin text-yellow-500" size={32} />
        </div>
    );
}


