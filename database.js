const Database = require("better-sqlite3");
const dbPath = process.env.DATABASE_PATH || "gym.db";
const db = new Database(dbPath);

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

db.exec(`
  CREATE TABLE IF NOT EXISTS body_weight (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    weight REAL NOT NULL,
    date TEXT DEFAULT (datetime('now'))
  )
`);

// Migrate users table
const userCols = db.prepare("PRAGMA table_info(users)").all();
const userColNames = userCols.map((c) => c.name);
const userMigrations = {
  message_count:           "ALTER TABLE users ADD COLUMN message_count INTEGER DEFAULT 0",
  is_subscribed:           "ALTER TABLE users ADD COLUMN is_subscribed INTEGER DEFAULT 0",
  stripe_customer_id:      "ALTER TABLE users ADD COLUMN stripe_customer_id TEXT",
  stripe_subscription_id:  "ALTER TABLE users ADD COLUMN stripe_subscription_id TEXT",
  current_streak:          "ALTER TABLE users ADD COLUMN current_streak INTEGER DEFAULT 0",
  longest_streak:          "ALTER TABLE users ADD COLUMN longest_streak INTEGER DEFAULT 0",
  last_workout_date:       "ALTER TABLE users ADD COLUMN last_workout_date TEXT",
  height:                  "ALTER TABLE users ADD COLUMN height REAL",
  password_reset_token:    "ALTER TABLE users ADD COLUMN password_reset_token TEXT",
  password_reset_expires:  "ALTER TABLE users ADD COLUMN password_reset_expires TEXT",
};
for (const [col, sql] of Object.entries(userMigrations)) {
  if (!userColNames.includes(col)) db.exec(sql);
}

// Migrate workouts table
const workoutCols = db.prepare("PRAGMA table_info(workouts)").all();
const workoutColNames = workoutCols.map((c) => c.name);
if (!workoutColNames.includes("user_id")) {
  db.exec("ALTER TABLE workouts ADD COLUMN user_id INTEGER REFERENCES users(id)");
}
if (!workoutColNames.includes("notes")) {
  db.exec("ALTER TABLE workouts ADD COLUMN notes TEXT");
}
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
      notes TEXT,
      date TEXT DEFAULT (datetime('now'))
    );
    INSERT INTO workouts_new (id, user_id, exercise, sets, reps, weight, date)
      SELECT id, NULL, exercise, sets, reps, weight, date FROM workouts;
    DROP TABLE workouts;
    ALTER TABLE workouts_new RENAME TO workouts;
    COMMIT;
  `);
}

module.exports = db;
