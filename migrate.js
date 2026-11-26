import { DatabaseSync } from "node:sqlite";
import pg from "pg";
import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

dotenv.config();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sqliteDb = new DatabaseSync(path.join(__dirname, "smart_stem.db"));
const pgPool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function migrate() {
  try {
    console.log("Đang chuyển dữ liệu từ SQLite sang Supabase...");

    const users = sqliteDb.prepare("SELECT * FROM users").all();
    for (const u of users) {
      await pgPool.query(
        "INSERT INTO users (username, password, name, role, department, created_at) VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (username) DO NOTHING",
        [u.username, u.password, u.name, u.role, u.department, u.created_at]
      );
    }
    console.log(`- Đã chuyển ${users.length} tài khoản (users).`);

    const bookings = sqliteDb.prepare("SELECT * FROM bookings").all();
    for (const b of bookings) {
      await pgPool.query(
        "INSERT INTO bookings (name, class_name, date, session, periods, purpose, status, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)",
        [b.name, b.class_name, b.date, b.session, b.periods, b.purpose, b.status, b.created_at, b.updated_at]
      );
    }
    console.log(`- Đã chuyển ${bookings.length} lịch đăng ký phòng (bookings).`);

    const lockers = sqliteDb.prepare("SELECT * FROM lockers").all();
    for (const l of lockers) {
      await pgPool.query(
        "INSERT INTO lockers (id, name, location, state, updated_at) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (id) DO NOTHING",
        [l.id, l.name, l.location, l.state, l.updated_at]
      );
    }
    console.log(`- Đã chuyển ${lockers.length} hộc tủ (lockers).`);

    const lockerLogs = sqliteDb.prepare("SELECT * FROM locker_logs").all();
    for (const ll of lockerLogs) {
      await pgPool.query(
        "INSERT INTO locker_logs (locker_id, locker_name, event, source, time, date, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7)",
        [ll.locker_id, ll.locker_name, ll.event, ll.source, ll.time, ll.date, ll.created_at]
      );
    }
    console.log(`- Đã chuyển ${lockerLogs.length} nhật ký hộc tủ (locker_logs).`);

    const entryLogs = sqliteDb.prepare("SELECT * FROM entry_logs").all();
    for (const el of entryLogs) {
      await pgPool.query(
        "INSERT INTO entry_logs (direction, label, count, camera, time, date, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7)",
        [el.direction, el.label, el.count, el.camera, el.time, el.date, el.created_at]
      );
    }
    console.log(`- Đã chuyển ${entryLogs.length} nhật ký ra/vào (entry_logs).`);

    console.log("✅ HOÀN TẤT CHUYỂN DỮ LIỆU SANG SUPABASE!");
  } catch (err) {
    console.error("❌ Lỗi chuyển dữ liệu:", err);
  } finally {
    await pgPool.end();
  }
}

migrate();
