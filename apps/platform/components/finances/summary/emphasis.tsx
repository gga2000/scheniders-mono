interface EmphasisProps {
    /** A sentence whose figures are wrapped in [[double brackets]]. */
    text: string;
    className?: string;
}

/** A sentence with its figures in bold: the parts of `text` inside [[double brackets]]. */
export function Emphasis({ text, className = "font-bold" }: EmphasisProps) {
    const parts = text.split(/\[\[(.+?)\]\]/);
    return (
        <>
            {parts.map((part, i) => {
                const key = `${i}:${part}`;
                return i % 2 === 1 ? <b key={key} className={className} dir="ltr">{part}</b> : <span key={key}>{part}</span>;
            })}
        </>
    );
}
