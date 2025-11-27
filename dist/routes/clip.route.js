"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const youtube_service_1 = require("../services/youtube.service");
const youtubeChannel_service_1 = require("../services/youtubeChannel.service");
const time_1 = require("../utils/time");
const data_source_1 = __importDefault(require("../db/data-source"));
const Clip_1 = require("../db/entities/Clip");
const Channel_1 = require("../db/entities/Channel");
const router = (0, express_1.Router)();
router.get("/clip/:provider/:channelId/:chatId/:clipName", async (req, res) => {
    try {
        const { provider, channelId, chatId, clipName } = req.params;
        const offsetSeconds = String(req.query.delay || "0");
        const clippedBy = req.query.user || chatId;
        if (provider !== "youtube") {
            return res.status(400).send("Only YouTube supported currently");
        }
        const liveVideoId = await (0, youtube_service_1.getActiveLiveVideoId)(channelId);
        if (!liveVideoId)
            return res.status(404).send("Channel not live");
        const chanRepo = data_source_1.default.getRepository(Channel_1.Channel);
        let channel = await chanRepo.findOneBy({ ytChannelId: channelId });
        const shouldRefresh = channel && (0, time_1.isOlderThan)(channel.updatedAt, 24);
        if (!channel || shouldRefresh) {
            const info = await (0, youtubeChannel_service_1.fetchYouTubeChannelInfo)(channelId);
            if (!info)
                return res.status(404).send("Channel info not found via YouTube API");
            if (!channel) {
                // Create new
                channel = chanRepo.create({
                    ytChannelId: channelId,
                    name: info.name,
                    imageUrl: info.imageUrl
                });
            }
            else {
                // Refresh existing
                channel.name = info.name;
                channel.imageUrl = info.imageUrl;
            }
            await chanRepo.save(channel);
        }
        const clipRepo = data_source_1.default.getRepository(Clip_1.Clip);
        const clip = clipRepo.create({
            provider,
            channelId: channel.id,
            channel,
            chatId,
            clipName,
            liveVideoId,
            offsetSeconds,
            clippedBy
        });
        await clipRepo.save(clip);
        return res.json({
            message: "Clip stored",
            clipUrl: `https://youtube.com/watch?v=${liveVideoId}&t=${offsetSeconds}s`,
            clipId: clip.id,
            channel
        });
    }
    catch (err) {
        console.error(err);
        res.status(500).send("Internal error");
    }
});
exports.default = router;
