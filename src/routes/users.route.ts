import { Router } from "express";
import { In } from "typeorm";
import AppDataSource from "../db/data-source";
import { Channel } from "../db/entities/Channel";
import { Clip } from "../db/entities/Clip";
import { User } from "../db/entities/User";
import { resolveRequestedGame } from "../services/game.service";
import { toPublicChannel, toPublicClip, toPublicCreator } from "../utils/serialize";
import {
  applyGroupedSort,
  parseChannelSort,
  parseLimitOffset,
  parseProvider,
  parseSearch,
  parseSortDir,
  parseSource,
} from "../utils/query";

const router = Router();

router.get("/", async (req, res) => {
  try {
    const { limit, offset } = parseLimitOffset(req.query, 12);
    const provider = parseProvider(req.query.provider);
    const source = parseSource(req.query.source);
    const q = parseSearch(req.query.q);
    const sort = parseChannelSort(req.query.sort);
    const dir = parseSortDir(req.query.dir, sort);

    const clipRepo = AppDataSource.getRepository(Clip);
    const userRepo = AppDataSource.getRepository(User);
    const { requested: gameRequested, game: gameRow } = await resolveRequestedGame(req.query);
    if (gameRequested && !gameRow) {
      return res.status(200).json({
        users: [],
        total: 0,
        limit,
        offset,
        provider: provider || null,
        source: source || null,
      });
    }

    const filteredClips = () => {
      const qb = clipRepo
        .createQueryBuilder("clip")
        .innerJoin("clip.channel", "channel")
        .innerJoin(User, "owner", "owner.id = channel.ownerId")
        .andWhere("channel.ownerId IS NOT NULL");
      if (provider) qb.andWhere("clip.provider = :provider", { provider });
      if (source) qb.andWhere("clip.source = :source", { source });
      if (gameRow) qb.andWhere("clip.gameId = :gameId", { gameId: gameRow.id });
      if (q) qb.andWhere("owner.name ILIKE :q", { q: `%${q}%` });
      return qb;
    };

    const totalRow = await filteredClips()
      .select("COUNT(DISTINCT channel.ownerId)", "total")
      .getRawOne<{ total: string }>();
    const total = Number(totalRow?.total || 0);

    const grouped = filteredClips()
      .select("channel.ownerId", "ownerId")
      .addSelect("COUNT(clip.id)", "clipCount")
      .addSelect("MAX(clip.createdAt)", "lastClipAt")
      .addSelect("MIN(clip.createdAt)", "firstClipAt")
      .addSelect("STRING_AGG(DISTINCT clip.provider, ',')", "providers")
      .addSelect("MAX(channel.followerCount)", "followerCount")
      .addSelect("MIN(LOWER(owner.name))", "sortName")
      .groupBy("channel.ownerId");

    applyGroupedSort(grouped, sort, dir, "MIN(LOWER(owner.name))");
    grouped.addOrderBy("channel.ownerId", "ASC");

    const rows = await grouped
      .offset(offset)
      .limit(limit)
      .getRawMany<{ ownerId: number; clipCount: string; lastClipAt: Date; providers: string }>();

    const ids = rows.map((row) => Number(row.ownerId)).filter(Boolean);
    const users = ids.length ? await userRepo.findBy({ id: In(ids) }) : [];
    const byId = new Map(users.map((user) => [user.id, user]));

    return res.status(200).json({
      users: rows
        .map((row) => {
          const user = byId.get(Number(row.ownerId));
          if (!user) return null;
          const providers = String(row.providers || "")
            .split(",")
            .map((value) => value.trim())
            .filter(Boolean);
          return toPublicCreator(user, {
            clipCount: Number(row.clipCount),
            lastClipAt: row.lastClipAt,
            providers,
          });
        })
        .filter(Boolean),
      total,
      limit,
      offset,
      provider: provider || null,
      source: source || null,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id < 1) {
      return res.status(400).json({ error: "Invalid user" });
    }

    const user = await AppDataSource.getRepository(User).findOneBy({ id });
    if (!user) return res.status(404).json({ error: "User not found" });

    const channels = await AppDataSource.getRepository(Channel).find({
      where: { ownerId: user.id },
      order: { createdAt: "DESC" },
    });

    return res.status(200).json({
      user: toPublicCreator(user, {
        providers: [...new Set(channels.map((channel) => channel.provider || "youtube"))],
      }),
      channels: channels.map((channel) => toPublicChannel(channel)),
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

router.get("/:id/clips", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id < 1) {
      return res.status(400).json({ error: "Invalid user" });
    }

    const { limit, offset } = parseLimitOffset(req.query, 12);
    const provider = parseProvider(req.query.provider);
    const source = parseSource(req.query.source);
    const { requested: gameRequested, game: gameRow } = await resolveRequestedGame(req.query);

    const user = await AppDataSource.getRepository(User).findOneBy({ id });
    if (!user) return res.status(404).json({ error: "User not found" });

    const owned = await AppDataSource.getRepository(Channel).find({
      where: { ownerId: user.id },
      select: ["id"],
    });
    const channelIds = owned.map((channel) => channel.id);
    if (channelIds.length === 0 || (gameRequested && !gameRow)) {
      return res.status(200).json({
        user: toPublicCreator(user),
        clips: [],
        total: 0,
        limit,
        offset,
        provider: provider || null,
        source: source || null,
        gameId: gameRow?.id ?? null,
      });
    }

    const where: {
      channelId: ReturnType<typeof In>;
      source?: "native" | "nightbot";
      provider?: string;
      gameId?: number;
    } = {
      channelId: In(channelIds),
    };
    if (source) where.source = source;
    if (provider) where.provider = provider;
    if (gameRow) where.gameId = gameRow.id;

    const [clips, total] = await AppDataSource.getRepository(Clip).findAndCount({
      where,
      order: { createdAt: "DESC" },
      take: limit,
      skip: offset,
    });

    return res.status(200).json({
      user: toPublicCreator(user),
      clips: clips.map(toPublicClip),
      total,
      limit,
      offset,
      provider: provider || null,
      source: source || null,
      gameId: gameRow?.id ?? null,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

export default router;
