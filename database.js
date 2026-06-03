const Database = require("better-sqlite3");
const db = new Database("gym.db");

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL UNIQUE,
    password TEXT NOT NULL,
    name TEXT,
    age INTEGER,
    goal TEXT,
    level TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS workouts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    exercise TEXT NOT NULL,
    sets INTEGER,
    reps TEXT,
    weight REAL,
    date TEXT DEFAULT (datetime('now'))
  )
`);

// Migrate users table — add new columns if missing
const userCols = db.prepare("PRAGMA table_info(users)").all();
const userColNames = userCols.map((c) => c.name);
if (!userColNames.includes("message_count")) {
  db.exec("ALTER TABLE users ADD COLUMN message_count INTEGER DEFAULT 0");
}
if (!userColNames.includes("is_subscribed")) {
  db.exec("ALTER TABLE users ADD COLUMN is_subscribed INTEGER DEFAULT 0");
}
if (!userColNames.includes("stripe_customer_id")) {
  db.exec("ALTER TABLE users ADD COLUMN stripe_customer_id TEXT");
}
if (!userColNames.includes("stripe_subscription_id")) {
  db.exec("ALTER TABLE users ADD COLUMN stripe_subscription_id TEXT");
}

// Migrate existing workouts table — add user_id if missing
const workoutCols = db.prepare("PRAGMA table_info(workouts)").all();
if (!workoutCols.some((c) => c.name === "user_id")) {
  db.exec("ALTER TABLE workouts ADD COLUMN user_id INTEGER REFERENCES users(id)");
}

// Migrate reps column to TEXT if it was created as INTEGER
const repsCol = workoutCols.find((c) => c.name === "reps");
if (repsCol && repsCol.type.toUpperCase() !== "TEXT") {
  db.exec(`
    BEGIN TRANSACTION;
    CREATE TABLE workouts_new (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      exercise TEXT NOT NULL,
      sets INTEGER,
      reps TEXT,
      weight REAL,
      date TEXT DEFAULT (datetime('now'))
    );
    INSERT INTO workouts_new SELECT id, NULL, exercise, sets, reps, weight, date FROM workouts;
    DROP TABLE workouts;
    ALTER TABLE workouts_new RENAME TO workouts;
    COMMIT;
  `);
}

module.exports = db;
