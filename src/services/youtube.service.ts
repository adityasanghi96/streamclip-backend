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