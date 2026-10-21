import axios from "axios";
import AppDataSource from "../db/data-source";
import { Clip } from "../db/entities/Clip";
import { Game } from "../db/entities/Game";
import { ENV } from "../env";
import { detectedGame, detectYoutubeGame, matchGameFromList, upsertGame } from "../services/game.service";
import { fetchTwitchClipsByIds, fetchTwitchGames } from "../services/twitch.service";

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function youtubeVideos(ids: string[]) {
  const unique = [...new Set(ids.map((id) => id.trim()).filter(Boolean))];
  const byId = new Map<string, { title?: string; tags?: string[]; topicCategories?: string[] }>();
  if (!ENV.YT_API_KEY || !unique.length) return byId;

  for (let i = 0; i < unique.length; i += 50) {
    const chunk = unique.slice(i, i + 50);
    try {
      const res = await axios.get("https://www.googleapis.com/youtube/v3/videos", {
        params: {
          part: "snippet,topicDetails",
          id: chunk.join(","),
          key: ENV.YT_API_KEY,
        },
        timeout: 10000,
      });
      for (const item of res.data?.items || []) {
        const id = String(item.id || "");
        if (!id) continue;
        byId.set(id, {
          title: item.snippet?.title,
          tags: Array.isArray(item.snippet?.tags) ? item.snippet.tags.map(String) : [],
          topicCategories: Array.isArray(item.topicDetails?.topicCategories)
            ? item.topicDetails.topicCategories.map(String)
            : [],
        });
      }
    } catch (err) {
      console.warn(`YouTube videos.list failed for chunk starting ${chunk[0]}`, (err as Error).message);
    }
    await sleep(80);
  }
  return byId;
}

async function run() {
  await AppDataSource.initialize();
  const gameRepo = AppDataSource.getRepository(Game);
  const clipRepo = AppDataSource.getRepository(Clip);
  const junkSlugs = [
    "action-adventure-game",
    "action-game",
    "lifestyle-sociology",
    "film",
  ];
  const junk = await gameRepo.find({ where: junkSlugs.map((slug) => ({ slug })) });
  const junkIds = junk.map((game) => game.id);
  if (junkIds.length) {
    await clipRepo
      .createQueryBuilder()
      .update(Clip)
      .set({ gameId: null })
      .where("gameId IN (:...ids)", { ids: junkIds })
      .execute();
    await gameRepo.delete(junkIds);
  }

  const games = await gameRepo.find();
  if (!games.length) {
    console.log("No games in the database. Run npm run seed:games first.");
    await AppDataSource.destroy();
    return;
  }

  const clips = await clipRepo
    .createQueryBuilder("clip")
    .where("clip.gameId IS NULL")
    .getMany();

  console.log(`Matching ${clips.length} clips against ${games.length} games`);
  let linked = 0;
  const leftover: Clip[] = [];

  for (const clip of clips) {
    const match = matchGameFromList(clip.clipName || "", games);
    if (!match) {
      leftover.push(clip);
      continue;
    }
    clip.gameId = match.id;
    clip.game = match;
    await clipRepo.save(clip);
    linked += 1;
  }
  console.log(`Title matches: ${linked}`);

  const twitchClips = leftover.filter((clip) => clip.provider === "twitch");
  if (twitchClips.length) {
    const helix = await fetchTwitchClipsByIds(twitchClips.map((clip) => clip.liveVideoId));
    const helixById = new Map(helix.map((clip) => [clip.id, clip]));
    const gameMap = await fetchTwitchGames(helix.map((clip) => clip.game_id || ""));
    let twitchLinked = 0;
    for (const clip of twitchClips) {
      const remote = helixById.get(clip.liveVideoId);
      const game = remote?.game_id ? gameMap.get(remote.game_id) : undefined;
      if (!game?.name) continue;
      const detected = detectedGame(game.name, game.imageUrl);
      if (!detected) continue;
      const saved = await upsertGame(detected);
      clip.gameId = saved.id;
      clip.game = saved;
      await clipRepo.save(clip);
      twitchLinked += 1;
    }
    linked += twitchLinked;
    console.log(`Twitch Helix matches: ${twitchLinked}`);
  }

  const youtubeClips = leftover.filter((clip) => clip.provider === "youtube" && !clip.gameId);
  if (youtubeClips.length) {
    const videoIds = [...new Set(youtubeClips.map((clip) => clip.liveVideoId).filter(Boolean))];
    console.log(`YouTube videos to inspect: ${videoIds.length}`);
    const videos = await youtubeVideos(videoIds);
    const detectedByVideo = new Map<string, Awaited<ReturnType<typeof detectYoutubeGame>>>();
    for (const [videoId, meta] of videos.entries()) {
      detectedByVideo.set(videoId, await detectYoutubeGame(meta));
    }
    let youtubeLinked = 0;
    for (const clip of youtubeClips) {
      const detected = detectedByVideo.get(clip.liveVideoId);
      if (!detected) continue;
      const saved = await upsertGame(detected);
      clip.gameId = saved.id;
      clip.game = saved;
      await clipRepo.save(clip);
      youtubeLinked += 1;
    }
    linked += youtubeLinked;
    console.log(`YouTube topic/title matches: ${youtubeLinked}`);
  }

  const stillOpen = leftover.filter((clip) => !clip.gameId).length;
  console.log(`Done. linked=${linked} unmatched=${stillOpen}`);
  await AppDataSource.destroy();
}

run().catch(async (err) => {
  console.error(err);
  if (AppDataSource.isInitialized) await AppDataSource.destroy();
  process.exit(1);
});
