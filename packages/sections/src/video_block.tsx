// =====================================================================
// Section — video_block
// =====================================================================
// Inline embedded video. Detects YouTube / Vimeo URLs and renders an
// iframe; otherwise renders a native <video> for MP4 / direct files.
// =====================================================================

import { z } from "zod";
import { resolveI18n } from "@scheniders/shared";
import {
  BentoCard,
  ScribbleHeading,
} from "./helpers/primitives";
import { i18nStringSchema, i18nStringOptional } from "./_schema";
import { registerSection } from "./_registry";
import type { SectionDefinition } from "./_types";

const schema = z.object({
  heading_i18n: i18nStringOptional,
  video_url: z.string().describe("video"),
  poster_url: z.string().describe("image").optional(),
  autoplay: z.boolean(),
  muted: z.boolean(),
  body_i18n: i18nStringOptional,
});

type Props = z.infer<typeof schema>;

const defaultProps: Props = {
  heading_i18n: { en: "See it in motion", ar: "شاهده بالحركة" },
  video_url: "",
  poster_url: undefined,
  autoplay: false,
  muted: true,
  body_i18n: {
    en: "A 45-second walkthrough of the new collection.",
    ar: "جولة قصيرة بـ 45 ثانية على التشكيلة الجديدة.",
  },
};

interface ParsedEmbed {
  kind: "youtube" | "vimeo" | "file" | "none";
  src: string;
}

function parseVideoUrl(url: string): ParsedEmbed {
  if (!url) return { kind: "none", src: "" };
  // YouTube — watch?v=, youtu.be/, /embed/, /shorts/
  const yt =
    url.match(/youtu\.be\/([\w-]{6,})/) ||
    url.match(/[?&]v=([\w-]{6,})/) ||
    url.match(/youtube\.com\/embed\/([\w-]{6,})/) ||
    url.match(/youtube\.com\/shorts\/([\w-]{6,})/);
  if (yt) return { kind: "youtube", src: `https://www.youtube.com/embed/${yt[1]}` };

  // Vimeo
  const vm =
    url.match(/vimeo\.com\/(\d+)/) ||
    url.match(/player\.vimeo\.com\/video\/(\d+)/);
  if (vm) return { kind: "vimeo", src: `https://player.vimeo.com/video/${vm[1]}` };

  // Direct file
  if (/\.(mp4|webm|ogv|mov)(\?|$)/i.test(url)) {
    return { kind: "file", src: url };
  }
  return { kind: "file", src: url };
}

function VideoBlock({
  props,
  ctx,
}: {
  props: Props;
  ctx: import("./_types").SectionRenderContext;
}) {
  const locale = ctx.runtime.locale;
  const heading = resolveI18n(props.heading_i18n, locale);
  const body = resolveI18n(props.body_i18n, locale);
  const parsed = parseVideoUrl(props.video_url);

  if (parsed.kind === "none") return null;

  const params = new URLSearchParams();
  if (props.autoplay) params.set("autoplay", "1");
  if (props.muted) params.set("muted", "1");
  if (parsed.kind === "youtube") {
    params.set("playsinline", "1");
    params.set("rel", "0");
  }
  const iframeSrc =
    parsed.kind === "youtube" || parsed.kind === "vimeo"
      ? `${parsed.src}?${params.toString()}`
      : "";

  return (
    <section className="px-4 py-8">
      {heading && (
        <ScribbleHeading color="pink" className="mb-5">
          {heading}
        </ScribbleHeading>
      )}
      <BentoCard bg="ink" size="md" className="p-0 overflow-hidden">
        <div className="relative w-full aspect-video bg-black">
          {parsed.kind === "youtube" || parsed.kind === "vimeo" ? (
            <iframe
              src={iframeSrc}
              title={heading || "Video"}
              loading="lazy"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowFullScreen
              className="absolute inset-0 w-full h-full"
            />
          ) : (
            <video
              className="absolute inset-0 w-full h-full"
              src={parsed.src}
              poster={props.poster_url}
              controls
              muted={props.muted}
              autoPlay={props.autoplay}
              playsInline
              preload="metadata"
            />
          )}
        </div>
      </BentoCard>
      {body && (
        <p className="mt-4 font-body text-sm sm:text-base text-candy-ink/80 max-w-2xl">
          {body}
        </p>
      )}
    </section>
  );
}

const definition: SectionDefinition<Props> = {
  type: "video_block",
  category: "content",
  name: { en: "Video block", ar: "كتلة فيديو" },
  description: {
    en: "Embedded YouTube, Vimeo, or MP4 video with optional caption.",
    ar: "فيديو مضمَّن من يوتيوب أو فيميو أو ملف MP4 مع نص اختياري.",
  },
  thumbnail: "/sections/video_block.svg",
  valid_on: ["home", "product", "about"],
  schema,
  defaultProps,
  render: VideoBlock,
};

registerSection(definition);
export default definition;
