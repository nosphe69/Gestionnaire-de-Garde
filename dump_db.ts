import Database from 'better-sqlite3';
const db = new Database('guards.db');
try {
  const shifts = db.prepare("SELECT * FROM shifts").all();
  console.log(JSON.stringify(shifts, null, 2));
} catch (e) {
  console.error(e);
} finally {
  db.close();
}
