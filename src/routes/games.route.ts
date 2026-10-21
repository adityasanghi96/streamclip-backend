import { Router } from "express";
import AppDataSource from "../db/data-source";
import { Clip } from "../db/entities/Clip";
import { Game } from "../db/entities/Game";
import { parseProvider, parseSource } from "../utils/query";

const router = Router();

router.get("/", async (req, res) => {
  try {
    const provider = parseProvider(req.query.provider);
    const source = parseSource(req.query.source);
    const gameRepo = AppDataSource.getRepository(Game);
    const clipRepo = AppDataSource.getRepository(Clip);

    const countQb = clipRepo
      .createQueryBuilder("clip")
      .select("clip.gameId", "id")
      .addSelect("COUNT(clip.id)", "clipCount")
      .where("clip.gameId IS NOT NULL");
    if (provider) countQb.andWhere("clip.provider = :provider", { provider });
    if (source) countQb.andWhere("clip.source = :source", { source });
    const counts = await countQb.groupBy("clip.gameId").getRawMany<{ id: string; clipCount: string }>();
    const countById = new Map(counts.map((row) => [Number(row.id), Number(row.clipCount)]));

    const games = await gameRepo.find({
      order: { popularity: "DESC", name: "ASC" },
      take: 80,
    });

    const payload = games
      .map((game) => ({
        id: game.id,
        slug: game.slug,
        name: game.name,
        imageUrl: game.imageUrl || null,
        clipCount: countById.get(game.id) || 0,
        popularity: game.popularity || 0,
      }))
      .sort((a, b) => b.clipCount - a.clipCount || b.popularity - a.popularity)
      .map(({ popularity: _popularity, ...game }) => game);

    return res.status(200).json({ games: payload });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

export default router;
