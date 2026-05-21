import { cn } from "@/lib/utils"

function Skeleton({
    className,
    ...props
}: React.HTMLAttributes<HTMLDivElement>) {
    return (
        <div
            className={cn("animate-pulse rounded-xl bg-gray-200 dark:bg-white/5", className)}
            {...props}
        />
    )
}

export { Skeleton }
