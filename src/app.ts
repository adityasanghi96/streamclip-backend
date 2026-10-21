import express from "express";
import cors from "cors";
import clipRoute from "./routes/clip.route";
import authRoute from "./routes/auth.route";
import meRoute from "./routes/me.route";
import channelsRoute from "./routes/channels.route";
import usersRoute from "./routes/users.route";
import clipsRoute from "./routes/clips.route";
import gamesRoute from "./routes/games.route";

const allowedOrigins = [
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  /^https?:\/\/[a-z0-9-]+\.cancanarycan\.in(:\d+)?$/,
];

function corsOrigin(origin: string | undefined, callback: (err: Error | null, allow?: boolean | string) => void) {
  if (!origin) return callback(null, true);
  if (origin === "http://localhost:3000" || origin === "http://127.0.0.1:3000") return callback(null, origin);
  if (allowedOrigins.some((o) => o instanceof RegExp && o.test(origin))) return callback(null, origin);
  callback(null, false);
}

const app = express();
app.use(cors({
  origin: corsOrigin,
  credentials: true,
  allowedHeaders: ["Content-Type", "Authorization"],
}));
app.use(express.json());
app.use("/api/auth", authRoute);
app.use("/api/me", meRoute);
app.use("/api/channels", channelsRoute);
app.use("/api/games", gamesRoute);
app.use("/api/users", usersRoute);
app.use("/api/clips", clipsRoute);
app.use("/api", clipRoute);

export default app;
