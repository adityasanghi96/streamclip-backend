import axios from "axios";
import { Channel } from "../db/entities/Channel";
import { Clip } from "../db/entities/Clip";
import { ENV } from "../env";

export function clipPageUrl(
  clip: Pick<Clip, "provider" | "liveVideoId" | "offsetSeconds" | "source">,
  channel?: Channel | null
) {
  const offset = Number(clip.offsetSeconds) || 0;
  if (clip.provider === "twitch") return `https://clips.twitch.tv/${clip.liveVideoId}`;
  if (clip.provider === "kick") {
    const slug = channel?.handle || clip.liveVideoId;
    return clip.source === "native"
      ? `https://kick.com/${slug}/clips/${clip.liveVideoId}`
      : `https://kick.com/${slug}`;
  }
  if (clip.source === "native" && clip.liveVideoId.startsWith("Ug")) {
    return `https://www.youtube.com/clip/${clip.liveVideoId}`;
  }
  return `https://www.youtube.com/watch?v=${clip.liveVideoId}&t=${offset}s`;
}

export function formatOffset(seconds: number) {
  const h = Math.floor(seconds / 3600).toString().padStart(2, "0");
  const m = Math.floor((seconds % 3600) / 60).toString().padStart(2, "0");
  const s = (seconds % 60).toString().padStart(2, "0");
  return `${h}:${m}:${s}`;
}

export async function postClipToDiscord(channel: Channel, clip: Clip, webhookUrl: string) {
  const url = clipPageUrl(clip, channel);
  const offset = Number(clip.offsetSeconds) || 0;
  const sourceLabel = clip.source === "native" ? "Native clip" : "Nightbot !clip";
  const color = clip.provider === "twitch" ? 0x9146ff : clip.provider === "kick" ? 0x53fc18 : 0xff0000;
  await axios.post(webhookUrl, {
    embeds: [
      {
        title: `🎬 ${clip.clipName}`,
        url,
        description: clip.provider === "youtube" && clip.source === "nightbot"
          ? `⏱️ Jump to **${formatOffset(offset)}** in the stream`
          : sourceLabel,
        color,
        author: {
          name: channel.name || channel.handle || channel.ytChannelId,
          url: channel.profileUrl,
        },
        thumbnail: { url: channel.imageUrl || undefined },
        image: clip.thumbnailUrl ? { url: clip.thumbnailUrl } : undefined,
        fields: [
          { name: "Clipped by", value: clip.clippedBy, inline: true },
          { name: "Source", value: sourceLabel, inline: true },
        ],
        timestamp: new Date().toISOString(),
      },
    ],
  });
}

function uniqueWebhookUrls(...urls: Array<string | null | undefined>) {
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const raw of urls) {
    const url = String(raw || "").trim();
    if (!url || seen.has(url)) continue;
    seen.add(url);
    unique.push(url);
  }
  return unique;
}

export async function notifyClipPosted(
  channel: Channel,
  clip: Clip,
  userWebhookUrl?: string | null
) {
  const urls = uniqueWebhookUrls(ENV.DISCORD_SERVER_DEFAULT_WEBHOOK, userWebhookUrl);
  let sent = false;
  for (const url of urls) {
    try {
      await postClipToDiscord(channel, clip, url);
      sent = true;
    } catch (err) {
      console.error("Failed to send Discord webhook", err);
    }
  }
  return sent;
}
