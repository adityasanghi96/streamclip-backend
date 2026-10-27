import axios from "axios";
import { ENV } from "../env";
import { orientationFromSize, type StreamOrientation } from "./liveChat.types";

export async function getActiveLiveVideoId(channelId: string) {
  const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&channelId=${channelId}&eventType=live&type=video&key=${ENV.YT_API_KEY}`;

  const res = await axios.get(url);

  if (res.data.items?.length > 0) {
    console.log({liveVideoId: res.data.items[0]?.id?.videoId})
    return res.data.items[0]?.id?.videoId;
  }
  return null;
}

// Returns { videoId, liveOffsetSeconds }
export async function getLiveStreamOffset(liveVideoId: string) {
  const url = `https://www.googleapis.com/youtube/v3/videos?part=snippet,liveStreamingDetails,topicDetails&id=${liveVideoId}&key=${ENV.YT_API_KEY}`;

  const res = await axios.get(url);
  const item = res.data.items?.[0];
  if (!item) return {};

  const details = item.liveStreamingDetails;
  const snippet = item.snippet;

  if (!details?.actualStartTime) return {};
  
  const start = new Date(details.actualStartTime).getTime();
  const now = Date.now();
  let offsetSec = Math.floor((now - start) / 1000);

  // 🔹 If live stream is not DVR enabled → must always trim offset to 0
  const isDvrEnabled = details.enableDvr !== false;
  if (!isDvrEnabled) offsetSec = 0;

  // Best thumbnail
  const thumbnails = snippet?.thumbnails || {};
  const thumbnailUrl =
    thumbnails.maxres?.url ||
    thumbnails.standard?.url ||
    thumbnails.high?.url ||
    thumbnails.medium?.url ||
    thumbnails.default?.url ||
    null;

  const title = snippet?.title || "Live Stream";

  const youtubeUrl = `https://www.youtube.com/watch?v=${liveVideoId}&t=${offsetSec}s`;

  console.log({
    liveVideoId,
    offsetSec,
    title,
    thumbnailUrl,
    isDvrEnabled,
    youtubeUrl
  });

  return {
    liveVideoId,
    offsetSec,
    title,
    thumbnailUrl,
    isDvrEnabled,
    youtubeUrl,
    tags: Array.isArray(snippet?.tags) ? snippet.tags.map(String) : [],
    topicCategories: Array.isArray(item.topicDetails?.topicCategories)
      ? item.topicDetails.topicCategories.map(String)
      : [],
  };
}

export type YoutubeLiveBroadcastInfo = {
  liveChatId: string | null;
  orientation: StreamOrientation;
  thumbnailUrl: string | null;
};

export async function getLiveBroadcastInfo(videoId: string): Promise<YoutubeLiveBroadcastInfo> {
  const url = `https://www.googleapis.com/youtube/v3/videos?part=snippet,liveStreamingDetails&id=${videoId}&key=${ENV.YT_API_KEY}`;
  const res = await axios.get(url);
  const item = res.data.items?.[0];
  const thumbs = item?.snippet?.thumbnails || {};
  const best = thumbs.maxres || thumbs.standard || thumbs.high || thumbs.medium || thumbs.default;
  return {
    liveChatId: item?.liveStreamingDetails?.activeLiveChatId || null,
    orientation: orientationFromSize(best?.width, best?.height),
    thumbnailUrl: best?.url || null,
  };
}

export async function getLiveChatId(videoId: string) {
  const info = await getLiveBroadcastInfo(videoId);
  return info.liveChatId;
}

export type YoutubeLiveChatPage = {
  items: Record<string, any>[];
  nextPageToken: string | null;
  pollingIntervalMillis: number;
  offlineAt: string | null;
};

export async function fetchLiveChatMessages(
  liveChatId: string,
  pageToken?: string | null
): Promise<YoutubeLiveChatPage> {
  const url = new URL("https://www.googleapis.com/youtube/v3/liveChat/messages");
  url.searchParams.set("liveChatId", liveChatId);
  url.searchParams.set("part", "snippet,authorDetails");
  url.searchParams.set("profileImageSize", "88");
  url.searchParams.set("key", ENV.YT_API_KEY);
  if (pageToken) url.searchParams.set("pageToken", pageToken);

  const res = await axios.get(url.toString());
  return {
    items: Array.isArray(res.data.items) ? res.data.items : [],
    nextPageToken: res.data.nextPageToken || null,
    pollingIntervalMillis: Number(res.data.pollingIntervalMillis || 5000),
    offlineAt: res.data.offlineAt || null,
  };
}

// Helper to fetch Live Chat Moderators
export async function fetchLiveChatModerators(liveChatId: string): Promise<string[]> {
  const url = `https://www.googleapis.com/youtube/v3/liveChat/messages?liveChatId=${liveChatId}&part=snippet,authorDetails&key=${ENV.YT_API_KEY}`;
  const res = await axios.get(url);

  const mods = res.data.items
    ?.filter((msg: any) => msg.authorDetails.isChatModerator)
    ?.map((msg: any) => msg.authorDetails.channelId)
    ?.filter(Boolean);

  return mods || [];
}