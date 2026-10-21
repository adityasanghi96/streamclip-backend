import { Router } from "express";
import { In } from "typeorm";
import AppDataSource from "../db/data-source";
import { Channel } from "../db/entities/Channel";
import { Clip } from "../db/entities/Clip";
import { LinkedAccount, LinkedProvider } from "../db/entities/LinkedAccount";
import { User } from "../db/entities/User";
import { requireAuth, getAuthUser } from "../middleware/auth";
import { exchangeKickOAuth, fetchKickChannel, startKickOAuth } from "../services/kick.service";
import { fetchTwitchUser, RemoteAccount } from "../services/streaming.service";
import { exchangeTwitchOAuth, startTwitchOAuth } from "../services/twitch.service";
import { exchangeYoutubeGisCode, exchangeYoutubeOAuth, startYoutubeOAuth } from "../services/googleYoutubeOauth.service";
import { fetchMyYouTubeChannels, fetchYouTubeChannelInfo } from "../services/youtubeChannel.service";
import { GoogleYoutubeChannel } from "../db/entities/User";
import { toLinkedAccount, toOwnerChannel, toPublicClip, toPublicUser } from "../utils/serialize";
import { parseLimitOffset, parseProvider, parseSource } from "../utils/query";

const router = Router();

const ALREADY_LINKED_MESSAGE =
  "This account is already linked. Contact admin to unlink the existing account and try again.";

function alreadyLinkedError(): never {
  const err = new Error(ALREADY_LINKED_MESSAGE) as Error & { status?: number };
  err.status = 409;
  throw err;
}

router.use(requireAuth);

router.get("/", async (req, res) => {
  try {
    const user = getAuthUser(req);
    const googleYoutubeChannels = await youtubeChannelsFromDb(user.id);
    await AppDataSource.getRepository(User).update({ id: user.id }, { googleYoutubeChannels });
    return res.status(200).json({
      user: {
        ...toPublicUser(user),
        googleYoutubeChannels,
      },
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

async function upsertLinkedAccount(
  userId: number,
  provider: LinkedProvider,
  remote: RemoteAccount,
  tokens?: { accessToken?: string | null; refreshToken?: string | null; tokenExpiresAt?: Date | null }
) {
  const repo = AppDataSource.getRepository(LinkedAccount);
  let account = await repo.findOneBy({ provider, externalId: remote.id });
  if (account && account.userId !== userId) {
    alreadyLinkedError();
  }
  if (!account) {
    account = repo.create({
      userId,
      provider,
      externalId: remote.id,
      name: remote.name,
      handle: remote.handle,
      imageUrl: remote.imageUrl,
      profileUrl: remote.profileUrl,
    });
  } else {
    account.name = remote.name;
    account.handle = remote.handle;
    account.imageUrl = remote.imageUrl;
    account.profileUrl = remote.profileUrl;
  }
  if (tokens?.accessToken) account.accessToken = tokens.accessToken;
  if (tokens?.refreshToken) account.refreshToken = tokens.refreshToken;
  if (tokens?.tokenExpiresAt) account.tokenExpiresAt = tokens.tokenExpiresAt;
  return repo.save(account);
}

async function upsertOwnedPlatformChannel(
  userId: number,
  provider: "twitch" | "kick",
  remote: RemoteAccount
) {
  const repo = AppDataSource.getRepository(Channel);
  let channel = await repo.findOneBy({ ytChannelId: remote.id });
  if (!channel) {
    channel = repo.create({
      ytChannelId: remote.id,
      provider,
      name: remote.name,
      imageUrl: remote.imageUrl || "",
      handle: remote.handle,
      profileUrl: remote.profileUrl,
      ownerId: userId,
    });
  } else if (channel.ownerId && channel.ownerId !== userId) {
    alreadyLinkedError();
  } else {
    channel.provider = provider;
    channel.name = remote.name;
    channel.imageUrl = remote.imageUrl || channel.imageUrl;
    channel.handle = remote.handle;
    channel.profileUrl = remote.profileUrl;
    channel.ownerId = userId;
  }
  return repo.save(channel);
}

router.get("/accounts", async (req, res) => {
  try {
    const user = getAuthUser(req);
    const { limit, offset } = parseLimitOffset(req.query);
    const provider = parseProvider(req.query.provider);
    const repo = AppDataSource.getRepository(LinkedAccount);
    const where = provider ? { userId: user.id, provider } : { userId: user.id };
    const [accounts, total] = await repo.findAndCount({
      where,
      order: { createdAt: "DESC" },
      take: limit,
      skip: offset,
    });
    return res.status(200).json({
      accounts: accounts.map(toLinkedAccount),
      total,
      limit,
      offset,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

function upsertYoutubeEntry(
  byId: Map<string, GoogleYoutubeChannel>,
  channel: { id: string; name: string; imageUrl?: string | null; handle?: string | null; hasAccess?: boolean },
  defaultAccess = false
) {
  const existing = byId.get(channel.id);
  byId.set(channel.id, {
    id: channel.id,
    name: channel.name || existing?.name || "YouTube channel",
    imageUrl: channel.imageUrl || existing?.imageUrl || "",
    handle: channel.handle || existing?.handle,
    hasAccess: channel.hasAccess ?? existing?.hasAccess ?? defaultAccess,
  });
}

async function youtubeChannelsFromDb(userId: number) {
  const userRepo = AppDataSource.getRepository(User);
  const chanRepo = AppDataSource.getRepository(Channel);
  const linkedRepo = AppDataSource.getRepository(LinkedAccount);
  const user = await userRepo.findOneByOrFail({ id: userId });
  const byId = new Map<string, GoogleYoutubeChannel>();

  for (const channel of user.googleYoutubeChannels || []) {
    upsertYoutubeEntry(byId, { ...channel, hasAccess: true }, true);
  }

  const owned = await chanRepo.find({ where: { ownerId: userId } });
  for (const channel of owned) {
    upsertYoutubeEntry(byId, {
      id: channel.ytChannelId,
      name: channel.name,
      imageUrl: channel.imageUrl,
      handle: channel.handle,
      hasAccess: true,
    });
  }

  const linked = await linkedRepo.find({ where: { userId, provider: "youtube" } });
  for (const account of linked) {
    upsertYoutubeEntry(byId, {
      id: account.externalId,
      name: account.name,
      imageUrl: account.imageUrl,
      handle: account.handle,
      hasAccess: true,
    });
  }

  return [...byId.values()];
}

async function mergeYoutubeChannels(userId: number, incoming: GoogleYoutubeChannel[]) {
  const userRepo = AppDataSource.getRepository(User);
  const user = await userRepo.findOneByOrFail({ id: userId });
  const byId = new Map((user.googleYoutubeChannels || []).map((channel) => [channel.id, channel]));
  for (const channel of byId.values()) {
    upsertYoutubeEntry(byId, { ...channel, hasAccess: true });
  }
  for (const channel of incoming) {
    upsertYoutubeEntry(byId, { ...channel, hasAccess: true });
  }
  await userRepo.update({ id: userId }, { googleYoutubeChannels: [...byId.values()] });
  const youtubeChannels = await youtubeChannelsFromDb(userId);
  await userRepo.update({ id: userId }, { googleYoutubeChannels: youtubeChannels });
  return youtubeChannels;
}

async function removeYoutubeChannelFromUser(userId: number, ytChannelId: string) {
  const userRepo = AppDataSource.getRepository(User);
  const user = await userRepo.findOneBy({ id: userId });
  if (!user) return;
  const next = (user.googleYoutubeChannels || []).filter((channel) => channel.id !== ytChannelId);
  await userRepo.update({ id: userId }, { googleYoutubeChannels: next });
}

router.get("/accounts/youtube/start", async (req, res) => {
  try {
    const user = getAuthUser(req);
    const url = startYoutubeOAuth(user.id);
    return res.status(200).json({ url });
  } catch (err) {
    const status = (err as { status?: number }).status || 500;
    if (status >= 500) console.error(err);
    return res.status(status).json({ error: (err as Error).message || "Could not start YouTube login" });
  }
});

router.post("/accounts/youtube/callback", async (req, res) => {
  try {
    const user = getAuthUser(req);
    const code = String(req.body?.code || "");
    const state = String(req.body?.state || "");
    if (!code || !state) return res.status(400).json({ error: "code and state required" });

    const result = await exchangeYoutubeOAuth(code, state);
    if (result.userId !== user.id) return res.status(403).json({ error: "YouTube login belongs to a different session" });

    const youtubeChannels = await mergeYoutubeChannels(user.id, result.youtubeChannels);
    return res.status(200).json({ youtubeChannels });
  } catch (err) {
    const status = (err as { status?: number }).status || 500;
    if (status >= 500) console.error(err);
    return res.status(status).json({ error: (err as Error).message || "Could not link YouTube" });
  }
});

router.post("/accounts/youtube", async (req, res) => {
  try {
    const user = getAuthUser(req);
    const accessToken = String(req.body?.accessToken || "");
    const code = String(req.body?.code || "");
    if (!accessToken && !code) return res.status(400).json({ error: "code or accessToken required" });

    const incoming = code ? await exchangeYoutubeGisCode(code) : await fetchMyYouTubeChannels(accessToken);
    const youtubeChannels = await mergeYoutubeChannels(user.id, incoming);
    return res.status(200).json({ youtubeChannels });
  } catch (err) {
    const status = (err as { status?: number }).status || 500;
    if (status >= 500) console.error(err);
    return res.status(status).json({ error: (err as Error).message || "Could not fetch YouTube channels" });
  }
});

router.get("/accounts/twitch/start", async (req, res) => {
  try {
    const user = getAuthUser(req);
    const url = startTwitchOAuth(user.id);
    return res.status(200).json({ url });
  } catch (err) {
    const status = (err as { status?: number }).status || 500;
    if (status >= 500) console.error(err);
    return res.status(status).json({ error: (err as Error).message || "Could not start Twitch login" });
  }
});

router.post("/accounts/twitch/callback", async (req, res) => {
  try {
    const user = getAuthUser(req);
    const code = String(req.body?.code || "");
    const state = String(req.body?.state || "");
    if (!code || !state) return res.status(400).json({ error: "code and state required" });

    const result = await exchangeTwitchOAuth(code, state);
    if (result.userId !== user.id) return res.status(403).json({ error: "Twitch login belongs to a different session" });

    const account = await upsertLinkedAccount(user.id, "twitch", result.account, {
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
      tokenExpiresAt: result.tokenExpiresAt,
    });
    await upsertOwnedPlatformChannel(user.id, "twitch", result.account);
    return res.status(200).json({ account: toLinkedAccount(account) });
  } catch (err) {
    const status = (err as { status?: number }).status || 500;
    if (status >= 500) console.error(err);
    return res.status(status).json({ error: (err as Error).message || "Could not link Twitch" });
  }
});

router.post("/accounts/twitch", async (req, res) => {
  try {
    const user = getAuthUser(req);
    const username = String(req.body?.username || "");
    const remote = await fetchTwitchUser(username);
    const account = await upsertLinkedAccount(user.id, "twitch", remote);
    await upsertOwnedPlatformChannel(user.id, "twitch", remote);
    return res.status(200).json({ account: toLinkedAccount(account) });
  } catch (err) {
    const status = (err as { status?: number }).status || ((err as Error).message.includes("required") ? 400 : 500);
    if (status >= 500) console.error(err);
    return res.status(status).json({ error: (err as Error).message || "Could not link Twitch" });
  }
});

router.put("/accounts/:id/webhook", async (req, res) => {
  try {
    const user = getAuthUser(req);
    const id = Number(req.params.id);
    const webhookUrl = req.body?.webhookUrl === null || req.body?.webhookUrl === ""
      ? null
      : String(req.body?.webhookUrl || "").trim();

    const repo = AppDataSource.getRepository(LinkedAccount);
    const account = await repo.findOneBy({ id, userId: user.id });
    if (!account) return res.status(404).json({ error: "Linked account not found" });
    if (account.provider === "youtube") {
      return res.status(400).json({ error: "Save the YouTube webhook on the channel instead" });
    }

    if (webhookUrl && !webhookUrl.startsWith("https://discord.com/api/webhooks")) {
      return res.status(400).json({ error: "webhook should start with https://discord.com/api/webhooks" });
    }

    account.discordWebhookUrl = webhookUrl;
    await repo.save(account);

    if (account.provider === "twitch" || account.provider === "kick") {
      const chanRepo = AppDataSource.getRepository(Channel);
      const channel = await chanRepo.findOneBy({ ytChannelId: account.externalId, ownerId: user.id });
      if (channel) {
        channel.discordWebhookUrl = webhookUrl;
        await chanRepo.save(channel);
      }
    }
    return res.status(200).json({
      message: webhookUrl ? "Webhook saved" : "Webhook removed",
      account: toLinkedAccount(account),
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

router.get("/accounts/kick/start", async (req, res) => {
  try {
    const user = getAuthUser(req);
    const url = startKickOAuth(user.id);
    return res.status(200).json({ url });
  } catch (err) {
    const status = (err as { status?: number }).status || 500;
    if (status >= 500) console.error(err);
    return res.status(status).json({ error: (err as Error).message || "Could not start Kick login" });
  }
});

router.post("/accounts/kick/callback", async (req, res) => {
  try {
    const user = getAuthUser(req);
    const code = String(req.body?.code || "");
    const state = String(req.body?.state || "");
    if (!code || !state) return res.status(400).json({ error: "code and state required" });

    const result = await exchangeKickOAuth(code, state);
    if (result.userId !== user.id) return res.status(403).json({ error: "Kick login belongs to a different session" });

    const account = await upsertLinkedAccount(user.id, "kick", result.account, {
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
      tokenExpiresAt: result.tokenExpiresAt,
    });
    await upsertOwnedPlatformChannel(user.id, "kick", result.account);
    return res.status(200).json({ account: toLinkedAccount(account) });
  } catch (err) {
    const status = (err as { status?: number }).status || 500;
    if (status >= 500) console.error(err);
    return res.status(status).json({ error: (err as Error).message || "Could not link Kick" });
  }
});

router.post("/accounts/kick", async (req, res) => {
  try {
    const user = getAuthUser(req);
    const username = String(req.body?.username || "");
    const remote = await fetchKickChannel(username);
    const account = await upsertLinkedAccount(user.id, "kick", remote);
    await upsertOwnedPlatformChannel(user.id, "kick", remote);
    return res.status(200).json({ account: toLinkedAccount(account) });
  } catch (err) {
    const status = (err as { status?: number }).status || ((err as Error).message.includes("required") ? 400 : 500);
    if (status >= 500) console.error(err);
    return res.status(status).json({ error: (err as Error).message || "Could not link Kick" });
  }
});

router.delete("/accounts/:id", async (req, res) => {
  try {
    const user = getAuthUser(req);
    const id = Number(req.params.id);
    const repo = AppDataSource.getRepository(LinkedAccount);
    const account = await repo.findOneBy({ id, userId: user.id });
    if (!account) return res.status(404).json({ error: "Linked account not found" });

    if (account.provider === "youtube" || account.provider === "twitch" || account.provider === "kick") {
      const chanRepo = AppDataSource.getRepository(Channel);
      const channel = await chanRepo.findOneBy({ ytChannelId: account.externalId, ownerId: user.id });
      if (channel) {
        channel.ownerId = null;
        await chanRepo.save(channel);
      }
    }

    if (account.provider === "youtube") {
      await removeYoutubeChannelFromUser(user.id, account.externalId);
    }

    await repo.remove(account);
    return res.status(200).json({ message: "Account unlinked" });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

router.get("/channels", async (req, res) => {
  try {
    const user = getAuthUser(req);
    const { limit, offset } = parseLimitOffset(req.query);
    const chanRepo = AppDataSource.getRepository(Channel);
    const [channels, total] = await chanRepo.findAndCount({
      where: { ownerId: user.id },
      order: { createdAt: "DESC" },
      take: limit,
      skip: offset,
    });

    return res.status(200).json({
      channels: channels.map((channel) => toOwnerChannel(channel)),
      total,
      limit,
      offset,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

router.post("/channels", async (req, res) => {
  try {
    const user = getAuthUser(req);
    const ytChannelId = String(req.body?.ytChannelId || "").trim();
    if (!ytChannelId) {
      return res.status(400).json({ error: "ytChannelId required" });
    }

    const allowedIds = (await youtubeChannelsFromDb(user.id))
      .filter((channel) => channel.hasAccess !== false)
      .map((channel) => channel.id);
    if (!allowedIds.includes(ytChannelId)) {
      return res.status(403).json({
        error: "Access missing for this YouTube channel. Relink it with Google.",
      });
    }

    const info = await fetchYouTubeChannelInfo(ytChannelId);
    if (!info) {
      return res.status(404).json({ error: "YouTube channel not found" });
    }

    const chanRepo = AppDataSource.getRepository(Channel);
    let channel = await chanRepo.findOneBy({ ytChannelId });

    if (!channel) {
      channel = chanRepo.create({
        ytChannelId,
        name: info.name,
        imageUrl: info.imageUrl,
        handle: info.handle,
        profileUrl: info.url,
        ownerId: user.id,
      });
    } else if (channel.ownerId && channel.ownerId !== user.id) {
      return res.status(409).json({ error: ALREADY_LINKED_MESSAGE });
    } else {
      channel.name = info.name;
      channel.imageUrl = info.imageUrl;
      channel.handle = info.handle;
      channel.profileUrl = info.url;
      channel.ownerId = user.id;
    }

    await chanRepo.save(channel);
    await upsertLinkedAccount(user.id, "youtube", {
      id: ytChannelId,
      name: channel.name,
      handle: channel.handle || ytChannelId,
      imageUrl: channel.imageUrl,
      profileUrl: channel.profileUrl || `https://www.youtube.com/channel/${ytChannelId}`,
    });

    return res.status(200).json({
      message: "Channel linked",
      channel: toOwnerChannel(channel),
    });
  } catch (err) {
    const status = (err as { status?: number }).status;
    if (status) return res.status(status).json({ error: (err as Error).message });
    console.error(err);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

router.delete("/channels/:ytChannelId", async (req, res) => {
  try {
    const user = getAuthUser(req);
    const ytChannelId = String(req.params.ytChannelId || "").trim();
    if (!ytChannelId) return res.status(400).json({ error: "ytChannelId required" });

    const linkedRepo = AppDataSource.getRepository(LinkedAccount);
    const account = await linkedRepo.findOneBy({
      userId: user.id,
      provider: "youtube",
      externalId: ytChannelId,
    });
    if (account) await linkedRepo.remove(account);

    const chanRepo = AppDataSource.getRepository(Channel);
    const channel = await chanRepo.findOneBy({ ytChannelId, ownerId: user.id });
    if (channel) {
      channel.ownerId = null;
      await chanRepo.save(channel);
    }

    await removeYoutubeChannelFromUser(user.id, ytChannelId);
    return res.status(200).json({ message: "YouTube channel unlinked" });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

router.put("/channels/:ytChannelId/webhook", async (req, res) => {
  try {
    const user = getAuthUser(req);
    const { ytChannelId } = req.params;
    const webhookUrl = req.body?.webhookUrl === null || req.body?.webhookUrl === ""
      ? null
      : String(req.body?.webhookUrl || "").trim();

    const chanRepo = AppDataSource.getRepository(Channel);
    const channel = await chanRepo.findOneBy({ ytChannelId, ownerId: user.id });
    if (!channel) {
      return res.status(404).json({ error: "Linked channel not found" });
    }

    if (webhookUrl && !webhookUrl.startsWith("https://discord.com/api/webhooks")) {
      return res.status(400).json({ error: "webhook should start with https://discord.com/api/webhooks" });
    }

    channel.discordWebhookUrl = webhookUrl;
    await chanRepo.save(channel);

    return res.status(200).json({
      message: webhookUrl ? "Webhook saved" : "Webhook removed",
      channel: toOwnerChannel(channel),
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

router.get("/clips", async (req, res) => {
  try {
    const user = getAuthUser(req);
    const { limit, offset } = parseLimitOffset(req.query, 12);
    const provider = parseProvider(req.query.provider);
    const source = parseSource(req.query.source);

    const chanRepo = AppDataSource.getRepository(Channel);
    const clipRepo = AppDataSource.getRepository(Clip);

    const owned = await chanRepo.find({
      where: { ownerId: user.id },
      select: ["id"],
    });
    const channelIds = owned.map((c) => c.id);

    if (channelIds.length === 0) {
      return res.status(200).json({
        clips: [],
        total: 0,
        limit,
        offset,
        provider: provider || null,
        source: source || null,
      });
    }

    const where: { channelId: ReturnType<typeof In>; source?: "native" | "nightbot"; provider?: string } = {
      channelId: In(channelIds),
    };
    if (source) where.source = source;
    if (provider) where.provider = provider;

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
      provider: provider || null,
      source: source || null,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

export default router;
