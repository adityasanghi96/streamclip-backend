import express from "express";
import cors from "cors";
import clipRoute from "./routes/clip.route";

const allowedOrigins = [
  "http://localhost:3000",
  /^https?:\/\/[a-z0-9-]+\.cancanarycan\.in(:\d+)?$/,
];

function corsOrigin(origin: string | undefined, callback: (err: Error | null, allow?: boolean | string) => void) {
  if (!origin) return callback(null, true);
  if (origin === "http://localhost:3000") return callback(null, origin);
  if (allowedOrigins.some((o) => o instanceof RegExp && o.test(origin))) return callback(null, origin);
  callback(null, false);
}

const app = express();
app.use(cors({ origin: corsOrigin }));
app.use(express.json());
app.use("/api", clipRoute);

export default app;
