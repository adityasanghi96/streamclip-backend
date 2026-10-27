import WebSocket from "ws";
import axios from "axios";
import { ENV } from "../env";
import { fetchTwitchProfileImages } from "./twitch.service";
import type { LiveChatMessage, LiveChatMessageKind, StreamOrientation } from "./liveChat.types";

type TwitchListener = (message: LiveChatMessage) => void;
type TwitchStatusListener = (code: string, message: string) => void;

type TwitchIngestor = {
  userId: string;
  streamId: string;
  orientation: StreamOrientation;
  accessToken: string;
  listeners: Set<TwitchListener>;
  statusListeners: Set<TwitchStatusListener>;
  stop: () => void;
};

const ingestors = new Map<string, TwitchIngestor>();
const EVENTSUB_URL = "wss://eventsub.wss.twitch.tv/ws";

function emitStatus(ingestor: TwitchIngestor, code: string, message: string) {
  for (const listener of ingestor.statusListeners) listener(code, message);
}

async function subscribe(sessionId: string, userId: string, accessToken: string) {
  const headers = {
    "Client-ID": ENV.TWITCH_CLIENT_ID,
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
  };
  const types = [
    { type: "channel.chat.message", version: "1" },
    { type: "channel.chat.notification", version: "1" },
  ];
  for (const item of types) {
    await axios.post(
      "https://api.twitch.tv/helix/eventsub/subscriptions",
      {
        type: item.type,
        version: item.version,
        condition: { broadcaster_user_id: userId, user_id: userId },
        transport: { method: "websocket", session_id: sessionId },
      },
      { headers }
    );
  }
}

function twitchKindFromChat(event: Record<string, any>): { kind: LiveChatMessageKind; amount: string | null } {
  const bits = event.cheer?.bits;
  if (bits) return { kind: "cheer", amount: `${bits} bits` };
  const fragments = event.message?.fragments;
  if (Array.isArray(fragments) && fragments.some((part: { type?: string }) => part.type === "cheermote")) {
    return { kind: "cheer", amount: null };
  }
  return { kind: "text", amount: null };
}

function twitchKindFromNotice(noticeType: string): LiveChatMessageKind {
  if (noticeType.includes("sub") || noticeType.includes("raid") || noticeType === "announcement") {
    if (noticeType.includes("gift")) return "gift";
    return "membership";
  }
  if (noticeType.includes("bits")) return "cheer";
  return "text";
}

async function toChatMessage(
  event: Record<string, any>,
  streamId: string,
  orientation: StreamOrientation
): Promise<LiveChatMessage | null> {
  const chatterId = String(event.chatter_user_id || "");
  const images = chatterId ? await fetchTwitchProfileImages([chatterId]) : new Map();
  const { kind, amount } = twitchKindFromChat(event);
  const text = String(event.message?.text || "").trim();
  if (!text && !amount) return null;
  return {
    id: String(event.message_id || `${streamId}:${Date.now()}`),
    authorName: String(event.chatter_user_name || event.chatter_user_login || "Twitch user"),
    authorImageUrl: images.get(chatterId) || null,
    provider: "twitch",
    streamId,
    orientation,
    text,
    kind,
    amount,
    stickerUrl: null,
    createdAt: new Date().toISOString(),
  };
}

async function toNoticeMessage(
  event: Record<string, any>,
  streamId: string,
  orientation: StreamOrientation
): Promise<LiveChatMessage | null> {
  const chatterId = String(event.chatter_user_id || "");
  const images = chatterId ? await fetchTwitchProfileImages([chatterId]) : new Map();
  const noticeType = String(event.notice_type || "");
  const text = String(event.system_message || event.message?.text || "").trim();
  if (!text) return null;
  return {
    id: String(event.message_id || `${streamId}:notice:${Date.now()}`),
    authorName: String(event.chatter_user_name || event.chatter_user_login || "Twitch user"),
    authorImageUrl: images.get(chatterId) || null,
    provider: "twitch",
    streamId,
    orientation,
    text,
    kind: twitchKindFromNotice(noticeType),
    amount: null,
    stickerUrl: null,
    createdAt: new Date().toISOString(),
  };
}

function connect(ingestor: TwitchIngestor, url = EVENTSUB_URL, resubscribe = true) {
  let socket: WebSocket | null = new WebSocket(url);
  let keepaliveTimer: NodeJS.Timeout | null = null;
  let closed = false;

  const bumpKeepalive = () => {
    if (keepaliveTimer) clearTimeout(keepaliveTimer);
    keepaliveTimer = setTimeout(() => {
      if (closed) return;
      try {
        socket?.close();
      } catch {
        // ignore
      }
      if (!closed) connect(ingestor, EVENTSUB_URL, true);
    }, 20_000);
  };

  ingestor.stop = () => {
    closed = true;
    if (keepaliveTimer) clearTimeout(keepaliveTimer);
    try {
      socket?.close();
    } catch {
      // ignore
    }
    socket = null;
  };

  socket.on("open", () => bumpKeepalive());
  socket.on("message", async (raw) => {
    bumpKeepalive();
    let payload: any;
    try {
      payload = JSON.parse(raw.toString());
    } catch {
      return;
    }
    const type = payload.metadata?.message_type;
    if (type === "session_welcome") {
      const sessionId = payload.payload?.session?.id;
      if (!sessionId || !resubscribe) return;
      try {
        await subscribe(sessionId, ingestor.userId, ingestor.accessToken);
      } catch (err) {
        const status = (err as { response?: { status?: number } }).response?.status;
        if (status === 401 || status === 403) {
          emitStatus(ingestor, "twitch_reconnect", "Reconnect Twitch in the dashboard to enable live chat.");
          ingestors.delete(ingestor.userId);
          ingestor.stop();
          return;
        }
        console.error("Twitch EventSub subscribe failed", err);
        emitStatus(ingestor, "twitch_error", "Could not subscribe to Twitch chat.");
      }
      return;
    }
    if (type === "session_reconnect") {
      const reconnectUrl = payload.payload?.session?.reconnect_url;
      if (reconnectUrl) {
        closed = true;
        if (keepaliveTimer) clearTimeout(keepaliveTimer);
        try {
          socket?.close();
        } catch {
          // ignore
        }
        connect(ingestor, String(reconnectUrl), false);
      }
      return;
    }
    if (type !== "notification") return;
    const subType = payload.payload?.subscription?.type;
    const event = payload.payload?.event || {};
    try {
      const mapped =
        subType === "channel.chat.notification"
          ? await toNoticeMessage(event, ingestor.streamId, ingestor.orientation)
          : await toChatMessage(event, ingestor.streamId, ingestor.orientation);
      if (!mapped) return;
      for (const listener of ingestor.listeners) listener(mapped);
    } catch (err) {
      console.error("Twitch chat map failed", err);
    }
  });
  socket.on("close", () => {
    if (closed) return;
    setTimeout(() => {
      if (!ingestors.has(ingestor.userId)) return;
      connect(ingestor, EVENTSUB_URL, true);
    }, 3000);
  });
  socket.on("error", (err) => {
    console.error("Twitch EventSub socket error", err);
  });
}

export function addTwitchLiveChatListener(
  userId: string,
  streamId: string,
  accessToken: string,
  listener: TwitchListener,
  statusListener: TwitchStatusListener
) {
  const existing = ingestors.get(userId);
  if (existing && existing.streamId === streamId) {
    existing.listeners.add(listener);
    existing.statusListeners.add(statusListener);
    existing.accessToken = accessToken;
    return;
  }
  if (existing) {
    existing.listeners.delete(listener);
    existing.statusListeners.delete(statusListener);
    if (!existing.listeners.size) existing.stop();
  }
  const ingestor: TwitchIngestor = {
    userId,
    streamId,
    orientation: "horizontal",
    accessToken,
    listeners: new Set([listener]),
    statusListeners: new Set([statusListener]),
    stop: () => undefined,
  };
  ingestors.set(userId, ingestor);
  connect(ingestor);
}

export function removeTwitchLiveChatListener(
  userId: string,
  listener: TwitchListener,
  statusListener: TwitchStatusListener
) {
  const existing = ingestors.get(userId);
  if (!existing) return;
  existing.listeners.delete(listener);
  existing.statusListeners.delete(statusListener);
  if (!existing.listeners.size) {
    existing.stop();
    ingestors.delete(userId);
  }
}
