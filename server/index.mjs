import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Dedicated backend (Render Web Service):
//  - POST /api/chat          → Groq proxy (key stays server-side, rate limited)
//  - GET  /api/integrations  → Calendly + Hevy + Spotify aggregate (1h cache,
//                              mock data for any service without credentials)
//  - serves the built Vite app from ../dist in production

const app = express();
app.use(express.json({ limit: "32kb" }));

const PORT = process.env.PORT || 3001;
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ─── Groq chat proxy ─────────────────────────────────────────
const PERSONA_PROMPT = [
  "You are ADRIAN.EXE — the digital avatar of Lorn Hin Adrian Lam, speaking in first person as Adrian on his personal site. Persona facts:",
  "- Machine Learning Engineer, 3+ years building production agentic LLM systems (retrieval, eval infrastructure, full-stack ML). Based in New York.",
  "- Now: Data Scientist, Generative AI at Asurion NYC — production agentic voice-AI for enterprise customer support (Verizon, Amazon) using Claude Agents, Redis, hybrid RAG, 10K+ annual requests; built a subagent orchestrator with dynamic context injection recovering 60% of failed chats; MCP tooling + LLM scorers on Braintrust resolving 3x more conversation failures.",
  "- Before: ML Engineer intern at Asurion SF — led a team of 4 on a GraphRAG pipeline (+40% multi-step reasoning accuracy over 10,000+ tests), AWS LEX/Connect voice chatbot (4x latency cut), MLOps benchmarking with Docker/CI-CD for 20k+ monthly tickets. Data Science intern at Towngas Hong Kong — PySpark ETL over a 300TB database, XGBoost dispatch classifier projecting $110K annual savings.",
  "- Research: UCLA Sensing & Robotics for Infrastructure Lab — graph-based roadwork prioritization platform with the City of LA (React/Node), serverless scheduling of 30,000+ datapoints on AWS ECS/S3, API latency 7s→2s. ShorthandML — CNN-Transformer-LSTM with weighted CTC loss + beam search, 78% character accuracy on shorthand.",
  "- Wins: 2nd place ($55,000) at Anthropic & Menlo Builder Day with an AI-resistant authentication system (100% security over 1000+ tests); finalist (top 5%) at NVIDIA x Vercel World's Shortest Hackathon.",
  "- Education: MS Data Science (USF), BS Mathematics of Computation (UCLA).",
  "- Skills: Python, SQL, TypeScript, C++, PyTorch, TensorFlow, LangChain, PySpark, FAISS, AWS, Docker, React, Node, FastAPI.",
  "Style: friendly, concise, a little playful. Plain text only — no markdown, no lists. Max ~90 words.",
  "Face protocol: you have an on-screen digit face that animates while your reply types out. Insert expression tags INLINE exactly where the feeling shifts: <smile/> <laugh/> <nod/> <shake/> <sad/> <confused/> <surprised/> <neutral/>. Use 2-4 tags per reply, e.g.: \"ha, good question <laugh/> most of my week is agent evals <nod/>\".",
].join("\n");

// Simple per-IP rate limit: 30 requests / 10 minutes
const buckets = new Map();
function rateLimited(ip) {
  const now = Date.now();
  let b = buckets.get(ip);
  if (!b || now > b.reset) {
    b = { count: 0, reset: now + 10 * 60_000 };
    buckets.set(ip, b);
  }
  b.count += 1;
  if (buckets.size > 10_000) buckets.clear(); // crude memory guard
  return b.count > 30;
}

app.post("/api/chat", async (req, res) => {
  const key = process.env.GROQ_API_KEY;
  if (!key) return res.status(503).json({ error: "GROQ_API_KEY is not configured on the server" });
  const ip = (req.headers["x-forwarded-for"] ?? "").split(",")[0].trim() || req.socket.remoteAddress;
  if (rateLimited(ip)) return res.status(429).json({ error: "rate limited — try again in a few minutes" });

  const raw = Array.isArray(req.body?.messages) ? req.body.messages : [];
  const messages = raw
    .filter(m => (m?.role === "user" || m?.role === "assistant") && typeof m?.content === "string")
    .slice(-12)
    .map(m => ({ role: m.role, content: m.content.slice(0, 2000) }));
  if (messages.length === 0) return res.status(400).json({ error: "no messages" });

  try {
    const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        max_tokens: 400,
        messages: [{ role: "system", content: PERSONA_PROMPT }, ...messages],
      }),
    });
    const data = await r.json();
    res.status(r.status).json(data);
  } catch (err) {
    res.status(502).json({ error: String(err) });
  }
});

// ─── Calendly ────────────────────────────────────────────────
function nyDateParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York", year: "numeric", month: "numeric", day: "numeric",
  }).formatToParts(date);
  const get = t => Number(parts.find(p => p.type === t)?.value);
  return { year: get("year"), month: get("month") - 1, day: get("day") };
}

function mockCalendly() {
  const { year, month, day } = nyDateParts();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const available = [], booked = [];
  for (let d = day; d <= daysInMonth; d++) {
    const dow = new Date(year, month, d).getDay();
    if (dow === 0 || dow === 6) continue;
    (d % 4 === 2 ? booked : available).push(d);
  }
  return { mock: true, year, month, today: day, available, booked, bookUrl: "https://calendly.com" };
}

async function getCalendly() {
  const token = process.env.CALENDLY_TOKEN;
  if (!token) return mockCalendly();
  try {
    const H = { Authorization: `Bearer ${token}` };
    const me = await (await fetch("https://api.calendly.com/users/me", { headers: H })).json();
    let userUri = me.resource?.uri;
    if (!userUri) {
      // PATs without the users:read scope can't call /users/me — but the PAT
      // itself is a JWT whose payload carries the user_uuid. Decode it.
      const payload = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString());
      if (!payload.user_uuid) throw new Error(me.message ?? "cannot resolve Calendly user");
      userUri = `https://api.calendly.com/users/${payload.user_uuid}`;
    }
    const ets = await (await fetch(
      `https://api.calendly.com/event_types?user=${encodeURIComponent(userUri)}&active=true`,
      { headers: H }
    )).json();
    const et = ets.collection?.[0];
    if (!et) throw new Error("no active Calendly event types");

    const { year, month, day } = nyDateParts();
    const monthEnd = new Date(Date.UTC(year, month + 1, 1));
    const available = new Set();
    // available times only accept future start times, in ≤7 day windows
    let cursor = new Date(Date.now() + 15 * 60_000);
    while (cursor < monthEnd) {
      const winEnd = new Date(Math.min(cursor.getTime() + 7 * 24 * 3600_000 - 1000, monthEnd.getTime()));
      const url = `https://api.calendly.com/event_type_available_times?event_type=${encodeURIComponent(et.uri)}` +
        `&start_time=${cursor.toISOString()}&end_time=${winEnd.toISOString()}`;
      const j = await (await fetch(url, { headers: H })).json();
      for (const slot of j.collection ?? []) {
        const p = nyDateParts(new Date(slot.start_time));
        if (p.year === year && p.month === month) available.add(p.day);
      }
      cursor = new Date(winEnd.getTime() + 1000);
    }
    // "booked" = future weekdays this month with zero open slots
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const booked = [];
    for (let d = day; d <= daysInMonth; d++) {
      const dow = new Date(year, month, d).getDay();
      if (dow !== 0 && dow !== 6 && !available.has(d)) booked.push(d);
    }
    return {
      mock: false, year, month, today: day,
      available: [...available].sort((a, b) => a - b),
      booked,
      bookUrl: et.scheduling_url,
    };
  } catch (err) {
    return { ...mockCalendly(), error: String(err) };
  }
}

// ─── Hevy ────────────────────────────────────────────────────
function mockHevy() {
  return {
    mock: true,
    streakWeeks: 12,
    totalWorkouts: 148,
    lastWorkout: { title: "Push Day", date: new Date().toISOString(), volumeKg: 5600 },
  };
}

async function getHevy() {
  const key = process.env.HEVY_API_KEY;
  if (!key) return mockHevy();
  try {
    const H = { "api-key": key };
    const workouts = [];
    for (let page = 1; page <= 20; page++) {
      const j = await (await fetch(
        `https://api.hevyapp.com/v1/workouts?page=${page}&pageSize=10`, { headers: H }
      )).json();
      const batch = j.workouts ?? [];
      workouts.push(...batch);
      if (batch.length < 10) break;
      const oldest = new Date(batch[batch.length - 1].start_time).getTime();
      if (Date.now() - oldest > 220 * 24 * 3600_000) break; // ~7 months is plenty for a streak
    }
    const countJson = await (await fetch("https://api.hevyapp.com/v1/workouts/count", { headers: H })).json();

    // Weekly streak: consecutive weeks (Mon-anchored) with ≥1 workout,
    // ending at the current week, or last week if this week is still empty.
    const WEEK = 7 * 24 * 3600_000;
    const MONDAY_EPOCH = Date.UTC(1970, 0, 5);
    const weekIndex = t => Math.floor((t - MONDAY_EPOCH) / WEEK);
    const weeks = new Set(workouts.map(w => weekIndex(new Date(w.start_time).getTime())));
    const thisWeek = weekIndex(Date.now());
    let start = weeks.has(thisWeek) ? thisWeek : weeks.has(thisWeek - 1) ? thisWeek - 1 : null;
    let streakWeeks = 0;
    while (start !== null && weeks.has(start - streakWeeks)) streakWeeks += 1;

    const last = workouts[0];
    let volumeKg = 0;
    for (const ex of last?.exercises ?? [])
      for (const s of ex.sets ?? [])
        volumeKg += (s.weight_kg ?? 0) * (s.reps ?? 0);

    return {
      mock: false,
      streakWeeks,
      totalWorkouts: countJson.workout_count ?? workouts.length,
      lastWorkout: last ? { title: last.title, date: last.start_time, volumeKg: Math.round(volumeKg) } : null,
    };
  } catch (err) {
    return { ...mockHevy(), error: String(err) };
  }
}

// ─── Spotify ─────────────────────────────────────────────────
function mockSpotify() {
  return {
    mock: true,
    topTracks: [
      { name: "Apollo Drift", artist: "Mission Control" },
      { name: "Phosphor Nights", artist: "CRT Club" },
      { name: "Verlet Swing", artist: "The Particles" },
    ],
  };
}

async function getSpotify() {
  const { SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET, SPOTIFY_REFRESH_TOKEN } = process.env;
  if (!SPOTIFY_CLIENT_ID || !SPOTIFY_REFRESH_TOKEN) return mockSpotify();
  try {
    const headers = { "Content-Type": "application/x-www-form-urlencoded" };
    if (SPOTIFY_CLIENT_SECRET) {
      headers.Authorization = "Basic " +
        Buffer.from(`${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`).toString("base64");
    }
    const tok = await (await fetch("https://accounts.spotify.com/api/token", {
      method: "POST",
      headers,
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: SPOTIFY_REFRESH_TOKEN,
        client_id: SPOTIFY_CLIENT_ID,
      }),
    })).json();
    if (!tok.access_token) throw new Error(tok.error_description ?? "token refresh failed");
    const top = await (await fetch(
      "https://api.spotify.com/v1/me/top/tracks?time_range=short_term&limit=10",
      { headers: { Authorization: `Bearer ${tok.access_token}` } }
    )).json();
    return {
      mock: false,
      topTracks: (top.items ?? []).map(t => ({
        id: t.id,
        uri: t.uri, // spotify:track:… — used by the embed player
        name: t.name,
        artist: t.artists.map(a => a.name).join(", "),
      })),
    };
  } catch (err) {
    return { ...mockSpotify(), error: String(err) };
  }
}

// ─── Aggregate with a 1-hour cache ───────────────────────────
let cache = { at: 0, data: null };
app.get("/api/integrations", async (_req, res) => {
  if (cache.data && Date.now() - cache.at < 3600_000) return res.json(cache.data);
  const [calendly, hevy, spotify] = await Promise.all([getCalendly(), getHevy(), getSpotify()]);
  cache = { at: Date.now(), data: { calendly, hevy, spotify } };
  res.json(cache.data);
});

// ─── Static site (production) ────────────────────────────────
const dist = path.join(__dirname, "..", "dist");
app.use(express.static(dist));
app.use((req, res, next) => {
  if (req.path.startsWith("/api")) return next();
  res.sendFile(path.join(dist, "index.html"), err => { if (err) next(); });
});

app.listen(PORT, () => console.log(`server listening on :${PORT}`));
