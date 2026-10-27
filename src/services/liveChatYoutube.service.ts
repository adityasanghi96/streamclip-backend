import {
  fetchLiveChatMessages,
  getLiveBroadcastInfo,
} from "./youtube.service";
import type { LiveChatMessage, LiveChatMessageKind, StreamOrientation } from "./liveChat.types";

type YoutubeListener = (message: LiveChatMessage) => void;

type YoutubeIngestor = {
  channelId: string;
  streamId: string;
  orientation: StreamOrientation;
  liveChatId: string;
  listeners: Set<YoutubeListener>;
  stop: () => void;
};

const ingestors = new Map<string, YoutubeIngestor>();

function youtubeKind(type: string): LiveChatMessageKind | null {
  switch (type) {
    case "textMessageEvent":
      return "text";
    case "superChatEvent":
      return "superChat";
    case "superStickerEvent":
      return "sticker";
    case "newSponsorEvent":
    case "memberMilestoneChatEvent":
    case "membershipGiftingEvent":
    case "giftMembershipReceivedEvent":
      return "membership";
    case "giftEvent":
      return "gift";
    default:
      return null;
  }
}

function youtubeAmount(snippet: Record<string, any>, kind: LiveChatMessageKind) {
  if (kind === "superChat") return snippet.superChatDetails?.amountDisplayString || null;
  if (kind === "sticker") return snippet.superStickerDetails?.amountDisplayString || null;
  if (kind === "gift" && snippet.giftDetails?.giftAmountDisplayString) {
    return String(snippet.giftDetails.giftAmountDisplayString);
  }
  return null;
}

function toMessage(
  item: Record<string, any>,
  streamId: string,
  orientation: StreamOrientation
): LiveChatMessage | "ended" | null {
  const snippet = item.snippet || {};
  const type = String(snippet.type || "");
  if (type === "chatEndedEvent") return "ended";
  const kind = youtubeKind(type);
  if (!kind) return null;
  if (snippet.hasDisplayContent === false && kind === "text") return null;

  const author = item.authorDetails || {};
  const text =
    snippet.displayMessage ||
    snippet.textMessageDetails?.messageText ||
    snippet.superChatDetails?.userComment ||
    snippet.superStickerDetails?.superStickerMetadata?.altText ||
    "";
  if (!String(text).trim() && !youtubeAmount(snippet, kind)) return null;

  return {
    id: String(item.id || `${streamId}:${snippet.publishedAt || Date.now()}`),
    authorName: String(author.displayName || "YouTube user"),
    authorImageUrl: author.profileImageUrl ? String(author.profileImageUrl) : null,
    provider: "youtube",
    streamId,
    orientation,
    text: String(text),
    kind,
    amount: youtubeAmount(snippet, kind),
    stickerUrl: null,
    createdAt: snippet.publishedAt ? String(snippet.publishedAt) : new Date().toISOString(),
  };
}

async function runPoller(ingestor: YoutubeIngestor) {
  let pageToken: string | null = null;
  let stopped = false;
  ingestor.stop = () => {
    stopped = true;
  };

  while (!stopped) {
    try {
      const page = await fetchLiveChatMessages(ingestor.liveChatId, pageToken);
      if (stopped) return;
      if (page.offlineAt) {
        ingestors.delete(ingestor.channelId);
        return;
      }
      pageToken = page.nextPageToken;
      for (const item of page.items) {
        const mapped = toMessage(item, ingestor.streamId, ingestor.orientation);
        if (mapped === "ended") {
          ingestors.delete(ingestor.channelId);
          ingestor.stop();
          return;
        }
        if (mapped) {
          for (const listener of ingestor.listeners) listener(mapped);
        }
      }
      const wait = Math.max(1500, page.pollingIntervalMillis || 5000);
      await new Promise((resolve) => setTimeout(resolve, wait));
    } catch (err) {
      const status = (err as { response?: { status?: number } }).response?.status;
      if (status === 403 || status === 404) {
        ingestors.delete(ingestor.channelId);
        return;
      }
      console.error("YouTube live chat poll failed", err);
      await new Promise((resolve) => setTimeout(resolve, 8000));
    }
  }
}

export async function addYoutubeLiveChatListener(
  channelId: string,
  streamId: string,
  listener: YoutubeListener
) {
  const existing = ingestors.get(channelId);
  if (existing && existing.streamId === streamId) {
    existing.listeners.add(listener);
    return existing.orientation;
  }
  if (existing) {
    existing.listeners.delete(listener);
    if (!existing.listeners.size) existing.stop();
  }

  const info = await getLiveBroadcastInfo(streamId);
  if (!info.liveChatId) return null;

  const ingestor: YoutubeIngestor = {
    channelId,
    streamId,
    orientation: info.orientation,
    liveChatId: info.liveChatId,
    listeners: new Set([listener]),
    stop: () => undefined,
  };
  ingestors.set(channelId, ingestor);
  void runPoller(ingestor);
  return info.orientation;
}

export function removeYoutubeLiveChatListener(channelId: string, listener: YoutubeListener) {
  const existing = ingestors.get(channelId);
  if (!existing) return;
  existing.listeners.delete(listener);
  if (!existing.listeners.size) {
    existing.stop();
    ingestors.delete(channelId);
  }
}
