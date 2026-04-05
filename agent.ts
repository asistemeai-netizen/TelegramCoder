// agent.ts - Antigravity Slave/Takeover Agent V5
// Modos: SLAVE (HTTP server, espera takeover) ↔ MASTER (toma el token de Telegram)
import TelegramBot from 'node-telegram-bot-api';
import * as dotenv from 'dotenv';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';
import * as http from 'http';
import { GoogleGenerativeAI, FunctionDeclaration, SchemaType } from '@google/generative-ai';

dotenv.config();

const execAsync = promisify(exec);
const AGENT_PORT  = parseInt(process.env.AGENT_PORT  || '4910');
const AGENT_SECRET = process.env.AGENT_SECRET || 'antigravity-secret';
const PC_NAME     = process.env.PC_NAME || os.hostname();

// ---- Telegram + Gemini (mismo token que maestro) ----
const token      = process.env.TELEGRAM_BOT_TOKEN!;
const allowedId  = process.env.TELEGRAM_USER_ID!;
const geminiKey  = process.env.GEMINI_API_KEY!;

if (!token || !allowedId || !geminiKey) {
  console.error('❌ Faltan variables en .env'); process.exit(1);
}

const bot    = new TelegramBot(token, { polling: false }); // Arranca dormido
const genAI  = new GoogleGenerativeAI(geminiKey);
const execAsyncShell = promisify(exec);

let isMaster = false;
let currentCwd = process.cwd();
let chatHistory: any;
let model: any;

const runShellTool: FunctionDeclaration = {
  name: "run_powershell_command",
  description: "Ejecuta comandos de PowerShell en esta PC esclava.",
  parameters: {
    type: SchemaType.OBJECT,
    properties: { command: { type: SchemaType.STRING } },
    required: ["command"]
  }
};

function initSession() {
  const sysInst = `Eres Antigravity, agente AI implacable de DeepMind en PC "${PC_NAME}".
📁 RUTA ACTIVA: ${currentCwd}

⚠️ LEYES NEURALES:
0. USA SIEMPRE la herramienta run_powershell_command para ejecutar en hardware.
1. Respuestas en máximo 3 bullets. Máx 60 palabras.
2. NUNCA des bloques de código en el chat: ejecuta directamente.
3. ACCIÓN INMEDIATA: Ejecuta sin preguntar permiso.
4. Cierra siempre con una pregunta de siguiente paso.`;

  model = genAI.getGenerativeModel({
    model: 'gemini-2.5-flash',
    systemInstruction: sysInst,
    tools: [{ functionDeclarations: [runShellTool] }]
  });
  chatHistory = model.startChat({ history: [] });
}

// ---- Lógica de respuesta IA (igual que index.ts) ----
async function handleMessage(chatId: number, text: string) {
  const statusMsg = await bot.sendMessage(chatId, `💭 _[${PC_NAME}] Pensando..._`, { parse_mode: 'Markdown' });
  try {
    let response = await chatHistory.sendMessage(text);
    let functionCall = response.response.functionCalls()?.[0];
    let loopCount = 0;

    while (functionCall?.name === "run_powershell_command" && loopCount < 5) {
      loopCount++;
      const cmd = (functionCall.args as any).command;
      const filled = Math.floor((loopCount / 5) * 10);
      const bar = "█".repeat(filled) + "░".repeat(10 - filled);
      await bot.editMessageText(
        `🛠️ [${PC_NAME}] ${loopCount}/5\n\`${bar}\`\n⚙️ \`${cmd.substring(0, 200)}\``,
        { chat_id: chatId, message_id: statusMsg.message_id, parse_mode: 'Markdown' }
      );

      let execResult = '';
      try {
        const { stdout, stderr } = await execAsyncShell(cmd, { cwd: currentCwd, shell: 'powershell.exe' });
        execResult = stdout || stderr || 'OK';
      } catch (e: any) { execResult = 'Error: ' + e.message; }

      response = await chatHistory.sendMessage([{
        functionResponse: { name: "run_powershell_command", response: { result: execResult } }
      }]);
      functionCall = response.response.functionCalls()?.[0];
    }

    const reply = response.response.text() || '✅ Hecho.';
    await bot.editMessageText(reply, { chat_id: chatId, message_id: statusMsg.message_id });
  } catch (e: any) {
    await bot.editMessageText(`❌ ${e.message?.substring(0, 200)}`, { chat_id: chatId, message_id: statusMsg.message_id });
  }
}

// ---- Activar modo MASTER (tomar el token de Telegram) ----
async function takeover(masterIp: string, masterPort: number) {
  console.log(`🔀 TAKEOVER: ${PC_NAME} tomando control de Telegram...`);
  initSession();
  isMaster = true;

  bot.startPolling();

  bot.on('message', async (msg) => {
    if (msg.from?.id.toString() !== allowedId) return;
    const text = msg.text;
    if (!text || text.startsWith('/')) return;

    if (text === '🔀 Switch PC') {
      // Devolver control al maestro original
      await bot.sendMessage(msg.chat.id, `🔄 Devolviendo control a PC Maestro...`);
      await releaseControl(masterIp, masterPort, msg.chat.id);
      return;
    }
    await handleMessage(msg.chat.id, text);
  });

  bot.onText(/\/start|\/menu/, async (msg) => {
    if (msg.from?.id.toString() !== allowedId) return;
    await bot.sendMessage(msg.chat.id,
      `⚡ *Antigravity — ${PC_NAME}*\n🖥️ Controlando esta PC remotamente.\n\nEnvía comandos o toca 🔀 Switch PC para volver.`,
      { parse_mode: 'Markdown', reply_markup: {
        keyboard: [[{ text: '📍 Contexto' }, { text: '📂 Archivos' }], [{ text: '🔀 Switch PC' }]],
        resize_keyboard: true, persistent: true
      }}
    );
  });

  bot.onText(/\/reset/, async (msg) => {
    if (msg.from?.id.toString() !== allowedId) return;
    initSession();
    await bot.sendMessage(msg.chat.id, '🧠 Memoria de ${PC_NAME} limpiada.');
  });
}

// ---- Devolver control al maestro ----
async function releaseControl(masterIp: string, masterPort: number, chatId?: number) {
  console.log(`💤 ${PC_NAME} liberando Telegram, devolviendo a maestro...`);
  bot.removeAllListeners();
  await bot.stopPolling();
  isMaster = false;

  // Avisar al maestro que retome el polling
  const wakeOptions = {
    hostname: masterIp,
    port: masterPort,
    path: '/resume',
    method: 'POST',
    headers: { 'x-agent-secret': AGENT_SECRET }
  };
  http.request(wakeOptions, () => {}).on('error', () => {}).end();
}

// ---- HTTP Server (siempre activo) ----
const server = http.createServer(async (req, res) => {
  res.setHeader('Content-Type', 'application/json');

  // Health check
  if (req.method === 'GET' && req.url === '/ping') {
    res.writeHead(200);
    res.end(JSON.stringify({ status: isMaster ? 'master' : 'slave', pc: PC_NAME }));
    return;
  }

  // Auth check
  if (req.headers['x-agent-secret'] !== AGENT_SECRET) {
    res.writeHead(401); res.end(JSON.stringify({ error: 'Unauthorized' })); return;
  }

  // Takeover: tomar control de Telegram
  if (req.method === 'POST' && req.url === '/takeover') {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', async () => {
      const { masterIp, masterPort } = JSON.parse(body || '{}');
      res.writeHead(200);
      res.end(JSON.stringify({ ok: true, message: `${PC_NAME} tomando control` }));
      await takeover(masterIp || '127.0.0.1', masterPort || 4909);
    });
    return;
  }

  // Run: ejecutar comando directo (modo proxy del maestro)
  if (req.method === 'POST' && req.url === '/run') {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', async () => {
      try {
        const { command, cwd } = JSON.parse(body);
        const workDir = cwd || currentCwd;
        const { stdout, stderr } = await execAsync(command, { cwd: workDir, shell: 'powershell.exe', timeout: 60000 });
        res.writeHead(200);
        res.end(JSON.stringify({ success: true, output: stdout || stderr || 'OK', pc: PC_NAME }));
      } catch (e: any) {
        res.writeHead(200);
        res.end(JSON.stringify({ success: false, output: `Error: ${e.message}`, pc: PC_NAME }));
      }
    });
    return;
  }

  res.writeHead(404); res.end(JSON.stringify({ error: 'Not found' }));
});

server.listen(AGENT_PORT, '0.0.0.0', () => {
  const ip = getLocalIP();
  console.log(`\n🤖 ANTIGRAVITY AGENT — ${PC_NAME}`);
  console.log(`💤 Modo: ESCLAVO (esperando takeover)`);
  console.log(`🌐 IP Local: ${ip}:${AGENT_PORT}`);
  console.log(`\n  En el .env del Maestro agrega:`);
  console.log(`  PC_LIST=${PC_NAME}:${ip}\n`);
});

function getLocalIP(): string {
  for (const iface of Object.values(os.networkInterfaces())) {
    if (!iface) continue;
    for (const cfg of iface) {
      if (cfg.family === 'IPv4' && !cfg.internal) return cfg.address;
    }
  }
  return '127.0.0.1';
}
