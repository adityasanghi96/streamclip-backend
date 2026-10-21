import { Router } from "express";
import jwt from "jsonwebtoken";
import AppDataSource from "../db/data-source";
import { User } from "../db/entities/User";
import { ENV } from "../env";
import { fetchGoogleUser } from "../services/youtubeChannel.service";
import { toPublicUser } from "../utils/serialize";

const router = Router();

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

    const token = jwt.sign({ userId: user.id }, ENV.JWT_SECRET, { expiresIn: "7d" });

    return res.status(200).json({
      token,
      user: toPublicUser(user),
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

export default router;
