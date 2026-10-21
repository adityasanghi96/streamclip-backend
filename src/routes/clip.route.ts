import { Router } from "express";
import rateLimit from "express-rate-limit";
import { getActiveLiveVideoId, getLiveStreamOffset } from "../services/youtube.service";
import { fetchYouTubeChannelFromHandle, fetchYouTubeChannelInfo } from "../services/youtubeChannel.service";
import { isOlderThan } from "../utils/time";
import AppDataSource from "../db/data-source";
import { Clip } from "../db/entities/Clip";
import { Channel } from "../db/entities/Channel";
import { LinkedAccount } from "../db/entities/LinkedAccount";
import { toPublicClip } from "../utils/serialize";
import { parseLimitOffset, parseSource } from "../utils/query";
import { fetchKickLivestream, kickLivestreamGame } from "../services/kick.service";
import { createTwitchClip, fetchTwitchStreamGame, refreshTwitchUserToken } from "../services/twitch.service";
import { notifyClipPosted } from "../services/clipNotify.service";
import { ENV } from "../env";
import { detectedGame, detectYoutubeGame, upsertGame } from "../services/game.service";

const router = Router();

const channelClipsLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 30,
  message: { error: "Too many requests, please try again after a minute." },
  standardHeaders: true,
  legacyHeaders: false,
});

router.get("/health", async (req, res) => {
  try {
    res.status(200).json({ status: 'ok' });
  } catch (err) {
    console.error(err);
    res.status(500).send("Internal error");
  }
});

router.get("/config", (_req, res) => {
  res.status(200).json({
    discordSupportServerUrl: ENV.DISCORD_SUPPORT_SERVER_URL || null,
  });
});

async function resolveChannel(provider: string, channelId: string) {
  const chanRepo = AppDataSource.getRepository(Channel);
  let channel = await chanRepo.findOneBy({ ytChannelId: channelId });
  if (provider === "youtube") {
    const shouldRefresh = channel && isOlderThan(channel.updatedAt, 24);
    if (!channel || shouldRefresh) {
      const info = await fetchYouTubeChannelInfo(channelId);
      if (!info) return null;
      if (!channel) {
        channel = chanRepo.create({
          ytChannelId: channelId,
          provider: "youtube",
          name: info.name,
          imageUrl: info.imageUrl,
          handle: info.handle,
          profileUrl: info.url,
          followerCount: info.followerCount,
        });
      } else {
        channel.name = info.name;
        channel.imageUrl = info.imageUrl;
        channel.handle = info.handle;
        channel.profileUrl = info.url;
        if (typeof info.followerCount === "number") channel.followerCount = info.followerCount;
      }
      await chanRepo.save(channel);
    }
  }
  return channel;
}

async function twitchUserAccessToken(channelId: string) {
  const linkedRepo = AppDataSource.getRepository(LinkedAccount);
  const account = await linkedRepo.findOneBy({ provider: "twitch", externalId: channelId });
  if (!account?.accessToken) return null;
  const stillValid = account.tokenExpiresAt && account.tokenExpiresAt.getTime() > Date.now() + 30_000;
  if (stillValid || !account.refreshToken) return account.accessToken;
  const refreshed = await refreshTwitchUserToken(account.refreshToken);
  account.accessToken = refreshed.accessToken;
  account.refreshToken = refreshed.refreshToken;
  account.tokenExpiresAt = refreshed.tokenExpiresAt;
  await linkedRepo.save(account);
  return account.accessToken;
}

router.get("/clip/:provider/:channelId/:chatId/:clipName", async (req, res) => {
  try {
    const { provider, channelId, chatId, clipName } = req.params;
    const delaySeconds = Number(req.query.delay || 0);
    const clippedBy = (req.query.user as string) || chatId;
    let updatedInDiscord = false;

    console.log(`Clip request: ${provider} ${channelId} ${chatId} ${clipName} ${delaySeconds} ${clippedBy}`);

    if (!["youtube", "twitch", "kick"].includes(provider)) {
      return res.status(400).send("Unsupported provider");
    }

    const channel = await resolveChannel(provider, channelId);
    if (!channel) return res.status(404).send("Channel not found. Link it in the dashboard first.");

    let liveVideoId = "";
    let offsetSeconds = "0";
    let thumbnailUrl: string | undefined;
    let title = clipName || "clip";
    let game = null as Awaited<ReturnType<typeof detectYoutubeGame>>;

    if (provider === "youtube") {
      const currentLive = await getActiveLiveVideoId(channelId);
      if (!currentLive) return res.status(404).send("Channel not live");
      const live = await getLiveStreamOffset(currentLive);
      if (live.offsetSec == null) return res.status(404).send("Could not fetch live stream offset");
      liveVideoId = currentLive;
      offsetSeconds = String(Math.max(0, Number(live.offsetSec || 0) + delaySeconds));
      thumbnailUrl = live.thumbnailUrl || undefined;
      title = clipName || live.title || "clip";
      game = await detectYoutubeGame({
        title: live.title,
        tags: live.tags,
        topicCategories: live.topicCategories,
      });
    } else if (provider === "twitch") {
      const token = await twitchUserAccessToken(channelId);
      if (!token) return res.status(400).send("Reconnect Twitch in the dashboard so chat can clip.");
      const created = await createTwitchClip(token, channelId);
      liveVideoId = created.id;
      title = clipName || "Twitch clip";
      const streamGame = await fetchTwitchStreamGame(channelId);
      game = streamGame ? detectedGame(streamGame.name, streamGame.imageUrl) : null;
    } else {
      const livestream = await fetchKickLivestream(channelId);
      if (!livestream) return res.status(404).send("Channel not live");
      liveVideoId = String(livestream.livestream_id || livestream.id || channel.handle || channelId);
      const started = livestream.started_at ? new Date(livestream.started_at).getTime() : 0;
      offsetSeconds = String(started ? Math.max(0, Math.floor((Date.now() - started) / 1000) + delaySeconds) : 0);
      thumbnailUrl = livestream.thumbnail || undefined;
      title = clipName || livestream.session_title || "Kick clip";
      const category = kickLivestreamGame(livestream);
      game = category ? detectedGame(category.name, category.imageUrl) : null;
    }

    const savedGame = game ? await upsertGame(game) : null;

    const clipRepo = AppDataSource.getRepository(Clip);
    const clip = clipRepo.create({
      provider,
      channelId: channel.id,
      channel,
      chatId,
      clipName: title,
      liveVideoId,
      offsetSeconds,
      clippedBy,
      thumbnailUrl,
      source: "nightbot",
      gameId: savedGame?.id ?? null,
      game: savedGame,
    });
    await clipRepo.save(clip);

    updatedInDiscord = await notifyClipPosted(channel, clip, channel.discordWebhookUrl);
    return res.status(200).send("New clip created. Clipped by: " + clippedBy + (updatedInDiscord ? " Updated in discord." : ""));
  } catch (err) {
    const status = (err as { status?: number }).status || 500;
    if (status >= 500) console.error(err);
    res.status(status).send((err as Error).message || "Internal error");
  }
});

router.post("/channel/clips", channelClipsLimiter, async (req, res) => {
  try {
    const body = req.body || {};
    const { channelId: ytChannelIdParam, handle: handleParam } = body;
    const { limit, offset } = parseLimitOffset(body);
    const source = parseSource(body.source);

    if (!ytChannelIdParam && !handleParam) {
      return res.status(400).json({ error: "channelId or handle required" });
    }

    const chanRepo = AppDataSource.getRepository(Channel);
    let channel: Channel | null = null;

    if (ytChannelIdParam) {
      channel = await chanRepo.findOneBy({ ytChannelId: String(ytChannelIdParam) });
    } else if (handleParam) {
      const normalizedHandle = String(handleParam).toLowerCase().startsWith("@")
        ? String(handleParam).toLowerCase()
        : "@" + String(handleParam).toLowerCase();
      channel = await chanRepo.findOne({ where: { handle: normalizedHandle } });
      if (!channel) {
        const { id } = await fetchYouTubeChannelFromHandle(normalizedHandle);
        if (id) channel = await chanRepo.findOneBy({ ytChannelId: id });
      }
    }

    if (!channel) {
      return res.status(404).json({ error: "Channel not found" });
    }

    const clipRepo = AppDataSource.getRepository(Clip);
    const where: { channelId: number; source?: "native" | "nightbot" } = { channelId: channel.id };
    if (source) where.source = source;
    const [clips, total] = await clipRepo.findAndCount({
      where,
      order: { createdAt: "DESC" },
      take: limit,
      skip: offset,
    });

    return res.status(200).json({
      clips: clips.map(toPublicClip),
      total,
      limit,
      offset,
      source: source || null,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

router.post("/discord/webhook", async (req, res) => {
  try {
    const { handle, webhookUrl } = req.body || {};

    if (!handle || !webhookUrl) {
      return res.status(400).json({ error: "handle and webhookUrl required" });
    }

    if(!webhookUrl.startsWith('https://discord.com/api/webhooks')){
      return res.status(400).json({ error: "webhook should start with https://discord.com/api/webhooks" });
    }

    const normalizedHandle = handle.toLowerCase().startsWith("@")
      ? handle.toLowerCase()
      : "@" + handle.toLowerCase();

    // Step 1: Resolve handle → channelId
    const {id,name,imageUrl,url} = await fetchYouTubeChannelFromHandle(normalizedHandle);

    if (!id) {
      return res.status(404).json({ error: "YouTube channel not found" });
    }

    const chanRepo = AppDataSource.getRepository(Channel);

    let channel = await chanRepo.findOne({
      where: { ytChannelId: id }
    });

    if (!channel) {
      // Create new channel record
      channel = chanRepo.create({
        ytChannelId: id,
        handle: normalizedHandle,
        name: name,
        imageUrl: imageUrl,
        profileUrl: url,
        discordWebhookUrl: webhookUrl
      });
    } else {
      // Update webhook on existing channel
      channel.discordWebhookUrl = webhookUrl;
    }

    await chanRepo.save(channel);

    return res.status(channel ? 200 : 201).json({
      message: "Webhook saved successfully",
      channel
    });

  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});


export default router;
