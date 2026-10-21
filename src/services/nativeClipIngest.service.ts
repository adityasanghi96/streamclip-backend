import AppDataSource from "../db/data-source";
import { Channel } from "../db/entities/Channel";
import { Clip } from "../db/entities/Clip";
import { LinkedAccount } from "../db/entities/LinkedAccount";
import { notifyClipPosted } from "./clipNotify.service";
import { detectedGame, detectYoutubeGame, upsertGame } from "./game.service";
import { fetchKickChannelClips, fetchKickLivestream, kickLivestreamGame } from "./kick.service";
import { fetchRecentTwitchClips, fetchTwitchGames, twitchThumbnail } from "./twitch.service";
import { fetchYouTubeNativeClips } from "./youtubeNativeClips.service";

let ingestRunning = false;

async function saveNativeClip(input: {
  channel: Channel;
  provider: string;
  liveVideoId: string;
  clipName: string;
  clippedBy: string;
  thumbnailUrl?: string;
  offsetSeconds?: string;
  webhookUrl?: string | null;
  notify?: boolean;
  gameName?: string | null;
  gameImageUrl?: string | null;
}) {
  const clipRepo = AppDataSource.getRepository(Clip);
  const existing = await clipRepo.findOneBy({
    provider: input.provider,
    liveVideoId: input.liveVideoId,
  });
  if (existing) return;

  const detected = input.gameName
    ? detectedGame(input.gameName, input.gameImageUrl)
    : await detectYoutubeGame({ title: input.clipName });
  const savedGame = detected ? await upsertGame(detected) : null;

  const clip = clipRepo.create({
    provider: input.provider,
    channelId: input.channel.id,
    channel: input.channel,
    chatId: input.provider,
    clipName: input.clipName,
    liveVideoId: input.liveVideoId,
    offsetSeconds: input.offsetSeconds || "0",
    clippedBy: input.clippedBy,
    thumbnailUrl: input.thumbnailUrl,
    source: "native",
    gameId: savedGame?.id ?? null,
    game: savedGame,
  });
  await clipRepo.save(clip);
  if (input.notify !== false) {
    await notifyClipPosted(input.channel, clip, input.webhookUrl);
  }
}

async function ingestTwitch() {
  const linkedRepo = AppDataSource.getRepository(LinkedAccount);
  const chanRepo = AppDataSource.getRepository(Channel);
  const clipRepo = AppDataSource.getRepository(Clip);
  const accounts = await linkedRepo.find({ where: { provider: "twitch" } });
  for (const account of accounts) {
    const channel = await chanRepo.findOneBy({ ytChannelId: account.externalId, provider: "twitch" });
    if (!channel) continue;
    const already = await clipRepo.count({
      where: { channelId: channel.id, provider: "twitch", source: "native" },
    });
    const helixClips = await fetchRecentTwitchClips(account.externalId);
    const games = await fetchTwitchGames(helixClips.map((clip) => clip.game_id || ""));
    for (const helix of helixClips) {
      const game = helix.game_id ? games.get(helix.game_id) : undefined;
      await saveNativeClip({
        channel,
        provider: "twitch",
        liveVideoId: helix.id,
        clipName: helix.title || "Twitch clip",
        clippedBy: helix.creator_name || "Twitch",
        thumbnailUrl: twitchThumbnail(helix.thumbnail_url) || undefined,
        offsetSeconds: String(helix.vod_offset ?? helix.duration ?? 0),
        webhookUrl: channel.discordWebhookUrl || account.discordWebhookUrl,
        notify: already > 0,
        gameName: game?.name,
        gameImageUrl: game?.imageUrl,
      });
    }
  }
}

async function ingestKick() {
  const linkedRepo = AppDataSource.getRepository(LinkedAccount);
  const chanRepo = AppDataSource.getRepository(Channel);
  const accounts = await linkedRepo.find({ where: { provider: "kick" } });
  const clipRepo = AppDataSource.getRepository(Clip);
  for (const account of accounts) {
    const channel = await chanRepo.findOneBy({ ytChannelId: account.externalId, provider: "kick" });
    if (!channel) continue;
    const already = await clipRepo.count({ where: { channelId: channel.id, provider: "kick", source: "native" } });
    const clips = await fetchKickChannelClips(account.handle || channel.handle || "");
    const liveGame = kickLivestreamGame(await fetchKickLivestream(account.externalId));
    for (const item of clips) {
      await saveNativeClip({
        channel,
        provider: "kick",
        liveVideoId: item.id,
        clipName: item.title,
        clippedBy: item.creator || "Kick",
        thumbnailUrl: item.thumbnailUrl,
        webhookUrl: channel.discordWebhookUrl || account.discordWebhookUrl,
        notify: already > 0,
        gameName: liveGame?.name,
        gameImageUrl: liveGame?.imageUrl,
      });
    }
  }
}

async function ingestYouTube() {
  const chanRepo = AppDataSource.getRepository(Channel);
  const channels = await chanRepo.find({ where: { provider: "youtube" } });
  const clipRepo = AppDataSource.getRepository(Clip);
  const owned = channels.filter((channel) => channel.ownerId);
  for (const channel of owned) {
    const already = await clipRepo.count({
      where: { channelId: channel.id, provider: "youtube", source: "native" },
    });
    const clips = await fetchYouTubeNativeClips(channel.ytChannelId);
    for (const item of clips) {
      await saveNativeClip({
        channel,
        provider: "youtube",
        liveVideoId: item.id,
        clipName: item.title,
        clippedBy: "YouTube",
        thumbnailUrl: item.thumbnailUrl,
        webhookUrl: channel.discordWebhookUrl,
        notify: already > 0,
      });
    }
  }
}

export async function ingestNativeClips() {
  if (ingestRunning) return;
  ingestRunning = true;
  try {
    await ingestTwitch();
    await ingestKick();
    await ingestYouTube();
  } catch (err) {
    console.error("Native clip ingest failed", err);
  } finally {
    ingestRunning = false;
  }
}

export function startNativeClipIngest() {
  void ingestNativeClips();
  setInterval(() => void ingestNativeClips(), 30_000);
}
