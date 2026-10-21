import axios from "axios";

export type YoutubeNativeClip = {
  id: string;
  title: string;
  thumbnailUrl?: string;
};

function collectClips(node: unknown, out: Map<string, YoutubeNativeClip>) {
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node)) {
    for (const child of node) collectClips(child, out);
    return;
  }
  const item = node as Record<string, any>;
  const videoId = item.videoId || item.video_id;
  const title =
    item.title?.runs?.[0]?.text ||
    item.title?.simpleText ||
    item.headline?.content ||
    (typeof item.title === "string" ? item.title : null);
  if (typeof videoId === "string" && videoId.length >= 6 && typeof title === "string") {
    const thumb =
      item.thumbnail?.thumbnails?.slice(-1)?.[0]?.url ||
      item.thumbnail?.sources?.slice(-1)?.[0]?.url;
    out.set(videoId, { id: videoId, title, thumbnailUrl: thumb });
  }
  for (const value of Object.values(item)) collectClips(value, out);
}

export async function fetchYouTubeNativeClips(channelId: string): Promise<YoutubeNativeClip[]> {
  try {
    const res = await axios.post(
      "https://www.youtube.com/youtubei/v1/browse?prettyPrint=false",
      {
        context: {
          client: {
            clientName: "WEB",
            clientVersion: "2.20251001.00.00",
          },
        },
        browseId: channelId,
        params: "EgZjbGlwcw%3D%3D",
      },
      {
        headers: { "Content-Type": "application/json" },
        timeout: 8000,
      }
    );
    const found = new Map<string, YoutubeNativeClip>();
    collectClips(res.data, found);
    return [...found.values()].slice(0, 20);
  } catch {
    return [];
  }
}
