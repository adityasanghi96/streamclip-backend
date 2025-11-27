import axios from "axios";
import { ENV } from "../env";

export async function getActiveLiveVideoId(channelId: string) {
  const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&channelId=${channelId}&eventType=live&type=video&key=${ENV.YT_API_KEY}`;

  const res = await axios.get(url);

  if (res.data.items?.length > 0) {
    return res.data.items[0].id.videoId;
  }
  return null;
}
