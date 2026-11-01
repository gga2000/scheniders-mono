"use client";

// Resize handle component
export const ResizeHandle = ({ columnKey, onResizeStart, onDoubleClick }: { columnKey: string; onResizeStart: (key: string, e: React.MouseEvent) => void; onDoubleClick: (key: string) => void }) => (
    <div
        className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-blue-400/50 active:bg-blue-500/50 z-10 group-hover:bg-gray-300/30 transition-colors"
        onMouseDown={(e) => onResizeStart(columnKey, e)}
        onDoubleClick={(e) => { e.stopPropagation(); onDoubleClick(columnKey); }}
    />
);
