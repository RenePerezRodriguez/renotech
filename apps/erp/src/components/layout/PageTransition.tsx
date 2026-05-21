'use client';

interface Props {
    pathname: string;
    children: React.ReactNode;
}

export default function PageTransition({ pathname, children }: Props) {
    return (
        <div
            key={pathname}
            className="flex flex-col flex-1 min-w-0 min-h-0 w-full"
        >
            {children}
        </div>
    );
}
