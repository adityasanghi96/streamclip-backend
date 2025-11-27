import axios from "axios";
import { ENV } from "../env";

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
  const url = `https://www.googleapis.com/youtube/v3/videos?part=liveStreamingDetails&id=${liveVideoId}&key=${ENV.YT_API_KEY}`;

  const res = await axios.get(url);
  const details = res.data.items?.[0]?.liveStreamingDetails;
  if (!details?.actualStartTime) return null;

  const start = new Date(details.actualStartTime).getTime();
  const now = Date.now();
  const offsetSec = Math.floor((now - start) / 1000);

  console.log({offsetSec: offsetSec})

  return { liveVideoId, offsetSec };
}

// Helper to get Live Chat ID
export async function getLiveChatId(videoId: string) {
  const url = `https://www.googleapis.com/youtube/v3/videos?part=liveStreamingDetails&id=${videoId}&key=${ENV.YT_API_KEY}`;
  const res = await axios.get(url);
  return res.data.items?.[0]?.liveStreamingDetails?.activeLiveChatId || null;
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