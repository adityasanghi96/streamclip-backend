/**
 * Seed games from src/scripts/data/games.json.
 * Covers: Twitch Helix Get Games (box art), then Steam storesearch tiny_image.
 * Existing rows with the same slug or name are skipped (popularity/image may update).
 */
import fs from "fs";
import path from "path";
import axios from "axios";
import AppDataSource from "../db/data-source";
import { Game } from "../db/entities/Game";
import { slugifyGame } from "../services/game.service";
import { fetchTwitchGamesByName } from "../services/twitch.service";

type CatalogGame = { count: number; name: string };

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function steamImage(name: string): Promise<string | null> {
  try {
    const res = await axios.get("https://store.steampowered.com/api/storesearch/", {
      params: { term: name, l: "english", cc: "US" },
      timeout: 8000,
      headers: { "User-Agent": "streamclip-game-seed" },
    });
    const items = Array.isArray(res.data?.items) ? res.data.items : [];
    const exact = items.find((item: { name?: string }) => String(item.name || "").toLowerCase() === name.toLowerCase());
    const item = exact || items[0];
    const image = item?.tiny_image || item?.tinyimage;
    return image ? String(image) : null;
  } catch {
    return null;
  }
}

async function run() {
  const catalogPath = path.join(__dirname, "data", "games.json");
  const catalog = JSON.parse(fs.readFileSync(catalogPath, "utf8")) as CatalogGame[];
  const rows = catalog
    .filter((row) => row?.name)
    .sort((a, b) => b.count - a.count);

  await AppDataSource.initialize();
  const repo = AppDataSource.getRepository(Game);
  const existing = await repo.find();
  const bySlug = new Map(existing.map((game) => [game.slug, game]));
  const byName = new Map(existing.map((game) => [game.name.toLowerCase(), game]));

  const unique: CatalogGame[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    const slug = slugifyGame(row.name);
    const key = slug || row.name.toLowerCase();
    if (!slug || seen.has(key) || seen.has(row.name.toLowerCase())) continue;
    seen.add(key);
    seen.add(row.name.toLowerCase());
    unique.push(row);
  }

  console.log(`Catalog: ${rows.length} rows, ${unique.length} unique games`);
  const twitch = await fetchTwitchGamesByName(unique.map((row) => row.name));
  console.log(`Twitch covers: ${twitch.size}`);

  let created = 0;
  let updated = 0;
  let skipped = 0;

  for (const [index, row] of unique.entries()) {
    const slug = slugifyGame(row.name);
    const found = bySlug.get(slug) || byName.get(row.name.toLowerCase());
    let imageUrl = twitch.get(row.name.toLowerCase())?.imageUrl || found?.imageUrl || null;
    if (!imageUrl) {
      imageUrl = await steamImage(row.name);
      await sleep(120);
    }

    if (found) {
      let dirty = false;
      if (row.count > (found.popularity || 0)) {
        found.popularity = row.count;
        dirty = true;
      }
      if (!found.imageUrl && imageUrl) {
        found.imageUrl = imageUrl;
        dirty = true;
      }
      if (dirty) {
        await repo.save(found);
        updated += 1;
      } else {
        skipped += 1;
      }
      continue;
    }

    const game = repo.create({
      slug,
      name: row.name,
      imageUrl,
      popularity: row.count,
    });
    await repo.save(game);
    bySlug.set(slug, game);
    byName.set(row.name.toLowerCase(), game);
    created += 1;
    if ((index + 1) % 50 === 0) console.log(`Progress ${index + 1}/${unique.length}`);
  }

  console.log(`Done. created=${created} updated=${updated} skipped=${skipped}`);
  await AppDataSource.destroy();
}

run().catch(async (err) => {
  console.error(err);
  if (AppDataSource.isInitialized) await AppDataSource.destroy();
  process.exit(1);
});
