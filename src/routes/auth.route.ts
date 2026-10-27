import { Router } from "express";
import rateLimit from "express-rate-limit";
import jwt from "jsonwebtoken";
import AppDataSource from "../db/data-source";
import { User } from "../db/entities/User";
import { ENV } from "../env";
import { normalizeUsername, verifyPassword } from "../services/credentials.service";
import { fetchGoogleUser } from "../services/youtubeChannel.service";
import { toPublicUser } from "../utils/serialize";

const router = Router();

const passwordLoginLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  message: { error: "Too many sign-in attempts. Try again in a minute." },
  standardHeaders: true,
  legacyHeaders: false,
});

function signToken(userId: number) {
  return jwt.sign({ userId }, ENV.JWT_SECRET, { expiresIn: "7d" });
}

router.post("/google", async (req, res) => {
  try {
    const accessToken = String(req.body?.accessToken || "");
    if (!accessToken) {
      return res.status(400).json({ error: "accessToken required" });
    }

    const googleUser = await fetchGoogleUser(accessToken);
    if (!googleUser?.id) {
      return res.status(401).json({ error: "Invalid Google token" });
    }

    const userRepo = AppDataSource.getRepository(User);
    let user = await userRepo.findOneBy({ googleId: googleUser.id });

    if (!user) {
      user = userRepo.create({
        googleId: googleUser.id,
        email: googleUser.email,
        name: googleUser.name,
        picture: googleUser.picture,
      });
    } else {
      user.email = googleUser.email;
      user.name = googleUser.name;
      user.picture = googleUser.picture;
    }

    await userRepo.save(user);

    return res.status(200).json({
      token: signToken(user.id),
      user: toPublicUser(user),
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

router.post("/password", passwordLoginLimiter, async (req, res) => {
  try {
    const usernameInput = String(req.body?.username ?? "").trim();
    const password = String(req.body?.password ?? "");
    if (!usernameInput || !password) {
      return res.status(400).json({ error: "Username and password are required" });
    }

    const username = normalizeUsername(usernameInput);
    const userRepo = AppDataSource.getRepository(User);
    const user = username ? await userRepo.findOneBy({ username }) : null;
    const passwordOk = await verifyPassword(password, user?.passwordHash);
    if (!user?.passwordHash || !passwordOk) {
      return res.status(401).json({ error: "Invalid username or password" });
    }

    return res.status(200).json({
      token: signToken(user.id),
      user: toPublicUser(user),
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

export default router;
