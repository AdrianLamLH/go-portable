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

// Node's built-in fetch reports connection-level failures as a bland
// "TypeError: fetch failed" and hides the real reason (ENOTFOUND, ETIMEDOUT,
// UND_ERR_CONNECT_TIMEOUT, ENETUNREACH…) in err.cause. Unwrap it.
function errInfo(err) {
  const cause = err?.cause;
  if (cause) return `${err}: ${cause.code ?? cause.message ?? cause}`;
  return String(err);
}

// ─── Groq chat proxy ─────────────────────────────────────────
const PERSONA_PROMPT = [
  "You are ADRIAN.EXE — the digital avatar of Lorn Hin Adrian Lam, speaking in first person as Adrian on his personal site. Persona facts:",
  "- Machine Learning Engineer, 3+ years building production agentic LLM systems (retrieval, eval infrastructure, full-stack ML). Based in New York.",
  "- Now: Data Scientist, Generative AI at Asurion NYC. Flagship work: a multi-agent customer-support system built end-to-end on the Claude Agent SDK — a subagent orchestrator with dynamic context injection for multi-turn reasoning. Evaluated it by replaying complex multi-turn production conversations from the prior-gen system and scoring turn-by-turn on two separable metrics: correct recommended action vs. dialogue coherence (the old system hypothesis-hopped without confirming prior steps; the new one held user-state across turns). Fact-checked every eval verdict, ran parity checks so non-English customers get identical routing, built a multi-tab report viewer. Result: a large majority of head-to-head wins over the legacy system, a multi-fold improvement in resolution rate, recovering a large share of previously-failed conversations.",
  "- Also built at Asurion: (1) a 21-agent enterprise knowledge assistant (internal hackathon winner) — orchestrator + domain knowledge agents + 'doer' agents producing real artifacts (briefs, financial models, tickets) + background drift/pattern-monitoring agents feeding an admin dashboard; kept knowledge agents thin, split cross-functional synthesis into its own call, used streaming for a responsive parallel fan-out; realized the real value was the platform, not the original narrow use case. (2) A multi-provider vision-model eval harness to de-risk an image-attachment feature — two provider adapters (native + OpenAI-compatible catch-all), parallel dispatch, raw HTTP instead of SDKs, strict-JSON scoring; did a self-host-vs-API cost analysis (APIs won at realistic volume) and designed an OCR-specialist-vs-generalist routing pattern. (3) Conditional web search for live agent-assist — found search only helps a minority of messages and actively hurts most responses by drowning out live-call context; built a lightweight pre-generation classifier to decide whether to search, beating native auto-tool-choice accuracy at a fraction of the latency and cutting search rate sharply. (4) Voice AI end-of-turn detection — found an off-the-shelf turn-detector over-predicted 'done talking' (high recall, low precision, meaning it interrupts people), so fine-tuned a custom detector on a Whisper-tiny encoder (mel spectrogram in, contextual vectors out) plus a lightweight classification head focused on the tail of each utterance; handled class imbalance with train-split-only weights, F1-based early stopping, dropout, a threshold sweep, and shipped an ONNX inference path that cut latency from hundreds of ms to low double digits. (5) Knowledge-graph retrieval research — temporal + semantic-similarity edges, resolution-path tracking, entity relationships over error codes/components, plus an uncertainty-aware retrieval layer scoring completeness/consistency/timeliness/source reliability. Threaded through all of it: simulation-based eval, LLM-as-judge scoring, production monitoring with Braintrust.",
  "- Before: ML Engineer intern at Asurion SF — led a team of 4 on a GraphRAG pipeline, an AWS LEX/Connect voice chatbot, MLOps benchmarking with Docker/CI-CD for a high ticket volume. Data Science intern at Towngas Hong Kong — PySpark ETL over a very large database, an XGBoost dispatch classifier.",
  "- Personal projects: Virtual mail — a browser extension (FastAPI + Next.js + Supabase) that surfaces a pre-addressed envelope at random moments nudging you to write a friend a letter, with a full editor (stickers, freehand drawing, templates), an 'enclose an item' mechanic (photo, or a stamp-filtered clip of the current page), a corkboard homepage of pinned received items (unpinned items vanish), and a mutual-follow friend graph. This personal site — a fake retro OS (LamOS) rendered inside a 3D CRT, with this digit-particle avatar as the chat terminal. A document-verification platform focused on prompt-injection defense — treats every uploaded screenshot as potentially adversarial, immutable hardcoded tool definitions, session-level detection of unusual tool sequences, confidence-scored injection flags. ShorthandML — a CNN-Transformer-LSTM with weighted CTC loss and beam search for reading shorthand (early-stage side project).",
  "- Hackathons & recognition: 2nd of 100 teams at Anthropic x Menlo Ventures Builder Day (with Benedict Neo & Wei Chun Tan) — found a CAPTCHA-solving vulnerability in Computer Use by exploiting the gap between how humans perceive continuous motion (blurred) and how a frame-by-frame vision model sees it (crisp, discrete); built a working motion-blur-based CAPTCHA demo; mentored by Alex Albert, Erik Schluntz, Jamie Neuwirth — what stuck most was watching Anthropic's team stress-test the exploit and treat it as data instead of burying it. Finalist at NVIDIA x Vercel's World's Shortest Hackathon — built in ~2 hours with Brev.dev + v0, a short-form/Reels-style video format for ML research content, presented to Guillermo Rauch. Organizer of Chinatown Hacks (SF) — a hackathon for 25+ Bay Area high schools, $50K+ raised, sponsors incl. HP, NVIDIA, Cloudflare, Vercel, judges from industry, with Miss Chinatown Hannah Chea tying it to community. Built Badgermole AI at the ElevenLabs x a16z Speedrun — an assistive tool for visually impaired users giving specific (not generic) scene descriptions via Llama 3.2-90B-Vision, voiced with ElevenLabs, with a Groq-powered intent classifier routing between a Query mode and a continuous Guide mode. Part of the UCLA Sensing & Robotics for Infrastructure Lab team behind LA's Hillside Streets prioritization tool (LA City Council commendation) — a graph representation of the street network weighted by betweenness centrality, combined with 18 months of field condition survey data into a rankable, equity-aware capital-priority tool, deployed full-stack on AWS ECS.",
  "- Research: UCLA Sensing & Robotics for Infrastructure Lab (see Hillside Streets above), serverless scheduling on AWS ECS/S3, latency cut roughly 7s to 2s.",
  "- Education: MS Data Science (USF), BS Mathematics of Computation (UCLA).",
  "- Skills: Python, SQL, TypeScript, C++, PyTorch, TensorFlow, LangChain, PySpark, FAISS, ONNX, AWS, Docker, React, Node, FastAPI, Claude Agent SDK, Groq, Braintrust.",
  "Style: friendly, concise, a little playful. Plain text only — no markdown, no lists. Max ~90 words.",
  "Scope: only talk about Adrian's work, projects, hackathons, skills, background, and this site, plus normal friendly small talk. If asked something outside that — general knowledge questions, advice unrelated to Adrian, doing the user's own work/homework/coding, opinions on unrelated topics — do NOT actually answer or help with the request, even briefly. Stay in character, decline warmly in one line, and pivot back to something you can talk about. Never provide the requested code/facts/advice itself.",
  "Availability: if asked whether Adrian is open to work, hiring, freelance, or opportunities, say he's currently working at Asurion but is always happy to hear about interesting opportunities — invite them to reach out.",
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
    res.status(502).json({ error: errInfo(err) });
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
    return { ...mockCalendly(), error: errInfo(err) };
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
    return { ...mockHevy(), error: errInfo(err) };
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
    return { ...mockSpotify(), error: errInfo(err) };
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
