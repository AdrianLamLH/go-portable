// Writes public/spotify-tracks.json from your current Spotify top tracks.
// Run locally:  node --env-file=.env scripts/fetch-spotify.mjs
// In CI: the GitHub Action supplies the SPOTIFY_* vars from repo secrets.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { fetchSpotifyTopTracks } from "../server/spotify.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, "..", "public", "spotify-tracks.json");

const topTracks = await fetchSpotifyTopTracks(process.env);
if (topTracks.length === 0) {
  console.error("Spotify returned no tracks — leaving the existing snapshot untouched.");
  process.exit(1);
}

// Skip the write when only the timestamp would change — otherwise every run
// produces a diff (updatedAt) and the CI commit-if-changed guard would commit
// daily, redeploying Render for no real change.
let prevTracks = null;
try {
  prevTracks = JSON.parse(fs.readFileSync(OUT, "utf8")).topTracks ?? null;
} catch { /* no snapshot yet */ }
if (prevTracks && JSON.stringify(prevTracks) === JSON.stringify(topTracks)) {
  console.log(`Top tracks unchanged (${topTracks.length}) — leaving the snapshot as is.`);
  process.exit(0);
}

const payload = { updatedAt: new Date().toISOString(), topTracks };
fs.writeFileSync(OUT, JSON.stringify(payload, null, 2) + "\n");
console.log(`Wrote ${topTracks.length} tracks to ${path.relative(process.cwd(), OUT)}`);
