// db.ts - Control de PC activa via PostgreSQL
import { Pool } from 'pg';
import * as dotenv from 'dotenv';
dotenv.config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: false, // Servidor propio, sin SSL
  connectionTimeoutMillis: 5000,
  idleTimeoutMillis: 30000,
});

// ── Inicializar tablas ──────────────────────────────────────
export async function initControlTable(): Promise<void> {
  // Tabla principal de control (qué PC está activa)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS antigravity_control (
      id          INT PRIMARY KEY DEFAULT 1,
      active_pc   VARCHAR(100)  NOT NULL DEFAULT 'BillyAgentic',
      updated_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
      updated_by  VARCHAR(100)
    );
  `);

  // Tabla de PCs registradas (auto-registro al arrancar)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS antigravity_pcs (
      pc_name     VARCHAR(100) PRIMARY KEY,
      last_seen   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
      is_online   BOOLEAN      NOT NULL DEFAULT true
    );
  `);

  // Fila inicial de control si no existe
  await pool.query(`
    INSERT INTO antigravity_control (id, active_pc)
    VALUES (1, $1)
    ON CONFLICT (id) DO NOTHING;
  `, [process.env.PC_NAME || 'BillyAgentic']);

  console.log('✅ [DB] Tablas antigravity_control y antigravity_pcs listas.');
}

// ── Leer qué PC está activa ─────────────────────────────────
export async function getActivePC(): Promise<string> {
  const result = await pool.query(
    `SELECT active_pc FROM antigravity_control WHERE id = 1`
  );
  return result.rows[0]?.active_pc || '';
}

// ── Escribir qué PC debe estar activa ──────────────────────
export async function setActivePC(pcName: string, updatedBy?: string): Promise<void> {
  await pool.query(
    `UPDATE antigravity_control 
     SET active_pc = $1, updated_at = NOW(), updated_by = $2
     WHERE id = 1`,
    [pcName, updatedBy || pcName]
  );
}

// ── Polling de control (para PCs dormidas) ──────────────────
// Llama a onActivate cuando la DB señale que esta PC debe activarse
export function watchForActivation(
  myPCName: string,
  intervalMs: number,
  onActivate: () => void,
  onDeactivate: () => void
): () => void {
  let lastState: string | null = null;
  let active = true;

  const interval = setInterval(async () => {
    if (!active) return;
    try {
      const activePc = await getActivePC();
      if (activePc === lastState) return; // Sin cambio

      lastState = activePc;
      if (activePc === myPCName) {
        onActivate();
      } else {
        onDeactivate();
      }
    } catch (e) {
      // Error de DB → ignorar silenciosamente, reintentar en el siguiente ciclo
    }
  }, intervalMs);

  // Devolver función para detener el watcher
  return () => {
    active = false;
    clearInterval(interval);
  };
}

export { pool };

// ── Registrar esta PC en la DB ──────────────────────────────
export async function registerPC(pcName: string): Promise<void> {
  await pool.query(`
    INSERT INTO antigravity_pcs (pc_name, last_seen, is_online)
    VALUES ($1, NOW(), true)
    ON CONFLICT (pc_name) DO UPDATE
      SET last_seen = NOW(), is_online = true;
  `, [pcName]);
}

// ── Obtener todas las PCs registradas ───────────────────────
export async function getRegisteredPCs(): Promise<{ pc_name: string; last_seen: Date; is_online: boolean }[]> {
  const result = await pool.query(
    `SELECT pc_name, last_seen, is_online FROM antigravity_pcs ORDER BY last_seen DESC`
  );
  return result.rows;
}

