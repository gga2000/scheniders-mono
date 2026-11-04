/** The Prime pill on a home card: Prime's logo, named for screen readers. */
export function PrimeMark({ label }: { label: string }) {
    return (
        <span role="img" aria-label={label} className="inline-flex h-6 items-center rounded-full bg-[#315EA8] px-2.5">
            <span aria-hidden="true" className="h-2 w-[26px] bg-white [mask:url(/assets/prime-mark.svg)_center/contain_no-repeat]" />
        </span>
    );
}
