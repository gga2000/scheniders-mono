"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, ReactNode, useTransition, useState, useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { useQueryClient } from "@tanstack/react-query";

interface TransitionLinkProps extends React.ComponentProps<typeof Link> {
    children: ReactNode;
    href: string;
    onMouseEnter?: () => void;
    onClick?: (e: React.MouseEvent<HTMLAnchorElement>) => void;
}

export function TransitionLink({ children, href, onMouseEnter, onClick, className, ...props }: TransitionLinkProps) {
    const router = useRouter();
    const [isPending, startTransition] = useTransition();
    const queryClient = useQueryClient();
    const [hasPrefetched, setHasPrefetched] = useState(false);
    const linkRef = useRef<HTMLAnchorElement>(null);

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

    const handlePrefetch = useCallback(() => {
        if (onMouseEnter) {
            onMouseEnter();
        }

        // Predict intent: High probability the user will click soon.
        if (!hasPrefetched) {
            // Let Next.js prefetch the RSC payload for the page
            router.prefetch(href as string);
            setHasPrefetched(true);
        }
    }, [href, onMouseEnter, router, hasPrefetched]);

    // Use IntersectionObserver for eager prefetching, especially beneficial on mobile
    useEffect(() => {
        if (hasPrefetched || !linkRef.current) return;

        const observer = new IntersectionObserver(
            (entries) => {
                if (entries[0].isIntersecting) {
                    router.prefetch(href as string);
                    setHasPrefetched(true);
                    observer.disconnect();
                }
            },
            { rootMargin: "50px" } // Prefetch slightly before it enters the viewport
        );

        observer.observe(linkRef.current);

        return () => observer.disconnect();
    }, [href, hasPrefetched, router]);

    return (
        <Link
            ref={linkRef}
            href={href}
            onMouseEnter={handlePrefetch}
            onTouchStart={handlePrefetch} // Predict intent on mobile touch start
            onFocus={handlePrefetch} // Also prefetch on keyboard focus
            onClick={handleNavigate}
            prefetch={false} // We handle it manually on hover to save initial bandwidth
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
