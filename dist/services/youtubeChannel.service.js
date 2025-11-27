"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.fetchYouTubeChannelInfo = fetchYouTubeChannelInfo;
const axios_1 = __importDefault(require("axios"));
const env_1 = require("../env");
async function fetchYouTubeChannelInfo(ytChannelId) {
    const url = `https://www.googleapis.com/youtube/v3/channels?part=snippet&id=${ytChannelId}&key=${env_1.ENV.YT_API_KEY}`;
    const res = await axios_1.default.get(url);
    const channel = res.data.items?.[0];
    if (!channel)
        return null;
    return {
        name: channel.snippet.title,
        imageUrl: channel.snippet.thumbnails?.default?.url || ""
    };
}
