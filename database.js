import pg from "pg";
import dotenv from "dotenv";

dotenv.config();
const { Pool } = pg;

export const db = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

export async function initDatabase() {
  try {
    await db.query("SELECT NOW()");
    console.log("[Smart STEM Backend] Da ket noi thanh cong toi Supabase PostgreSQL!");
  } catch (err) {
    console.error("[Smart STEM Backend] Loi ket noi Supabase:", err.message);
  }
}
