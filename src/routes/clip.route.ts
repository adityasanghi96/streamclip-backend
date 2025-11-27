import { Router } from "express";
import { fetchLiveChatModerators, getActiveLiveVideoId, getLiveChatId, getLiveStreamOffset } from "../services/youtube.service";
import { fetchYouTubeChannelInfo } from "../services/youtubeChannel.service";
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

router.get("/webhook/:provider/:channelId/:chatId/:webhook", async (req, res) => {
  try {
    const user = (req.query.user as string)?.toLowerCase();
    if (!user) return res.status(400).send("User not found");

    const { provider, channelId, webhook } = req.params;
    if (provider !== "youtube") {
      return res.status(400).send("Only YouTube supported currently");
    }

    const chanRepo = AppDataSource.getRepository(Channel);

    let channel = await chanRepo.findOneBy({ ytChannelId: channelId });

    const info = await fetchYouTubeChannelInfo(channelId);
    if (!info) return res.status(404).send("Channel info not found via API");
    // If the channel does not exist → create but DO NOT set webhook
    if (!channel) {
      channel = chanRepo.create({
        ytChannelId: channelId,
        name: info.name,
        imageUrl: info.imageUrl,
        handle: info.handle,
        profileUrl: info.url,
      });

      return res.status(403).send("Channel registered but webhook not set. Only channel owner or live moderator can approve webhook update.");
    }

    // ---- AUTH CHECK STARTS ----
    const ownerHandle = channel.handle?.toLowerCase();

    // If owner → allow
    if (ownerHandle && user === ownerHandle) {
      console.log("Owner verified:", user);
    } else {
      // If not owner → check live moderators
      const liveVideoId = await getActiveLiveVideoId(channelId);
      if (!liveVideoId) return res.status(403).send("Channel not live, cannot verify moderators");

      const liveChatId = await getLiveChatId(liveVideoId);
      if (!liveChatId) return res.status(403).send("Live chat not found");

      const moderators = await fetchLiveChatModerators(liveChatId);
      console.log("Mods:",moderators.join(","));

      const isMod = moderators.some((m: string) => m.toLowerCase() === user);
      if (!isMod) {
        return res.status(403).send("Only channel owner or live chat moderator can update webhook");
      }

      console.log("Moderator verified:", user);
    }
    // ---- AUTH CHECK ENDS ----

    channel.discordWebhookUrl = webhook;
    await chanRepo.save(channel);

    return res.status(200).send("Webhook updated successfully");

  } catch (err) {
    console.error(err);
    res.status(500).send("Internal error");
  }
});


export default router;
