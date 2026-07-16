// One-time Spotify authorization helper.
//
// Usage:
//   1. In your Spotify app settings (developer.spotify.com), add this exact
//      redirect URI:  http://127.0.0.1:8888/callback
//   2. Put SPOTIFY_CLIENT_ID (and ideally SPOTIFY_CLIENT_SECRET) in .env
//      — with the secret set, Spotify issues a non-rotating refresh token,
//      which is what you want for a long-lived server.
//   3. Run:  node --env-file=.env scripts/spotify-auth.mjs
//   4. Approve in the browser, then paste the printed
//      SPOTIFY_REFRESH_TOKEN=... line into .env.

import http from "node:http";
import crypto from "node:crypto";
import { exec } from "node:child_process";

const CLIENT_ID = process.env.SPOTIFY_CLIENT_ID;
const CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET;
const PORT = 8888;
const REDIRECT_URI = `http://127.0.0.1:${PORT}/callback`;
const SCOPE = "user-top-read";

if (!CLIENT_ID) {
  console.error("✗ SPOTIFY_CLIENT_ID is not set — add it to .env first.");
  process.exit(1);
}
if (!CLIENT_SECRET) {
  console.warn("⚠ SPOTIFY_CLIENT_SECRET not set — falling back to PKCE-only.");
  console.warn("  Note: refresh tokens from secret-less apps ROTATE on every use;");
  console.warn("  for a set-and-forget server token, add the client secret and rerun.");
}

const b64url = (buf) => buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const verifier = b64url(crypto.randomBytes(48));
const challenge = b64url(crypto.createHash("sha256").update(verifier).digest());
const state = b64url(crypto.randomBytes(16));

const authUrl = "https://accounts.spotify.com/authorize?" + new URLSearchParams({
  client_id: CLIENT_ID,
  response_type: "code",
  redirect_uri: REDIRECT_URI,
  scope: SCOPE,
  state,
  code_challenge_method: "S256",
  code_challenge: challenge,
});

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
  if (url.pathname !== "/callback") { res.writeHead(404).end(); return; }

  const err = url.searchParams.get("error");
  const code = url.searchParams.get("code");
  const gotState = url.searchParams.get("state");
  if (err || !code || gotState !== state) {
    res.writeHead(400, { "Content-Type": "text/html" });
    res.end("<h3>Authorization failed — check the terminal.</h3>");
    console.error("✗ Authorization failed:", err ?? "missing code / state mismatch");
    server.close();
    return;
  }

  try {
    const headers = { "Content-Type": "application/x-www-form-urlencoded" };
    if (CLIENT_SECRET) {
      headers.Authorization = "Basic " + Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString("base64");
    }
    const tok = await (await fetch("https://accounts.spotify.com/api/token", {
      method: "POST",
      headers,
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: REDIRECT_URI,
        client_id: CLIENT_ID,
        code_verifier: verifier,
      }),
    })).json();

    if (!tok.refresh_token) throw new Error(JSON.stringify(tok));

    // Sanity check: pull one top track with the fresh access token
    let sample = "";
    try {
      const top = await (await fetch(
        "https://api.spotify.com/v1/me/top/tracks?time_range=short_term&limit=1",
        { headers: { Authorization: `Bearer ${tok.access_token}` } }
      )).json();
      const t = top.items?.[0];
      if (t) sample = `${t.name} — ${t.artists.map(a => a.name).join(", ")}`;
    } catch { /* non-fatal */ }

    res.writeHead(200, { "Content-Type": "text/html" });
    res.end("<h3>✓ Authorized — you can close this tab. The token is in your terminal.</h3>");

    console.log("\n✓ Success! Add this line to .env:\n");
    console.log(`SPOTIFY_REFRESH_TOKEN=${tok.refresh_token}\n`);
    if (sample) console.log(`  (verified — your current #1 track: ${sample})\n`);
  } catch (e) {
    res.writeHead(500, { "Content-Type": "text/html" });
    res.end("<h3>Token exchange failed — check the terminal.</h3>");
    console.error("✗ Token exchange failed:", String(e));
  }
  server.close();
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`Listening on ${REDIRECT_URI}`);
  console.log("Opening Spotify consent page…\n" + authUrl + "\n");
  const opener = process.platform === "darwin" ? "open" : process.platform === "win32" ? "start" : "xdg-open";
  exec(`${opener} "${authUrl}"`);
});
