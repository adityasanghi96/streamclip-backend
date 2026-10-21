// services/youtubeChannel.service.ts
import axios from "axios";
import { ENV } from "../env";

export async function fetchYouTubeChannelInfo(ytChannelId: string) {
  const url = `https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics&id=${ytChannelId}&key=${ENV.YT_API_KEY}`;

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

  const followerCount = Number(channel.statistics?.subscriberCount);
  return {
    name: snippet.title,
    imageUrl: snippet.thumbnails?.default?.url || "",
    handle: handle?.toLocaleLowerCase(),
    url: profileUrl,
    followerCount: Number.isFinite(followerCount) ? followerCount : undefined,
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

export async function fetchGoogleUser(accessToken: string) {
  const res = await axios.get("https://www.googleapis.com/oauth2/v3/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const data = res.data || {};
  if (!data.sub) return null;
  return {
    id: String(data.sub),
    email: String(data.email || ""),
    name: String(data.name || data.email || "Google user"),
    picture: data.picture ? String(data.picture) : undefined,
  };
}

type YoutubeApiChannel = { id: string; snippet?: Record<string, any>; handle?: string };

function mapYoutubeChannel(channel: YoutubeApiChannel) {
  const snippet = channel.snippet || {};
  const rawCustomUrl = snippet.customUrl as string | undefined;
  const rawHandle = channel.handle || rawCustomUrl;
  const handle = rawHandle
    ? rawHandle.startsWith("@")
      ? rawHandle
      : `@${rawHandle.replace(/^@/, "")}`
    : undefined;

  return {
    id: channel.id,
    name: snippet.title || "YouTube channel",
    imageUrl: snippet.thumbnails?.default?.url || snippet.thumbnails?.medium?.url || "",
    handle: handle?.toLowerCase(),
  };
}

async function listYoutubeChannels(
  accessToken: string,
  extraParams: Record<string, string | boolean>
) {
  const items: YoutubeApiChannel[] = [];
  let pageToken: string | undefined;
  do {
    const res = await axios.get("https://www.googleapis.com/youtube/v3/channels", {
      params: {
        part: "snippet",
        maxResults: 50,
        pageToken,
        ...extraParams,
      },
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    items.push(...(res.data.items || []));
    pageToken = res.data.nextPageToken;
  } while (pageToken);
  return items;
}

export async function fetchMyYouTubeChannels(accessToken: string) {
  const items = await listYoutubeChannels(accessToken, { mine: true });
  try {
    const managed = await listYoutubeChannels(accessToken, { managedByMe: true });
    items.push(...managed);
  } catch {
    // managedByMe is only available for some YouTube partner accounts
  }

  const unique = new Map<string, ReturnType<typeof mapYoutubeChannel>>();
  for (const channel of items) {
    if (channel?.id) unique.set(channel.id, mapYoutubeChannel(channel));
  }
  return [...unique.values()];
}