const Database = require('better-sqlite3');
const db = new Database('gym.db');

db.exec(`
  CREATE TABLE IF NOT EXISTS workouts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    exercise TEXT NOT NULL,
    sets INTEGER,
    reps INTEGER,
    weight REAL,
    date TEXT DEFAULT (datetime('now'))
  )
`);

module.exports = db;