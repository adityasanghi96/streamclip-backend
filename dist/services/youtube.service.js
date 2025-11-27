"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getActiveLiveVideoId = getActiveLiveVideoId;
const axios_1 = __importDefault(require("axios"));
const env_1 = require("../env");
async function getActiveLiveVideoId(channelId) {
    const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&channelId=${channelId}&eventType=live&type=video&key=${env_1.ENV.YT_API_KEY}`;
    const res = await axios_1.default.get(url);
    if (res.data.items?.length > 0) {
        return res.data.items[0].id.videoId;
    }
    return null;
}
