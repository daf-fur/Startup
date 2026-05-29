require('dotenv').config();
const express = require('express');
const Anthropic = require('@anthropic-ai/sdk');
const db = require('./database');

const app = express();
const client = new Anthropic();

app.use(express.json());
app.use(express.static('public'));

// AI chat endpoint
app.post('/api/chat', async (req, res) => {
  const { message } = req.body;

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    system: `You are an expert personal trainer specializing in beginners. 
             Give clear, safe, motivating advice. When suggesting workouts, 
             always format exercises as a numbered list with sets and reps.`,
    messages: [{ role: 'user', content: message }]
  });

  res.json({ reply: response.content[0].text });
});

// Log a workout
app.post('/api/workout', (req, res) => {
  const { exercise, sets, reps, weight } = req.body;
  const stmt = db.prepare('INSERT INTO workouts (exercise, sets, reps, weight) VALUES (?, ?, ?, ?)');
  stmt.run(exercise, sets, reps, weight);
  res.json({ success: true });
});

// Get all workouts
app.get('/api/workouts', (req, res) => {
  const workouts = db.prepare('SELECT * FROM workouts ORDER BY date DESC').all();
  res.json(workouts);
});

app.listen(process.env.PORT, () => {
  console.log(`Server running on http://localhost:${process.env.PORT}`);
});