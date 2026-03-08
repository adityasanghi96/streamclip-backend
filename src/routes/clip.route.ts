import { Router } from "express";
import rateLimit from "express-rate-limit";
import { getActiveLiveVideoId, getLiveStreamOffset } from "../services/youtube.service";
import { fetchYouTubeChannelFromHandle, fetchYouTubeChannelInfo } from "../services/youtubeChannel.service";
import { isOlderThan } from "../utils/time";
import AppDataSource from "../db/data-source";
import { Clip } from "../db/entities/Clip";
import { Channel } from "../db/entities/Channel";
import axios from "axios";

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

router.get("/clip/:provider/:channelId/:chatId/:clipName", async (req, res) => {
  try {
    const { provider, channelId, chatId, clipName } = req.params;
    const delaySeconds = Number(req.query.delay || 0);
    const clippedBy = (req.query.user as string) || chatId;
    let updatedInDiscord = false;

    console.log(`Clip request: ${provider} ${channelId} ${chatId} ${clipName} ${delaySeconds} ${clippedBy}`);

    if (provider !== "youtube") {
      return res.status(400).send("Only YouTube supported currently");
    }

    const liveVideoId = await getActiveLiveVideoId(channelId);
    if (!liveVideoId) return res.status(404).send("Channel not live");

    // Now pass *videoId*
    const {offsetSec: offsetSeconds, title, thumbnailUrl, isDvrEnabled, youtubeUrl} = await getLiveStreamOffset(liveVideoId);
    if (!offsetSeconds) return res.status(404).send("Could not fetch live stream offset");

    const finalOffset = Math.max(0, offsetSeconds + delaySeconds);

    console.log({ offsetSeconds, finalOffset});

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
      clippedBy,
      thumbnailUrl
    });

    await clipRepo.save(clip);

    if (channel.discordWebhookUrl) {
      const ytClipUrl = `https://www.youtube.com/watch?v=${liveVideoId}&t=${finalOffset}s`;
      const offsetFormatted = formatOffset(finalOffset);
      const embedPayload = {
        embeds: [
          {
            title: `🎬 ${clip.clipName || clipName || title}`,
            url: ytClipUrl,
            description: `⏱️ Jump to **${offsetFormatted}** in the stream`,
            color: 0xff0000,
            author: {
              name: channel.name || channel.handle || channel.ytChannelId,
              url: channel.profileUrl
            },
            thumbnail: {
              url: channel.imageUrl || undefined
            },
            image: thumbnailUrl ? { url: thumbnailUrl } : undefined,
            fields: [
              {
                name: "Clipped by",
                value: clippedBy,
                inline: true
              },
              {
                name: "Video ID",
                value: liveVideoId,
                inline: true
              }
            ],
            footer: {
              text: `Clip offset: ${offsetFormatted}`
            },
            timestamp: new Date().toISOString()
          }
        ]
      };
      try {
        await axios.post(channel.discordWebhookUrl, embedPayload);
        updatedInDiscord=true;
      } catch (err) {
        console.error("Failed to send Discord webhook", err);
      }
    }
    return res.status(200).send("New clip created. Clipped by: " + clippedBy + (updatedInDiscord ? " Updated in discord." : ""));
  } catch (err) {
    console.error(err);
    res.status(500).send("Internal error");
  }
});

router.post("/channel/clips", channelClipsLimiter, async (req, res) => {
  try {
    const body = req.body || {};
    const { channelId: ytChannelIdParam, handle: handleParam } = body;
    const limit = Math.min(Math.max(Number(body.limit) || 20, 1), 100);
    const offset = Math.max(Number(body.offset) || 0, 0);

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
    const [clips, total] = await clipRepo.findAndCount({
      where: { channelId: channel.id },
      order: { createdAt: "DESC" },
      take: limit,
      skip: offset,
    });

    return res.status(200).json({
      clips,
      total,
      limit,
      offset,
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

function formatOffset(seconds: number) {
  const h = Math.floor(seconds / 3600).toString().padStart(2, "0");
  const m = Math.floor((seconds % 3600) / 60).toString().padStart(2, "0");
  const s = (seconds % 60).toString().padStart(2, "0");
  return `${h}:${m}:${s}`;
}
