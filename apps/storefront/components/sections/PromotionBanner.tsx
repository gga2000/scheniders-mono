"use client";

import { useState, useEffect } from "react";

interface PromotionBannerProps {
  data: Record<string, unknown>;
}

function useCountdown(endDate: string | null) {
  const [timeLeft, setTimeLeft] = useState<{
    days: number;
    hours: number;
    minutes: number;
    seconds: number;
  } | null>(null);

  useEffect(() => {
    if (!endDate) return;

    const target = new Date(endDate).getTime();

    const update = () => {
      const now = Date.now();
      const diff = target - now;

      if (diff <= 0) {
        setTimeLeft(null);
        return;
      }

      setTimeLeft({
        days: Math.floor(diff / (1000 * 60 * 60 * 24)),
        hours: Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)),
        minutes: Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60)),
        seconds: Math.floor((diff % (1000 * 60)) / 1000),
      });
    };

    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [endDate]);

  return timeLeft;
}

export default function PromotionBanner({ data }: PromotionBannerProps) {
  const text = (data.text as string) || "";
  const bgColor = (data.background_color as string) || "#3b82f6";
  const linkUrl = (data.link_url as string) || "";
  const countdownEnd = (data.countdown_end as string) || null;

  const timeLeft = useCountdown(countdownEnd);

  if (!text) return null;

  const content = (
    <div
      className="py-4 px-4 text-center text-white"
      style={{ backgroundColor: bgColor }}
    >
      <p className="text-lg font-bold mb-2">{text}</p>

      {timeLeft && (
        <div className="flex items-center justify-center gap-3 text-sm" dir="ltr">
          {[
            { value: timeLeft.days, label: "يوم" },
            { value: timeLeft.hours, label: "ساعة" },
            { value: timeLeft.minutes, label: "دقيقة" },
            { value: timeLeft.seconds, label: "ثانية" },
          ].map(({ value, label }) => (
            <div key={label} className="flex flex-col items-center">
              <span className="text-2xl font-bold tabular-nums">
                {String(value).padStart(2, "0")}
              </span>
              <span className="text-xs opacity-80">{label}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  if (linkUrl) {
    return <a href={linkUrl} className="block hover:opacity-95 transition">{content}</a>;
  }

  return content;
}
