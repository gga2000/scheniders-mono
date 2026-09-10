// =====================================================================
// Section — video_block
// =====================================================================
// An embedded video with an optional heading and caption. YouTube and Vimeo
// links render through a click-to-play facade (see `./video_block.client`);
// a direct MP4/WebM file renders as a native player.
//
// Two rules the merchant does not have to think about:
//   * A link that is not recognisably a video renders nothing at all. The
//     previous parser treated every unrecognised string as a playable file,
//     so pasting a TikTok link, an Instagram reel, or a half-copied URL put a
//     black box on the storefront. A section that disappears is recoverable;
//     a broken player on a live store is not.
//   * Autoplay implies mute. Every current browser blocks an autoplaying
//     player with sound, so honouring "autoplay + unmuted" literally would
//     produce a frozen first frame.
// =====================================================================

import { z } from "zod";
import {
  resolveI18n,
  parseVideoUrl,
  videoEmbedSrc,
  videoPosterUrl,
} from "@scheniders/shared";
import {
  BentoCard,
  Section,
  SectionHeader,
} from "./helpers/primitives";
import { i18nStringSchema, i18nStringOptional } from "./_schema";
import { registerSection } from "./_registry";
import type { SectionDefinition } from "./_types";
import { VideoFacade } from "./video_block.client";

/**
 * Shape of the frame. Merchant footage in this market is usually shot on a
 * phone and is portrait; forcing it into 16:9 pillarboxes it with black bars.
 * Optional, so an existing section keeps the 16:9 it was rendering.
 */
const ASPECTS = {
  "16:9": "aspect-video",
  "9:16": "aspect-[9/16]",
  "1:1": "aspect-square",
  "4:5": "aspect-[4/5]",
} as const;

const schema = z.object({
  heading_i18n: i18nStringOptional,
  video_url: z.string().describe("video"),
  poster_url: z.string().describe("image").optional(),
  autoplay: z.boolean(),
  muted: z.boolean(),
  body_i18n: i18nStringOptional,
  aspect: z.enum(["16:9", "9:16", "1:1", "4:5"]).optional(),
});

type Props = z.infer<typeof schema>;

const defaultProps: Props = {
  heading_i18n: { en: "See it in motion", ar: "شاهده بالحركة" },
  video_url: "",
  poster_url: undefined,
  autoplay: false,
  muted: true,
  body_i18n: {
    en: "A short walkthrough of the new collection.",
    ar: "جولة قصيرة على التشكيلة الجديدة.",
  },
  aspect: undefined,
};

/** Fallback name for the player when the merchant set no heading. */
const PLAYER_LABEL = { en: "Video", ar: "فيديو" };
const PLAY_LABEL = { en: "Play video", ar: "شغّل الفيديو" };

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

  const video = parseVideoUrl(props.video_url);
  // No video, or a link this cannot play: render nothing rather than a frame
  // the shopper cannot use.
  if (!video) return null;

  const label = heading || resolveI18n(PLAYER_LABEL, locale);
  const frame = ASPECTS[props.aspect ?? "16:9"];

  return (
    <Section>
      {heading && <SectionHeader title={heading} color="pink" />}
      <BentoCard bg="ink" size="md" className="p-0 overflow-hidden">
        <div className={`relative w-full ${frame} bg-bk-ink`}>
          {video.provider === "file" ? (
            <video
              className="absolute inset-0 h-full w-full"
              src={video.src}
              poster={props.poster_url}
              controls
              // Autoplay only ever happens muted — see the header note.
              muted={props.muted || props.autoplay}
              autoPlay={props.autoplay}
              playsInline
              preload="metadata"
            />
          ) : props.autoplay ? (
            <iframe
              src={videoEmbedSrc(video, { autoplay: true, muted: props.muted })}
              title={label}
              loading="lazy"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowFullScreen
              className="absolute inset-0 h-full w-full"
            />
          ) : (
            <VideoFacade
              video={video}
              poster={props.poster_url ?? videoPosterUrl(video)}
              label={label}
              playLabel={resolveI18n(PLAY_LABEL, locale)}
            />
          )}
        </div>
      </BentoCard>
      {body && (
        <p className="mt-bk-md font-body text-sm sm:text-base text-bk-ink-soft max-w-2xl">
          {body}
        </p>
      )}
    </Section>
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
