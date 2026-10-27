import AppDataSource from "../db/data-source";
import { Channel } from "../db/entities/Channel";
import { LinkedAccount } from "../db/entities/LinkedAccount";
import {
  ensureKickChatSubscription,
  fetchKickLivestream,
  kickLivestreamId,
  removeKickChatSubscriptions,
} from "./kick.service";
import {
  addTwitchLiveChatListener,
  removeTwitchLiveChatListener,
} from "./liveChatTwitch.service";
import {
  streamKey,
  type LiveChatEvent,
  type LiveChatMessage,
  type LiveChatProvider,
  type LiveChatStream,
} from "./liveChat.types";
import { getActiveLiveVideoId, getLiveBroadcastInfo } from "./youtube.service";
import {
  fetchTwitchStream,
  refreshTwitchUserToken,
  twitchHasChatRead,
  twitchTokenScopes,
} from "./twitch.service";

type Send = (event: LiveChatEvent) => void;

type ChatSource = {
  provider: LiveChatProvider;
  accountId: string;
  accountName: string;
  handle: string | null;
  accessToken?: string | null;
  refreshToken?: string | null;
  tokenExpiresAt?: Date | null;
  linkedAccount?: LinkedAccount;
};

const YT_OFFLINE_RECHECK_MS = 150_000;
const LIVE_REFRESH_MS = 45_000;

const sessions = new Set<LiveChatSession>();
const kickListeners = new Map<string, Set<LiveChatSession>>();
const kickSeenIds = new Set<string>();

function rememberKickMessage(id: string) {
  if (kickSeenIds.has(id)) return false;
  kickSeenIds.add(id);
  if (kickSeenIds.size > 800) {
    const first = kickSeenIds.values().next().value;
    if (first) kickSeenIds.delete(first);
  }
  return true;
}

class LiveChatSession {
  private closed = false;
  private timer: NodeJS.Timeout | null = null;
  private streams = new Map<string, LiveChatStream>();
  private ytOfflineAt = new Map<string, number>();
  private youtubeOn = new Set<string>();
  private twitchOn = new Set<string>();
  private kickOn = new Set<string>();
  private messageListener = (message: LiveChatMessage) => this.emitMessage(message);
  private twitchStatusListener = (code: string, message: string) => {
    this.send({ type: "status", status: { code, message } });
  };

  constructor(readonly userId: number, private send: Send) {}

  async start() {
    await this.refresh();
    this.timer = setInterval(() => {
      void this.refresh();
    }, LIVE_REFRESH_MS);
  }

  close() {
    if (this.closed) return;
    this.closed = true;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    for (const userId of this.twitchOn) {
      removeTwitchLiveChatListener(userId, this.messageListener, this.twitchStatusListener);
    }
    for (const kickId of this.kickOn) this.detachKick(kickId);
    this.youtubeOn.clear();
    this.twitchOn.clear();
    this.kickOn.clear();
    this.streams.clear();
    sessions.delete(this);
  }

  handleKickMessage(message: LiveChatMessage) {
    this.emitMessage(message);
  }

  kickStream(kickUserId: string) {
    return [...this.streams.values()].find(
      (item) => item.provider === "kick" && item.accountId === kickUserId
    );
  }

  dropKick(kickUserId: string) {
    this.detachKick(kickUserId);
  }

  private emitMessage(message: LiveChatMessage) {
    const live = [...this.streams.values()].find(
      (stream) => stream.provider === message.provider && stream.streamId === message.streamId
    );
    if (!live) return;
    this.send({
      type: "message",
      message: { ...message, orientation: live.orientation, streamId: live.streamId },
    });
  }

  private emitStreams() {
    this.send({ type: "streams", streams: [...this.streams.values()] });
  }

  private async refresh() {
    if (this.closed) return;
    try {
      const sources = await loadChatSources(this.userId);
      if (!sources.length) {
        this.send({
          type: "status",
          status: { code: "no_accounts", message: "Link a YouTube, Twitch, or Kick account on the dashboard first." },
        });
      }
      const next = new Map<string, LiveChatStream>();
      const liveYoutube = new Set<string>();
      const liveTwitch = new Set<string>();
      const liveKick = new Set<string>();

      for (const source of sources) {
        if (source.provider === "youtube") {
          const stream = await this.refreshYoutube(source);
          if (stream) {
            next.set(stream.key, stream);
            this.streams.set(stream.key, stream);
            liveYoutube.add(source.accountId);
          }
        } else if (source.provider === "twitch") {
          const stream = await this.refreshTwitch(source);
          if (stream) {
            next.set(stream.key, stream);
            this.streams.set(stream.key, stream);
            liveTwitch.add(source.accountId);
          }
        } else {
          const stream = await this.refreshKick(source);
          if (stream) {
            next.set(stream.key, stream);
            this.streams.set(stream.key, stream);
            liveKick.add(source.accountId);
          }
        }
      }

      for (const channelId of this.youtubeOn) {
        if (!liveYoutube.has(channelId)) this.youtubeOn.delete(channelId);
      }
      for (const userId of this.twitchOn) {
        if (!liveTwitch.has(userId)) {
          removeTwitchLiveChatListener(userId, this.messageListener, this.twitchStatusListener);
          this.twitchOn.delete(userId);
        }
      }
      for (const kickId of this.kickOn) {
        if (!liveKick.has(kickId)) this.detachKick(kickId);
      }

      this.streams = next;
      this.emitStreams();
      if (!next.size && sources.length) {
        this.send({
          type: "status",
          status: { code: "offline", message: "None of your linked accounts are live right now." },
        });
      }
    } catch (err) {
      console.error("Live chat refresh failed", err);
      this.send({
        type: "status",
        status: { code: "error", message: "Could not refresh live chat sources." },
      });
    }
  }

  private async refreshYoutube(source: ChatSource): Promise<LiveChatStream | null> {
    const now = Date.now();
    const key = streamKey("youtube", source.accountId);
    const existing = this.streams.get(key);
    const lastOffline = this.ytOfflineAt.get(source.accountId) || 0;

    let videoId = existing?.streamId || null;
    let orientation = existing?.orientation || "horizontal";

    if (videoId) {
      const info = await getLiveBroadcastInfo(videoId).catch((err) => {
        console.error("YouTube live video check failed", err);
        return null;
      });
      if (info?.liveChatId) {
        orientation = info.orientation;
      } else {
        videoId = null;
      }
    }

    if (!videoId) {
      if (lastOffline && now - lastOffline < YT_OFFLINE_RECHECK_MS) return null;
      try {
        videoId = await getActiveLiveVideoId(source.accountId);
      } catch (err) {
        console.error("YouTube live check failed", err);
        return null;
      }
      if (videoId) {
        const info = await getLiveBroadcastInfo(videoId).catch(() => null);
        if (info) orientation = info.orientation;
      }
    }

    if (!videoId) {
      this.ytOfflineAt.set(source.accountId, now);
      return null;
    }
    this.ytOfflineAt.delete(source.accountId);
    this.youtubeOn.add(source.accountId);

    const stream: LiveChatStream = {
      key,
      provider: "youtube",
      accountId: source.accountId,
      accountName: source.accountName,
      handle: source.handle,
      streamId: videoId,
      orientation,
    };
    this.streams.set(key, stream);
    return stream;
  }

  private async refreshTwitch(source: ChatSource): Promise<LiveChatStream | null> {
    const stream = await fetchTwitchStream(source.accountId).catch(() => null);
    if (!stream) return null;

    const key = streamKey("twitch", source.accountId);
    this.streams.set(key, {
      key,
      provider: "twitch",
      accountId: source.accountId,
      accountName: source.accountName,
      handle: source.handle,
      streamId: stream.id,
      orientation: "horizontal",
    });

    const token = await ensureTwitchToken(source);
    if (!token) {
      this.send({
        type: "status",
        status: {
          code: "twitch_reconnect",
          message: `Reconnect ${source.accountName} on Twitch to enable live chat.`,
        },
      });
      return {
        key: streamKey("twitch", source.accountId),
        provider: "twitch",
        accountId: source.accountId,
        accountName: source.accountName,
        handle: source.handle,
        streamId: stream.id,
        orientation: "horizontal",
      };
    }

    try {
      const scopes = await twitchTokenScopes(token);
      if (!twitchHasChatRead(scopes)) {
        this.send({
          type: "status",
          status: {
            code: "twitch_reconnect",
            message: `Reconnect ${source.accountName} on Twitch to enable live chat.`,
          },
        });
      } else {
        addTwitchLiveChatListener(
          source.accountId,
          stream.id,
          token,
          this.messageListener,
          this.twitchStatusListener
        );
        this.twitchOn.add(source.accountId);
      }
    } catch {
      this.send({
        type: "status",
        status: {
          code: "twitch_reconnect",
          message: `Reconnect ${source.accountName} on Twitch to enable live chat.`,
        },
      });
    }

    return {
      key,
      provider: "twitch",
      accountId: source.accountId,
      accountName: source.accountName,
      handle: source.handle,
      streamId: stream.id,
      orientation: "horizontal",
    };
  }

  private async refreshKick(source: ChatSource): Promise<LiveChatStream | null> {
    const livestream = await fetchKickLivestream(source.accountId).catch(() => null);
    const streamId = kickLivestreamId(livestream);
    if (!streamId) return null;

    const key = streamKey("kick", source.accountId);
    this.streams.set(key, {
      key,
      provider: "kick",
      accountId: source.accountId,
      accountName: source.accountName,
      handle: source.handle,
      streamId,
      orientation: "horizontal",
    });

    try {
      await ensureKickChatSubscription(source.accountId);
    } catch (err) {
      console.error("Kick chat subscribe failed", err);
      this.send({
        type: "status",
        status: {
          code: "kick_webhook",
          message: "Kick chat needs a public webhook URL in your Kick developer app.",
        },
      });
    }
    this.attachKick(source.accountId);
    return {
      key,
      provider: "kick",
      accountId: source.accountId,
      accountName: source.accountName,
      handle: source.handle,
      streamId,
      orientation: "horizontal",
    };
  }

  private attachKick(kickUserId: string) {
    let set = kickListeners.get(kickUserId);
    if (!set) {
      set = new Set();
      kickListeners.set(kickUserId, set);
    }
    set.add(this);
    this.kickOn.add(kickUserId);
  }

  private detachKick(kickUserId: string) {
    const set = kickListeners.get(kickUserId);
    if (set) {
      set.delete(this);
      if (!set.size) {
        kickListeners.delete(kickUserId);
        void removeKickChatSubscriptions(kickUserId).catch((err) => {
          console.error("Kick chat unsubscribe failed", err);
        });
      }
    }
    this.kickOn.delete(kickUserId);
  }
}

async function loadChatSources(userId: number): Promise<ChatSource[]> {
  const linkedRepo = AppDataSource.getRepository(LinkedAccount);
  const chanRepo = AppDataSource.getRepository(Channel);
  const [accounts, channels] = await Promise.all([
    linkedRepo.find({ where: { userId } }),
    chanRepo.find({ where: { ownerId: userId, provider: "youtube" } }),
  ]);

  const sources = new Map<string, ChatSource>();
  for (const account of accounts) {
    sources.set(streamKey(account.provider, account.externalId), {
      provider: account.provider,
      accountId: account.externalId,
      accountName: account.name,
      handle: account.handle ?? null,
      accessToken: account.accessToken,
      refreshToken: account.refreshToken,
      tokenExpiresAt: account.tokenExpiresAt,
      linkedAccount: account,
    });
  }
  for (const channel of channels) {
    const key = streamKey("youtube", channel.ytChannelId);
    if (sources.has(key)) continue;
    sources.set(key, {
      provider: "youtube",
      accountId: channel.ytChannelId,
      accountName: channel.name,
      handle: channel.handle ?? null,
    });
  }
  return [...sources.values()];
}

async function ensureTwitchToken(source: ChatSource) {
  const account = source.linkedAccount;
  if (!account?.accessToken) return null;
  const stillValid = account.tokenExpiresAt && account.tokenExpiresAt.getTime() > Date.now() + 30_000;
  if (stillValid || !account.refreshToken) return account.accessToken;
  try {
    const refreshed = await refreshTwitchUserToken(account.refreshToken);
    account.accessToken = refreshed.accessToken;
    account.refreshToken = refreshed.refreshToken;
    account.tokenExpiresAt = refreshed.tokenExpiresAt;
    await AppDataSource.getRepository(LinkedAccount).save(account);
    return account.accessToken;
  } catch (err) {
    console.error("Twitch token refresh failed", err);
    return account.accessToken;
  }
}

export function openLiveChatSession(userId: number, send: Send) {
  const session = new LiveChatSession(userId, send);
  sessions.add(session);
  return session;
}

function kickEmotes(content: string) {
  return content.replace(/\[emote:\d+:([^\]]+)\]/g, ":$1:");
}

export function dispatchKickWebhook(eventType: string, payload: Record<string, any>) {
  const broadcasterId = String(payload?.broadcaster?.user_id || "");
  if (!broadcasterId) return;
  const listeners = kickListeners.get(broadcasterId);
  if (!listeners?.size) return;

  const messageId =
    eventType === "kicks.gifted"
      ? String(payload.created_at || Date.now())
      : String(payload.message_id || "");
  if (messageId && !rememberKickMessage(`${broadcasterId}:${messageId}`)) return;

  for (const session of listeners) {
    const stream = session.kickStream(broadcasterId);
    if (!stream) continue;

    if (eventType === "kicks.gifted") {
      const gift = payload.gift || {};
      const amount = gift.amount != null ? `${gift.amount} Kicks` : null;
      const text = [gift.name, gift.message].filter(Boolean).join(" · ");
      session.handleKickMessage({
        id: `kick-gift:${messageId || Date.now()}`,
        authorName: String(payload.sender?.username || "Kick user"),
        authorImageUrl: payload.sender?.profile_picture ? String(payload.sender.profile_picture) : null,
        provider: "kick",
        streamId: stream.streamId,
        orientation: stream.orientation,
        text: text || "Sent a Kick gift",
        kind: "gift",
        amount,
        stickerUrl: null,
        createdAt: payload.created_at ? String(payload.created_at) : new Date().toISOString(),
      });
      continue;
    }

    if (eventType !== "chat.message.sent") continue;
    const text = kickEmotes(String(payload.content || "")).trim();
    if (!text) continue;
    session.handleKickMessage({
      id: String(payload.message_id || `${stream.streamId}:${Date.now()}`),
      authorName: String(payload.sender?.username || "Kick user"),
      authorImageUrl: payload.sender?.profile_picture ? String(payload.sender.profile_picture) : null,
      provider: "kick",
      streamId: stream.streamId,
      orientation: stream.orientation,
      text,
      kind: "text",
      amount: null,
      stickerUrl: null,
      createdAt: payload.created_at ? String(payload.created_at) : new Date().toISOString(),
    });
  }
}

export async function unsubscribeKickOnUnlink(kickUserId: string) {
  const listeners = kickListeners.get(kickUserId);
  if (listeners) {
    for (const session of [...listeners]) session.dropKick(kickUserId);
  }
  await removeKickChatSubscriptions(kickUserId).catch((err) => {
    console.error("Kick unlink unsubscribe failed", err);
  });
}
