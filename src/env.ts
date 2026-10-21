import dotenv from "dotenv";
dotenv.config();

export const ENV = {
  PG_HOST: process.env.PG_HOST || "localhost",
  PG_PORT: Number(process.env.PG_PORT || 5432),
  PG_USERNAME: process.env.PG_USERNAME || "postgres",
  PG_PASSWORD: process.env.PG_PASSWORD || "",
  PG_DATABASE: process.env.PG_DATABASE || "stream_clip_local",
  PG_SYNC: process.env.PG_TYPEORM_SYNC === "true",
  YT_API_KEY: process.env.YT_API_KEY!,
  PORT: Number(process.env.PORT || 7000),
  GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID || "",
  GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECTET || "",
  GOOGLE_YOUTUBE_REDIRECT_URI: process.env.GOOGLE_YOUTUBE_REDIRECT_URI || "http://localhost:3000/oauth/youtube",
  JWT_SECRET: process.env.JWT_SECRET || "dev-streamclip-jwt-secret",
  TWITCH_CLIENT_ID: process.env.TWITCH_CLIENT_ID || "",
  TWITCH_CLIENT_SECRET: process.env.TWITCH_CLIENT_SECRET || "",
  TWITCH_REDIRECT_URI: process.env.TWITCH_REDIRECT_URI || "http://localhost:3000/oauth/twitch",
  KICK_CLIENT_ID: process.env.KICK_CLIENT_ID || "",
  KICK_CLIENT_SECRET: process.env.KICK_CLIENT_SECRET || "",
  KICK_REDIRECT_URI: process.env.KICK_REDIRECT_URI || "http://localhost:3000/oauth/kick",
  DISCORD_SUPPORT_SERVER_URL: process.env.DISCORD_SUPPORT_SERVER_URL || "",
  DISCORD_SERVER_DEFAULT_WEBHOOK: process.env.DISCORD_SERVER_DEFAULT_WEBHOOK || "",
};
