import { Router } from "express";
import AppDataSource from "../db/data-source";
import { Clip } from "../db/entities/Clip";
import { toPublicClip } from "../utils/serialize";

const router = Router();

async function neighborClip(clip: Clip, direction: "prev" | "next") {
  const qb = AppDataSource.getRepository(Clip)
    .createQueryBuilder("clip")
    .select(["clip.id"])
    .where("clip.channelId = :channelId", { channelId: clip.channelId })
    .andWhere("clip.id <> :id", { id: clip.id });

  if (direction === "prev") {
    qb.andWhere(
      "(clip.createdAt > :createdAt OR (clip.createdAt = :createdAt AND clip.id > :id))",
      { createdAt: clip.createdAt, id: clip.id }
    )
      .orderBy("clip.createdAt", "ASC")
      .addOrderBy("clip.id", "ASC");
  } else {
    qb.andWhere(
      "(clip.createdAt < :createdAt OR (clip.createdAt = :createdAt AND clip.id < :id))",
      { createdAt: clip.createdAt, id: clip.id }
    )
      .orderBy("clip.createdAt", "DESC")
      .addOrderBy("clip.id", "DESC");
  }

  return qb.getOne();
}

router.get("/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id < 1) {
      return res.status(400).json({ error: "Invalid clip" });
    }

    const clip = await AppDataSource.getRepository(Clip).findOne({ where: { id } });
    if (!clip) return res.status(404).json({ error: "Clip not found" });

    const [prev, next] = await Promise.all([neighborClip(clip, "prev"), neighborClip(clip, "next")]);

    return res.status(200).json({
      clip: toPublicClip(clip),
      prevId: prev?.id ?? null,
      nextId: next?.id ?? null,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

export default router;
