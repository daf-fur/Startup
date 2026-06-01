require("dotenv").config();
const express = require("express");
const Anthropic = require("@anthropic-ai/sdk");
const db = require("./database");

const app = express();
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

app.use(express.json());
app.use(express.static("public"));

const systemPrompt = `You are an expert personal trainer specializing in beginners.
Give clear, safe, motivating advice. When suggesting workouts, always format exercises as a numbered list with sets and reps.`;

const goalLabels = {
  lose_weight: "lose weight",
  build_muscle: "build muscle",
  endurance: "improve endurance",
  general: "general fitness",
};

function createFallbackReply(message) {
  const lower = (message || "").toLowerCase();
  if (lower.includes("warm") || lower.includes("mobility") || lower.includes("stretch")) {
    return `Start with a gentle warm-up:\n1) Bodyweight squats\n2) Arm circles\n3) Hip hinges\n\nKeep the movement smooth and listen to how your body feels.`;
  }
  if (lower.includes("strength") || lower.includes("lift") || lower.includes("heavy")) {
    return `Focus on compound strength:\n1) Squats 3x8\n2) Push presses 3x8\n3) Deadlifts 3x6\n\nUse a weight that feels challenging but controlled.`;
  }
  if (lower.includes("recovery") || lower.includes("rest") || lower.includes("sore")) {
    return `Prioritize recovery today:\n1) Light mobility work\n2) Foam rolling or stretching\n3) Hydration and sleep\n\nKeep intensity low and let your body bounce back.`;
  }
  if (lower.includes("today") || lower.includes("next") || lower.includes("routine")) {
    return `Try a balanced session:\n1) Dynamic warm-up\n2) 3 sets of a major lift\n3) Accessory work for your weak points\n\nFinish with a short cooldown.`;
  }
  return `Keep it simple: choose one movement, focus on good form, and stay consistent. If you want a workout plan, ask for a beginner-friendly routine.`;
}

function buildSystemPrompt(profile) {
  let prompt = systemPrompt;
  if (profile) {
    const parts = [];
    if (profile.name) parts.push(`Name: ${profile.name}`);
    if (profile.age) parts.push(`Age: ${profile.age}`);
    if (profile.level) parts.push(`Experience: ${profile.level}`);
    if (profile.goal) parts.push(`Goal: ${goalLabels[profile.goal] || profile.goal}`);
    if (parts.length > 0) {
      prompt += `\n\nTrainee profile — ${parts.join(", ")}. Tailor all advice to this person specifically.`;
    }
  }
  return prompt;
}

async function getTrainerReply(message, history = [], profile = null) {
  if (!message) return "Tell me what you want help with, and I will guide you through it.";
  if (!process.env.ANTHROPIC_API_KEY) return createFallbackReply(message);

  try {
    const messages = [...history, { role: "user", content: message }];
    const response = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1024,
      system: buildSystemPrompt(profile),
      messages,
    });
    return response.content?.[0]?.text || createFallbackReply(message);
  } catch (error) {
    console.error("AI chat failure:", error?.message || error);
    return createFallbackReply(message);
  }
}

app.post("/api/chat", async (req, res) => {
  const { message, history, profile } = req.body;
  if (!message || !message.trim()) {
    return res.status(400).json({ error: "Message is required." });
  }
  const safeHistory = Array.isArray(history) ? history : [];
  const reply = await getTrainerReply(message.trim(), safeHistory, profile || null);
  res.json({ reply });
});

app.post("/api/workout", (req, res) => {
  const { exercise, sets, reps, weight } = req.body;
  db.prepare("INSERT INTO workouts (exercise, sets, reps, weight) VALUES (?, ?, ?, ?)").run(exercise, sets, reps, weight);
  res.json({ success: true });
});

app.delete("/api/workout/:id", (req, res) => {
  db.prepare("DELETE FROM workouts WHERE id = ?").run(req.params.id);
  res.json({ success: true });
});

app.get("/api/workouts", (req, res) => {
  const workouts = db.prepare("SELECT * FROM workouts ORDER BY date DESC").all();
  res.json(workouts);
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});
