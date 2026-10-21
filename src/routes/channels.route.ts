import { Router } from "express";
import { In } from "typeorm";
import AppDataSource from "../db/data-source";
import { Channel } from "../db/entities/Channel";
import { Clip } from "../db/entities/Clip";
import { resolveRequestedGame } from "../services/game.service";
import { toPublicChannel, toPublicClip } from "../utils/serialize";
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

function clipListWhere(channelId: number, source?: string, provider?: string, gameId?: number) {
  const where: {
    channelId: number;
    source?: "native" | "nightbot";
    provider?: string;
    gameId?: number;
  } = { channelId };
  if (source === "native" || source === "nightbot") where.source = source;
  if (provider) where.provider = provider;
  if (gameId) where.gameId = gameId;
  return where;
}

router.get("/", async (req, res) => {
  try {
    const { limit, offset } = parseLimitOffset(req.query, 12);
    const provider = parseProvider(req.query.provider);
    const source = parseSource(req.query.source);
    const q = parseSearch(req.query.q);
    const sort = parseChannelSort(req.query.sort);
    const dir = parseSortDir(req.query.dir, sort);

    const clipRepo = AppDataSource.getRepository(Clip);
    const chanRepo = AppDataSource.getRepository(Channel);
    const { requested: gameRequested, game: gameRow } = await resolveRequestedGame(req.query);
    if (gameRequested && !gameRow) {
      return res.status(200).json({
        channels: [],
        total: 0,
        limit,
        offset,
        provider: provider || null,
        source: source || null,
        q: q || null,
        gameId: null,
        sort,
        dir: dir.toLowerCase(),
      });
    }

    const filteredClips = () => {
      const qb = clipRepo.createQueryBuilder("clip").innerJoin("clip.channel", "channel");
      if (provider) qb.andWhere("clip.provider = :provider", { provider });
      if (source) qb.andWhere("clip.source = :source", { source });
      if (gameRow) qb.andWhere("clip.gameId = :gameId", { gameId: gameRow.id });
      if (q) qb.andWhere("(channel.name ILIKE :q OR COALESCE(channel.handle, '') ILIKE :q)", { q: `%${q}%` });
      return qb;
    };

    const totalRow = await filteredClips()
      .select("COUNT(DISTINCT clip.channelId)", "total")
      .getRawOne<{ total: string }>();
    const total = Number(totalRow?.total || 0);

    const grouped = filteredClips()
      .select("clip.channelId", "channelId")
      .addSelect("COUNT(clip.id)", "clipCount")
      .addSelect("MAX(clip.createdAt)", "lastClipAt")
      .addSelect("MIN(clip.createdAt)", "firstClipAt")
      .addSelect("MAX(channel.followerCount)", "followerCount")
      .addSelect("MIN(LOWER(channel.name))", "sortName")
      .groupBy("clip.channelId");

    applyGroupedSort(grouped, sort, dir, "MIN(LOWER(channel.name))");
    grouped.addOrderBy("clip.channelId", "ASC");

    const rows = await grouped
      .offset(offset)
      .limit(limit)
      .getRawMany<{
        channelId: number;
        clipCount: string;
        lastClipAt: Date;
        firstClipAt: Date;
        followerCount: string | null;
      }>();

    const ids = rows.map((row) => Number(row.channelId));
    const channels = ids.length ? await chanRepo.findBy({ id: In(ids) }) : [];
    const byId = new Map(channels.map((channel) => [channel.id, channel]));

    return res.status(200).json({
      channels: rows
        .map((row) => {
          const channel = byId.get(Number(row.channelId));
          if (!channel) return null;
          return toPublicChannel(channel, {
            clipCount: Number(row.clipCount),
            lastClipAt: row.lastClipAt,
            firstClipAt: row.firstClipAt,
            followerCount: row.followerCount == null ? channel.followerCount ?? null : Number(row.followerCount),
          });
        })
        .filter(Boolean),
      total,
      limit,
      offset,
      provider: provider || null,
      source: source || null,
      q: q || null,
      gameId: gameRow?.id ?? null,
      sort,
      dir: dir.toLowerCase(),
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

router.get("/:ytChannelId", async (req, res) => {
  try {
    const { ytChannelId } = req.params;
    const source = parseSource(req.query.source);
    const chanRepo = AppDataSource.getRepository(Channel);
    const clipRepo = AppDataSource.getRepository(Clip);

    const channel = await chanRepo.findOneBy({ ytChannelId });
    if (!channel) return res.status(404).json({ error: "Channel not found" });

    const total = await clipRepo.count({ where: clipListWhere(channel.id, source) });

    return res.status(200).json({
      channel: toPublicChannel(channel, { clipCount: total }),
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

router.get("/:ytChannelId/clips", async (req, res) => {
  try {
    const { ytChannelId } = req.params;
    const { limit, offset } = parseLimitOffset(req.query, 12);
    const source = parseSource(req.query.source);
    const { requested: gameRequested, game: gameRow } = await resolveRequestedGame(req.query);
    if (gameRequested && !gameRow) {
      const channel = await AppDataSource.getRepository(Channel).findOneBy({ ytChannelId });
      if (!channel) return res.status(404).json({ error: "Channel not found" });
      return res.status(200).json({
        channel: toPublicChannel(channel, { clipCount: 0 }),
        clips: [],
        total: 0,
        limit,
        offset,
        source: source || null,
        gameId: null,
      });
    }

    const chanRepo = AppDataSource.getRepository(Channel);
    const clipRepo = AppDataSource.getRepository(Clip);

    const channel = await chanRepo.findOneBy({ ytChannelId });
    if (!channel) return res.status(404).json({ error: "Channel not found" });

    const [clips, total] = await clipRepo.findAndCount({
      where: clipListWhere(channel.id, source, undefined, gameRow?.id),
      order: { createdAt: "DESC" },
      take: limit,
      skip: offset,
    });

    return res.status(200).json({
      channel: toPublicChannel(channel, { clipCount: total }),
      clips: clips.map(toPublicClip),
      total,
      limit,
      offset,
      source: source || null,
      gameId: gameRow?.id ?? null,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

export default router;
