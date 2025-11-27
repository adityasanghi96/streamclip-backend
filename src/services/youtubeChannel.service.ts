// services/youtubeChannel.service.ts
import axios from "axios";
import { ENV } from "../env";

export async function fetchYouTubeChannelInfo(ytChannelId: string) {
  const url = `https://www.googleapis.com/youtube/v3/channels?part=snippet&id=${ytChannelId}&key=${ENV.YT_API_KEY}`;

  const res = await axios.get(url);
  const channel = res.data.items?.[0];
  if (!channel) return null;

  const snippet = channel.snippet || {};

  // Try to derive the handle
  // - snippet.customUrl: often something like "adityasanghiyt"
  // - channel.handle: newer field, sometimes already "@adityasanghiyt"
  const rawCustomUrl = snippet.customUrl as string | undefined;
  const rawHandle = (channel.handle as string | undefined) || rawCustomUrl;

  const handle = rawHandle
    ? rawHandle.startsWith("@")
      ? rawHandle
      : `@${rawHandle.replace(/^@/, "")}`
    : undefined;

  const profileUrl = handle ? `https://youtube.com/${handle}` : undefined;

  return {
    name: snippet.title,
    imageUrl: snippet.thumbnails?.default?.url || "",
    handle,
    url: profileUrl,
  };
}
