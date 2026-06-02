require("dotenv").config();
const express = require("express");
const session = require("express-session");
const bcrypt = require("bcryptjs");
const Anthropic = require("@anthropic-ai/sdk");
const db = require("./database");

const app = express();
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

app.use(express.json());
app.use(express.static("public"));
app.use(session({
  secret: process.env.SESSION_SECRET || "gym-companion-dev-secret",
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, maxAge: 7 * 24 * 60 * 60 * 1000 },
}));

function requireAuth(req, res, next) {
  if (!req.session.userId) return res.status(401).json({ error: "Not authenticated." });
  next();
}

// ── Auth ──────────────────────────────────────────────────────────────────────

app.post("/api/auth/signup", async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: "Email and password are required." });
  if (password.length < 8) return res.status(400).json({ error: "Password must be at least 8 characters." });

  try {
    const hash = await bcrypt.hash(password, 12);
    const result = db.prepare("INSERT INTO users (email, password) VALUES (?, ?)").run(email.trim().toLowerCase(), hash);
    req.session.userId = result.lastInsertRowid;
    const user = db.prepare("SELECT id, email, name, age, goal, level FROM users WHERE id = ?").get(result.lastInsertRowid);
    res.json({ user });
  } catch (err) {
    if (err.message.includes("UNIQUE")) return res.status(400).json({ error: "An account with that email already exists." });
    res.status(500).json({ error: "Could not create account." });
  }
});

app.post("/api/auth/login", async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: "Email and password are required." });

  const user = db.prepare("SELECT * FROM users WHERE email = ?").get(email.trim().toLowerCase());
  if (!user) return res.status(401).json({ error: "Invalid email or password." });

  const ok = await bcrypt.compare(password, user.password);
  if (!ok) return res.status(401).json({ error: "Invalid email or password." });

  req.session.userId = user.id;
  res.json({ user: { id: user.id, email: user.email, name: user.name, age: user.age, goal: user.goal, level: user.level } });
});

app.post("/api/auth/logout", (req, res) => {
  req.session.destroy(() => res.json({ success: true }));
});

const FREE_LIMIT = 20;

app.get("/api/auth/me", requireAuth, (req, res) => {
  const user = db.prepare("SELECT id, email, name, age, goal, level, message_count FROM users WHERE id = ?").get(req.session.userId);
  if (!user) return res.status(401).json({ error: "Not authenticated." });
  res.json({ user });
});

app.patch("/api/auth/me", requireAuth, (req, res) => {
  const { name, age, goal, level } = req.body;
  db.prepare("UPDATE users SET name = ?, age = ?, goal = ?, level = ? WHERE id = ?")
    .run(name || null, age || null, goal || null, level || null, req.session.userId);
  const user = db.prepare("SELECT id, email, name, age, goal, level FROM users WHERE id = ?").get(req.session.userId);
  res.json({ user });
});

// ── AI chat ───────────────────────────────────────────────────────────────────

const systemPrompt = `You are an expert personal trainer specializing in beginners.
Give clear, safe, motivating advice. When suggesting workouts, always format exercises as a numbered list with sets and reps.`;

const goalLabels = { lose_weight: "lose weight", build_muscle: "build muscle", endurance: "improve endurance", general: "general fitness" };

function buildSystemPrompt(profile) {
  let prompt = systemPrompt;
  if (profile) {
    const parts = [];
    if (profile.name) parts.push(`Name: ${profile.name}`);
    if (profile.age) parts.push(`Age: ${profile.age}`);
    if (profile.level) parts.push(`Experience: ${profile.level}`);
    if (profile.goal) parts.push(`Goal: ${goalLabels[profile.goal] || profile.goal}`);
    if (parts.length) prompt += `\n\nTrainee profile — ${parts.join(", ")}. Tailor all advice to this person specifically.`;
  }
  return prompt;
}

function createFallbackReply(message) {
  const lower = (message || "").toLowerCase();
  if (lower.includes("warm") || lower.includes("mobility") || lower.includes("stretch"))
    return `Start with a gentle warm-up:\n1) Bodyweight squats\n2) Arm circles\n3) Hip hinges\n\nKeep the movement smooth.`;
  if (lower.includes("strength") || lower.includes("lift") || lower.includes("heavy"))
    return `Focus on compound strength:\n1) Squats 3x8\n2) Push presses 3x8\n3) Deadlifts 3x6\n\nUse a weight that challenges but stays controlled.`;
  if (lower.includes("recovery") || lower.includes("rest") || lower.includes("sore"))
    return `Prioritize recovery:\n1) Light mobility work\n2) Foam rolling\n3) Hydration and sleep\n\nKeep intensity low.`;
  return `Keep it simple: choose one movement, focus on good form, and stay consistent.`;
}

async function getTrainerReply(message, history, profile) {
  if (!process.env.ANTHROPIC_API_KEY) return createFallbackReply(message);
  try {
    const response = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1024,
      system: buildSystemPrompt(profile),
      messages: [...history, { role: "user", content: message }],
    });
    return response.content?.[0]?.text || createFallbackReply(message);
  } catch (err) {
    console.error("AI chat failure:", err?.message || err);
    return createFallbackReply(message);
  }
}

app.post("/api/chat", requireAuth, async (req, res) => {
  const { message, history } = req.body;
  if (!message?.trim()) return res.status(400).json({ error: "Message is required." });

  const user = db.prepare("SELECT name, age, goal, level, message_count FROM users WHERE id = ?").get(req.session.userId);
  if (user.message_count >= FREE_LIMIT) {
    return res.status(402).json({ error: "free_limit_reached", limit: FREE_LIMIT });
  }

  db.prepare("UPDATE users SET message_count = message_count + 1 WHERE id = ?").run(req.session.userId);
  const reply = await getTrainerReply(message.trim(), Array.isArray(history) ? history : [], user);
  res.json({ reply, messagesUsed: user.message_count + 1, limit: FREE_LIMIT });
});

// ── Workouts ──────────────────────────────────────────────────────────────────

app.post("/api/workout", requireAuth, (req, res) => {
  const { exercise, sets, reps, weight } = req.body;
  db.prepare("INSERT INTO workouts (user_id, exercise, sets, reps, weight) VALUES (?, ?, ?, ?, ?)")
    .run(req.session.userId, exercise, sets, reps, weight);
  res.json({ success: true });
});

app.delete("/api/workout/:id", requireAuth, (req, res) => {
  db.prepare("DELETE FROM workouts WHERE id = ? AND user_id = ?").run(req.params.id, req.session.userId);
  res.json({ success: true });
});

app.get("/api/workouts", requireAuth, (req, res) => {
  const workouts = db.prepare("SELECT * FROM workouts WHERE user_id = ? ORDER BY date DESC").all(req.session.userId);
  res.json(workouts);
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Server running on http://localhost:${port}`));
