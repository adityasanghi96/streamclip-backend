import { Router } from "express";
import { fetchLiveChatModerators, getActiveLiveVideoId, getLiveChatId, getLiveStreamOffset } from "../services/youtube.service";
import { fetchYouTubeChannelFromHandle, fetchYouTubeChannelInfo } from "../services/youtubeChannel.service";
import { isOlderThan } from "../utils/time";
import AppDataSource from "../db/data-source";
import { Clip } from "../db/entities/Clip";
import { Channel } from "../db/entities/Channel";

const router = Router();

router.get("/health", async (req, res) => {
  try {
    res.status(200).json({ status: 'ok' });
  } catch (err) {
    console.error(err);
    res.status(500).send("Internal error");
  }
});

router.get("/clip/:provider/:channelId/:chatId/:clipName", async (req, res) => {
  try {
    const { provider, channelId, chatId, clipName } = req.params;
    const delaySeconds = Number(req.query.delay || 0);
    const clippedBy = (req.query.user as string) || chatId;

    console.log(`Clip request: ${provider} ${channelId} ${chatId} ${clipName} ${delaySeconds} ${clippedBy}`);

    if (provider !== "youtube") {
      return res.status(400).send("Only YouTube supported currently");
    }

    const liveVideoId = await getActiveLiveVideoId(channelId);
    if (!liveVideoId) return res.status(404).send("Channel not live");

    // Now pass *videoId*
    const liveInfo = await getLiveStreamOffset(liveVideoId);
    if (!liveInfo) return res.status(404).send("Could not fetch live stream offset");

    const offsetSeconds = liveInfo.offsetSec;

    const finalOffset = Math.max(0, offsetSeconds + delaySeconds);

    console.log({liveInfo, offsetSeconds, finalOffset});

    const chanRepo = AppDataSource.getRepository(Channel);

    let channel = await chanRepo.findOneBy({ ytChannelId: channelId });

    const shouldRefresh = channel && isOlderThan(channel.updatedAt, 24);

    if (!channel || shouldRefresh) {
      const info = await fetchYouTubeChannelInfo(channelId);
      if (!info) return res.status(404).send("Channel info not found via YouTube API");

      if (!channel) {
        // Create new
        channel = chanRepo.create({
          ytChannelId: channelId,
          name: info.name,
          imageUrl: info.imageUrl,
          handle: info.handle,
          profileUrl: info.url
        });
      } else {
        // Refresh existing
        channel.name = info.name;
        channel.imageUrl = info.imageUrl;
        channel.handle = info.handle;
        channel.profileUrl = info.url;
      }

      await chanRepo.save(channel);
    }

    const clipRepo = AppDataSource.getRepository(Clip);

    const clip = clipRepo.create({
      provider,
      channelId: channel.id,
      channel,
      chatId,
      clipName,
      liveVideoId,
      offsetSeconds: finalOffset.toString(),
      clippedBy
    });

    await clipRepo.save(clip);

    return res.status(200).send("New clip created. Clipped by: "+clippedBy);

  } catch (err) {
    console.error(err);
    res.status(500).send("Internal error");
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
