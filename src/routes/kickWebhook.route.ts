import { Router } from "express";
import { dispatchKickWebhook } from "../services/liveChat.hub";
import { verifyKickWebhook } from "../services/kick.service";

const router = Router();

router.post("/", async (req, res) => {
  try {
    const raw = Buffer.isBuffer(req.body)
      ? req.body
      : Buffer.from(typeof req.body === "string" ? req.body : JSON.stringify(req.body || {}));
    const headers = req.headers as Record<string, string | string[] | undefined>;
    const valid = await verifyKickWebhook(headers, raw);
    if (!valid) return res.status(401).json({ error: "Invalid Kick signature" });

    const eventType = String(req.header("Kick-Event-Type") || "");
    const payload = JSON.parse(raw.toString("utf8") || "{}");
    dispatchKickWebhook(eventType, payload);
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("Kick webhook failed", err);
    return res.status(500).json({ error: "Kick webhook failed" });
  }
});

export default router;
