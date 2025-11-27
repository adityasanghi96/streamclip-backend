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
    handle: handle?.toLocaleLowerCase(),
    url: profileUrl,
  };
}

export async function fetchYouTubeChannelFromHandle(handle: string) {
  const cleanHandle = handle.startsWith("@")
    ? handle.slice(1)
    : handle;

  // Step 1: Resolve handle → channelId
  const idUrl = `https://www.googleapis.com/youtube/v3/channels?part=id&forHandle=${cleanHandle}&key=${ENV.YT_API_KEY}`;

  const idRes = await axios.get(idUrl);
  const channelId = idRes.data.items?.[0]?.id;
  if (!channelId) return {};

  // Step 2: Fetch full metadata
  const infoUrl = `https://www.googleapis.com/youtube/v3/channels?part=snippet&id=${channelId}&key=${ENV.YT_API_KEY}`;
  const infoRes = await axios.get(infoUrl);

  const channel = infoRes.data.items?.[0];
  if (!channel) return {};

  const snippet = channel.snippet || {};

  // Normalize handle
  const rawCustomUrl = snippet.customUrl as string | undefined;
  const rawHandle = (channel.handle as string | undefined) || rawCustomUrl;

  const normalizedHandle = rawHandle
    ? rawHandle.startsWith("@")
      ? rawHandle
      : `@${rawHandle.replace(/^@/, "")}`
    : undefined;

  const profileUrl = normalizedHandle
    ? `https://youtube.com/${normalizedHandle}`
    : undefined;

  return {
    id: channelId,
    name: snippet.title,
    imageUrl: snippet.thumbnails?.default?.url || "",
    handle: normalizedHandle,
    url: profileUrl,
  };
}