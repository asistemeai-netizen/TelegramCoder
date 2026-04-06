import { Pool } from 'pg';
import * as dotenv from 'dotenv';
dotenv.config();

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: false });
  await pool.query("UPDATE antigravity_control SET active_pc = 'BillyLaptop', updated_at = NOW(), updated_by = 'manual' WHERE id = 1");
  const result = await pool.query('SELECT * FROM antigravity_control WHERE id = 1');
  console.log('✅ DB actualizada:', result.rows[0]);
  await pool.end();
}

main().catch(e => { console.error('❌ Error DB:', e.message); process.exit(1); });
