const Database = require("better-sqlite3");
const db = new Database("gym.db");

const createTableSql = `
  CREATE TABLE IF NOT EXISTS workouts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    exercise TEXT NOT NULL,
    sets INTEGER,
    reps TEXT,
    weight REAL,
    date TEXT DEFAULT (datetime('now'))
  )
`;

db.exec(createTableSql);

const tableInfo = db.prepare("PRAGMA table_info(workouts)").all();
const repsColumn = tableInfo.find((col) => col.name === "reps");

if (repsColumn && repsColumn.type.toUpperCase() !== "TEXT") {
  db.exec(`
    BEGIN TRANSACTION;
    CREATE TABLE workouts_new (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      exercise TEXT NOT NULL,
      sets INTEGER,
      reps TEXT,
      weight REAL,
      date TEXT DEFAULT (datetime('now'))
    );
    INSERT INTO workouts_new (id, exercise, sets, reps, weight, date)
      SELECT id, exercise, sets, reps, weight, date FROM workouts;
    DROP TABLE workouts;
    ALTER TABLE workouts_new RENAME TO workouts;
    COMMIT;
  `);
}

module.exports = db;
