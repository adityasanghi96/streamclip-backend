import axios from "axios";
import { ENV } from "../env";

export async function fetchYouTubeChannelInfo(ytChannelId: string) {
  const url = `https://www.googleapis.com/youtube/v3/channels?part=snippet&id=${ytChannelId}&key=${ENV.YT_API_KEY}`;

  const res = await axios.get(url);

  const channel = res.data.items?.[0];
  if (!channel) return null;

  return {
    name: channel.snippet.title,
    imageUrl: channel.snippet.thumbnails?.default?.url || ""
  };
}
