import axios from "axios";
import { ENV } from "../env";

// Returns { videoId, liveOffsetSeconds }
export async function getLiveStreamOffset(channelId: string) {
  const url = `https://www.googleapis.com/youtube/v3/videos?part=liveStreamingDetails&id=${channelId}&key=${ENV.YT_API_KEY}`;

  const res = await axios.get(url);
  console.log(`YT API response: ${JSON.stringify(res.data)}`);
  const details = res.data.items?.[0]?.liveStreamingDetails;
  if (!details?.actualStartTime) return null;

  const start = new Date(details.actualStartTime).getTime();
  const now = Date.now();
  const offsetSec = Math.floor((now - start) / 1000);

  return { liveVideoId: res.data.items[0].id.videoId, offsetSec };
}

