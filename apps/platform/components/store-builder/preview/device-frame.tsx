"use client";

import { cn } from "@/lib/utils";
import { motion } from "framer-motion";

interface DeviceFrameProps {
  device: "desktop" | "tablet" | "mobile";
  children: React.ReactNode;
}

const deviceConfig = {
  desktop: {
    maxWidth: "100%",
    borderRadius: "0.75rem",
    padding: "0",
  },
  tablet: {
    maxWidth: "768px",
    borderRadius: "1rem",
    padding: "0",
  },
  mobile: {
    maxWidth: "375px",
    borderRadius: "2.5rem",
    padding: "0",
  },
} as const;

export function DeviceFrame({ device, children }: DeviceFrameProps) {
  const config = deviceConfig[device];

  return (
    <motion.div
      layout
      className={cn("mx-auto w-full overflow-hidden bg-white", {
        "rounded-xl border border-(--card-border)": device === "desktop",
        "rounded-2xl border-2 border-gray-300 shadow-lg": device === "tablet",
        "rounded-[2.5rem] border-[3px] border-gray-800 shadow-xl":
          device === "mobile",
      })}
      animate={{
        maxWidth: config.maxWidth,
        borderRadius: config.borderRadius,
      }}
      transition={{
        type: "spring",
        stiffness: 300,
        damping: 30,
        mass: 0.8,
      }}
    >
      {/* Mobile notch */}
      {device === "mobile" && (
        <div className="relative flex h-7 items-center justify-center bg-white">
          <div className="h-[5px] w-[120px] rounded-full bg-gray-900" />
        </div>
      )}

      {/* Content area */}
      <div
        className={cn("w-full overflow-hidden bg-white", {
          "min-h-[500px]": device === "desktop",
          "min-h-[600px]": device === "tablet",
          "min-h-[650px]": device === "mobile",
        })}
      >
        {children}
      </div>

      {/* Mobile home indicator */}
      {device === "mobile" && (
        <div className="flex h-6 items-center justify-center bg-white">
          <div className="h-[4px] w-[100px] rounded-full bg-gray-300" />
        </div>
      )}
    </motion.div>
  );
}
