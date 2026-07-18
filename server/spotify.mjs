// Shared Spotify fetch — used by the live server path (server/index.mjs) and
// by the snapshot script the GitHub Action runs (scripts/fetch-spotify.mjs).
// Only Node built-ins (global fetch + Buffer), so the Action needs no install.

export async function fetchSpotifyTopTracks(env) {
  const { SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET, SPOTIFY_REFRESH_TOKEN } = env;
  if (!SPOTIFY_CLIENT_ID || !SPOTIFY_REFRESH_TOKEN) {
    throw new Error("missing SPOTIFY_CLIENT_ID or SPOTIFY_REFRESH_TOKEN");
  }
  const headers = { "Content-Type": "application/x-www-form-urlencoded" };
  if (SPOTIFY_CLIENT_SECRET) {
    headers.Authorization = "Basic " +
      Buffer.from(`${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`).toString("base64");
  }
  // Fail fast when Spotify silently drops the connection (Render → ETIMEDOUT),
  // so the caller can fall back to the snapshot instead of hanging.
  const timeout = () => AbortSignal.timeout(8000);
  const tok = await (await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers,
    signal: timeout(),
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: SPOTIFY_REFRESH_TOKEN,
      client_id: SPOTIFY_CLIENT_ID,
    }),
  })).json();
  if (!tok.access_token) throw new Error(tok.error_description ?? "token refresh failed");
  const top = await (await fetch(
    "https://api.spotify.com/v1/me/top/tracks?time_range=short_term&limit=10",
    { headers: { Authorization: `Bearer ${tok.access_token}` }, signal: timeout() }
  )).json();
  return (top.items ?? []).map(t => ({
    id: t.id,
    uri: t.uri, // spotify:track:… — used by the embed player
    name: t.name,
    artist: t.artists.map(a => a.name).join(", "),
  }));
}
