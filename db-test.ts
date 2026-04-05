import { Pool } from 'pg';
import * as dotenv from 'dotenv';
dotenv.config();

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: false });
  
  await pool.query(`
    CREATE TABLE IF NOT EXISTS antigravity_control (
      id          INT PRIMARY KEY DEFAULT 1,
      active_pc   VARCHAR(100) NOT NULL DEFAULT 'BillyAgentic',
      updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
      updated_by  VARCHAR(100)
    );
  `);
  
  await pool.query(`
    INSERT INTO antigravity_control (id, active_pc)
    VALUES (1, 'BillyAgentic')
    ON CONFLICT (id) DO NOTHING;
  `);

  const result = await pool.query('SELECT * FROM antigravity_control WHERE id = 1');
  console.log('✅ Tabla creada. Estado actual:', result.rows[0]);
  await pool.end();
}

main().catch(e => { console.error('❌ Error DB:', e.message); process.exit(1); });
