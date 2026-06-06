require("dotenv").config();
const crypto = require("crypto");
const express = require("express");
const session = require("express-session");
const bcrypt = require("bcryptjs");
const Stripe = require("stripe");
const Anthropic = require("@anthropic-ai/sdk");
const nodemailer = require("nodemailer");
const db = require("./database");

const app = express();
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const FREE_LIMIT = 5;

// ── Email ─────────────────────────────────────────────────────────────────────

function getMailer() {
  if (!process.env.EMAIL_HOST) return null;
  return nodemailer.createTransport({
    host: process.env.EMAIL_HOST,
    port: parseInt(process.env.EMAIL_PORT || "587"),
    secure: process.env.EMAIL_PORT === "465",
    auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
  });
}

async function sendResetEmail(email, token, baseUrl) {
  const url = `${baseUrl}/?reset=${token}`;
  const mailer = getMailer();
  if (!mailer) {
    console.log(`\n[DEV] Password reset link for ${email}:\n${url}\n`);
    return;
  }
  await mailer.sendMail({
    from: process.env.EMAIL_FROM || process.env.EMAIL_USER,
    to: email,
    subject: "Reset your Gym Companion password",
    text: `Reset your password (expires in 1 hour):\n\n${url}\n\nIf you didn't request this, ignore this email.`,
    html: `<p>Click to reset your password (expires in 1 hour):</p><p><a href="${url}">${url}</a></p><p>If you didn't request this, ignore this email.</p>`,
  });
}

// ── Stripe webhook — must be before express.json() ───────────────────────────

function getStripe() {
  if (!process.env.STRIPE_SECRET_KEY) throw new Error("STRIPE_SECRET_KEY is not set.");
  return Stripe(process.env.STRIPE_SECRET_KEY);
}

app.post("/api/billing/webhook", express.raw({ type: "application/json" }), (req, res) => {
  const sig = req.headers["stripe-signature"];
  if (!process.env.STRIPE_WEBHOOK_SECRET) return res.status(400).json({ error: "Webhook secret not configured." });
  let event;
  try {
    event = getStripe().webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    return res.status(400).json({ error: `Webhook error: ${err.message}` });
  }
  if (event.type === "checkout.session.completed") {
    const s = event.data.object;
    if (s.metadata?.userId) {
      db.prepare("UPDATE users SET is_subscribed = 1, stripe_subscription_id = ? WHERE id = ?")
        .run(s.subscription, s.metadata.userId);
    }
  }
  if (event.type === "customer.subscription.updated") {
    const sub = event.data.object;
    db.prepare("UPDATE users SET is_subscribed = ? WHERE stripe_subscription_id = ?")
      .run(["active", "trialing"].includes(sub.status) ? 1 : 0, sub.id);
  }
  if (event.type === "customer.subscription.deleted") {
    db.prepare("UPDATE users SET is_subscribed = 0 WHERE stripe_subscription_id = ?").run(event.data.object.id);
  }
  res.json({ received: true });
});

// ── Global middleware ─────────────────────────────────────────────────────────

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

function userFields(id) {
  return db.prepare("SELECT id, email, name, age, height, goal, level, message_count, is_subscribed, current_streak, longest_streak FROM users WHERE id = ?").get(id);
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
    res.json({ user: userFields(result.lastInsertRowid) });
  } catch (err) {
    if (err.message.includes("UNIQUE")) return res.status(400).json({ error: "An account with that email already exists." });
    res.status(500).json({ error: "Could not create account." });
  }
});

app.post("/api/auth/login", async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: "Email and password are required." });
  const row = db.prepare("SELECT * FROM users WHERE email = ?").get(email.trim().toLowerCase());
  if (!row || !(await bcrypt.compare(password, row.password)))
    return res.status(401).json({ error: "Invalid email or password." });
  req.session.userId = row.id;
  res.json({ user: userFields(row.id) });
});

app.post("/api/auth/logout", (req, res) => {
  req.session.destroy(() => res.json({ success: true }));
});

app.get("/api/auth/me", requireAuth, (req, res) => {
  const user = userFields(req.session.userId);
  if (!user) return res.status(401).json({ error: "Not authenticated." });
  res.json({ user });
});

app.patch("/api/auth/me", requireAuth, (req, res) => {
  const { name, age, height, goal, level } = req.body;
  db.prepare("UPDATE users SET name = ?, age = ?, height = ?, goal = ?, level = ? WHERE id = ?")
    .run(name || null, age || null, height || null, goal || null, level || null, req.session.userId);
  res.json({ user: userFields(req.session.userId) });
});

app.post("/api/auth/forgot-password", async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: "Email is required." });
  const user = db.prepare("SELECT id FROM users WHERE email = ?").get(email.trim().toLowerCase());
  if (user) {
    const token = crypto.randomBytes(32).toString("hex");
    const expires = new Date(Date.now() + 3600000).toISOString();
    db.prepare("UPDATE users SET password_reset_token = ?, password_reset_expires = ? WHERE id = ?")
      .run(token, expires, user.id);
    await sendResetEmail(email.trim().toLowerCase(), token, `${req.protocol}://${req.get("host")}`);
  }
  res.json({ success: true }); // always succeed to prevent email enumeration
});

app.post("/api/auth/reset-password", async (req, res) => {
  const { token, password } = req.body;
  if (!token || !password) return res.status(400).json({ error: "Token and password are required." });
  if (password.length < 8) return res.status(400).json({ error: "Password must be at least 8 characters." });
  const user = db.prepare("SELECT * FROM users WHERE password_reset_token = ?").get(token);
  if (!user?.password_reset_expires) return res.status(400).json({ error: "Invalid or expired reset link." });
  if (new Date(user.password_reset_expires) < new Date())
    return res.status(400).json({ error: "This reset link has expired. Please request a new one." });
  const hash = await bcrypt.hash(password, 12);
  db.prepare("UPDATE users SET password = ?, password_reset_token = NULL, password_reset_expires = NULL WHERE id = ?")
    .run(hash, user.id);
  req.session.userId = user.id;
  res.json({ user: userFields(user.id) });
});

// ── Billing ───────────────────────────────────────────────────────────────────

app.post("/api/billing/checkout", requireAuth, async (req, res) => {
  if (!process.env.STRIPE_SECRET_KEY || !process.env.STRIPE_PRICE_ID)
    return res.status(503).json({ error: "Billing is not configured yet." });
  const user = db.prepare("SELECT email, stripe_customer_id FROM users WHERE id = ?").get(req.session.userId);
  const stripe = getStripe();
  let customerId = user.stripe_customer_id;
  if (!customerId) {
    const customer = await stripe.customers.create({ email: user.email });
    customerId = customer.id;
    db.prepare("UPDATE users SET stripe_customer_id = ? WHERE id = ?").run(customerId, req.session.userId);
  }
  const base = `${req.protocol}://${req.get("host")}`;
  const checkout = await stripe.checkout.sessions.create({
    customer: customerId,
    payment_method_types: ["card"],
    line_items: [{ price: process.env.STRIPE_PRICE_ID, quantity: 1 }],
    mode: "subscription",
    success_url: `${base}/?checkout=success`,
    cancel_url: `${base}/?checkout=cancelled`,
    metadata: { userId: String(req.session.userId) },
  });
  res.json({ url: checkout.url });
});

app.post("/api/billing/portal", requireAuth, async (req, res) => {
  if (!process.env.STRIPE_SECRET_KEY) return res.status(503).json({ error: "Billing is not configured yet." });
  const user = db.prepare("SELECT stripe_customer_id FROM users WHERE id = ?").get(req.session.userId);
  if (!user?.stripe_customer_id) return res.status(400).json({ error: "No billing account found." });
  const portal = await getStripe().billingPortal.sessions.create({
    customer: user.stripe_customer_id,
    return_url: `${req.protocol}://${req.get("host")}/`,
  });
  res.json({ url: portal.url });
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
    if (profile.height) parts.push(`Height: ${profile.height} in`);
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
  const user = db.prepare("SELECT name, age, height, goal, level, message_count, is_subscribed FROM users WHERE id = ?").get(req.session.userId);
  if (!user.is_subscribed && user.message_count >= FREE_LIMIT)
    return res.status(402).json({ error: "free_limit_reached", limit: FREE_LIMIT });
  if (!user.is_subscribed)
    db.prepare("UPDATE users SET message_count = message_count + 1 WHERE id = ?").run(req.session.userId);
  const reply = await getTrainerReply(message.trim(), Array.isArray(history) ? history : [], user);
  res.json({ reply, messagesUsed: user.is_subscribed ? null : user.message_count + 1, limit: FREE_LIMIT });
});

// ── Workouts ──────────────────────────────────────────────────────────────────

function updateStreak(userId) {
  const user = db.prepare("SELECT current_streak, longest_streak, last_workout_date FROM users WHERE id = ?").get(userId);
  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  let streak = user.current_streak || 0;
  if (user.last_workout_date === today) {
    // already logged today
  } else if (user.last_workout_date === yesterday) {
    streak += 1;
  } else {
    streak = 1;
  }
  const longest = Math.max(streak, user.longest_streak || 0);
  db.prepare("UPDATE users SET current_streak = ?, longest_streak = ?, last_workout_date = ? WHERE id = ?")
    .run(streak, longest, today, userId);
  return { current: streak, longest };
}

function checkPR(userId, exercise, weight) {
  if (!weight || parseFloat(weight) <= 0) return false;
  const prev = db.prepare("SELECT MAX(CAST(weight AS REAL)) as max FROM workouts WHERE user_id = ? AND exercise = ?").get(userId, exercise);
  return !prev.max || parseFloat(weight) > parseFloat(prev.max);
}

app.post("/api/workout", requireAuth, (req, res) => {
  const { exercise, sets, reps, weight, notes } = req.body;
  const isPR = checkPR(req.session.userId, exercise, weight);
  db.prepare("INSERT INTO workouts (user_id, exercise, sets, reps, weight, notes) VALUES (?, ?, ?, ?, ?, ?)")
    .run(req.session.userId, exercise, sets, reps, weight, notes || null);
  const streak = updateStreak(req.session.userId);
  res.json({ success: true, isPR, streak });
});

app.delete("/api/workout/:id", requireAuth, (req, res) => {
  db.prepare("DELETE FROM workouts WHERE id = ? AND user_id = ?").run(req.params.id, req.session.userId);
  res.json({ success: true });
});

app.get("/api/workouts", requireAuth, (req, res) => {
  res.json(db.prepare("SELECT * FROM workouts WHERE user_id = ? ORDER BY date DESC").all(req.session.userId));
});

// ── Body weight ───────────────────────────────────────────────────────────────

app.post("/api/body-weight", requireAuth, (req, res) => {
  const { weight } = req.body;
  if (!weight) return res.status(400).json({ error: "Weight is required." });
  db.prepare("INSERT INTO body_weight (user_id, weight) VALUES (?, ?)").run(req.session.userId, weight);
  res.json({ success: true });
});

app.get("/api/body-weights", requireAuth, (req, res) => {
  res.json(db.prepare("SELECT * FROM body_weight WHERE user_id = ? ORDER BY date DESC").all(req.session.userId));
});

app.delete("/api/body-weight/:id", requireAuth, (req, res) => {
  db.prepare("DELETE FROM body_weight WHERE id = ? AND user_id = ?").run(req.params.id, req.session.userId);
  res.json({ success: true });
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Server running on http://localhost:${port}`));
