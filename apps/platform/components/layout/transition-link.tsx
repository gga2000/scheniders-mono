"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, ReactNode, useTransition } from "react";
import { cn } from "@/lib/utils";

interface TransitionLinkProps extends React.ComponentProps<typeof Link> {
    children: ReactNode;
    href: string;
    onMouseEnter?: () => void;
    onClick?: (e: React.MouseEvent<HTMLAnchorElement>) => void;
}

export function TransitionLink({ children, href, onMouseEnter, onClick, className, ...props }: TransitionLinkProps) {
    const router = useRouter();
    const [isPending, startTransition] = useTransition();

    const handleNavigate = useCallback(
        (e: React.MouseEvent<HTMLAnchorElement>) => {
            // Allow default open-in-new-tab behaviors
            if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) {
                return;
            }

            e.preventDefault();

            if (onClick) {
                onClick(e);
            }

            // Start a non-blocking transition for the heavy lifting of parsing JS & rendering
            startTransition(() => {
                router.push(href as string);
            });
        },
        [href, router, onClick]
    );

    return (
        <Link
            href={href}
            onMouseEnter={onMouseEnter}
            onClick={handleNavigate}
            className={cn(
                className,
                isPending && "opacity-80 scale-[0.98] pointer-events-none transition-all duration-200"
            )}
            {...props}
        >
            {children}
            {isPending && (
                <div className="absolute right-3 top-1/2 -translate-y-1/2 w-3 h-3 border-2 border-[var(--primary)] border-t-transparent rounded-full animate-spin" />
            )}
        </Link>
    );
}
