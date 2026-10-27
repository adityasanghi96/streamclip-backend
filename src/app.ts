import express from "express";
import cors from "cors";
import clipRoute from "./routes/clip.route";
import authRoute from "./routes/auth.route";
import meRoute from "./routes/me.route";
import channelsRoute from "./routes/channels.route";
import usersRoute from "./routes/users.route";
import clipsRoute from "./routes/clips.route";
import gamesRoute from "./routes/games.route";

const allowedOrigins: Array<string | RegExp> = [
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  /^https?:\/\/(www\.)?streamclip\.in(:\d+)?$/,
  /^https?:\/\/[a-z0-9-]+\.streamclip\.in(:\d+)?$/,
  /^https?:\/\/[a-z0-9-]+\.cancanarycan\.in(:\d+)?$/,
];

function isAllowedOrigin(origin: string) {
  return allowedOrigins.some((allowed) =>
    typeof allowed === "string" ? allowed === origin : allowed.test(origin)
  );
}

function corsOrigin(origin: string | undefined, callback: (err: Error | null, allow?: boolean | string) => void) {
  if (!origin || isAllowedOrigin(origin)) return callback(null, origin || true);
  callback(null, false);
}

const app = express();
app.use(cors({
  origin: corsOrigin,
  credentials: true,
  allowedHeaders: ["Content-Type", "Authorization"],
}));
app.use(express.json());
app.get(["/api", "/api/"], (_req, res) => {
  res.redirect(301, "/");
});
app.use("/api/auth", authRoute);
app.use("/api/me", meRoute);
app.use("/api/channels", channelsRoute);
app.use("/api/games", gamesRoute);
app.use("/api/users", usersRoute);
app.use("/api/clips", clipsRoute);
app.use("/api", clipRoute);

export default app;
