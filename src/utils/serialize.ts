import { Channel } from "../db/entities/Channel";
import { Clip } from "../db/entities/Clip";
import { LinkedAccount } from "../db/entities/LinkedAccount";
import { User } from "../db/entities/User";
import { clipPageUrl } from "../services/clipNotify.service";

export function toPublicUser(user: User) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    picture: user.picture ?? null,
    googleYoutubeChannels: user.googleYoutubeChannels ?? [],
  };
}

export function toPublicCreator(user: User, extra: Record<string, unknown> = {}) {
  return {
    id: user.id,
    name: user.name,
    picture: user.picture ?? null,
    ...extra,
  };
}

export function toPublicChannel(channel: Channel, extra: Record<string, unknown> = {}) {
  return {
    id: channel.id,
    ytChannelId: channel.ytChannelId,
    provider: channel.provider || "youtube",
    name: channel.name,
    imageUrl: channel.imageUrl,
    handle: channel.handle ?? null,
    profileUrl: channel.profileUrl ?? null,
    createdAt: channel.createdAt,
    followerCount: channel.followerCount ?? null,
    ...extra,
  };
}

export function toOwnerChannel(channel: Channel, extra: Record<string, unknown> = {}) {
  return {
    ...toPublicChannel(channel, extra),
    discordWebhookUrl: channel.discordWebhookUrl ?? null,
  };
}

export function toLinkedAccount(account: LinkedAccount) {
  return {
    id: account.id,
    provider: account.provider,
    externalId: account.externalId,
    name: account.name,
    handle: account.handle ?? null,
    imageUrl: account.imageUrl ?? null,
    profileUrl: account.profileUrl ?? null,
    discordWebhookUrl: account.discordWebhookUrl ?? null,
    createdAt: account.createdAt,
  };
}

export function toPublicClip(clip: Clip) {
  const url = clipPageUrl(clip, clip.channel);
  return {
    id: clip.id,
    provider: clip.provider,
    source: clip.source || "nightbot",
    chatId: clip.chatId,
    clipName: clip.clipName,
    liveVideoId: clip.liveVideoId,
    offsetSeconds: clip.offsetSeconds,
    clippedBy: clip.clippedBy,
    thumbnailUrl: clip.thumbnailUrl ?? null,
    createdAt: clip.createdAt,
    youtubeUrl: url,
    url,
    gameId: clip.gameId ?? clip.game?.id ?? null,
    gameSlug: clip.game?.slug ?? null,
    gameName: clip.game?.name ?? null,
    channel: clip.channel ? toPublicChannel(clip.channel) : null,
  };
}
