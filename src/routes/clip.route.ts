import { Router } from "express";
import { getLiveStreamOffset } from "../services/youtube.service";
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

    if (provider !== "youtube") {
      return res.status(400).send("Only YouTube supported currently");
    }

    const liveInfo = await getLiveStreamOffset(channelId);
    if (!liveInfo) return res.status(404).send("Channel not live");

    const liveVideoId = liveInfo.liveVideoId;
    const offsetSeconds = liveInfo.offsetSec;

    const finalOffset = Math.max(0, offsetSeconds - delaySeconds);

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
          imageUrl: info.imageUrl
        });
      } else {
        // Refresh existing
        channel.name = info.name;
        channel.imageUrl = info.imageUrl;
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

    return res.json({
      // message: "Clip stored",
      clipUrl: `https://youtube.com/watch?v=${liveVideoId}&t=${finalOffset}s`,
      // clipId: clip.id,
      // channel
    });

  } catch (err) {
    console.error(err);
    res.status(500).send("Internal error");
  }
});

export default router;
