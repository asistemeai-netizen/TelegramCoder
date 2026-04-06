import TelegramBot from 'node-telegram-bot-api';
import * as dotenv from 'dotenv';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as os from 'os';
import * as http from 'http';
import { GoogleGenerativeAI, FunctionDeclaration, SchemaType } from '@google/generative-ai';
import { initControlTable, setActivePC, watchForActivation } from './db.js';


dotenv.config();

const execAsync    = promisify(exec);
const AGENT_PORT   = parseInt(process.env.AGENT_PORT || '4910');
const AGENT_SECRET = process.env.AGENT_SECRET || 'antigravity-secret';
const PC_NAME      = process.env.PC_NAME || os.hostname();

const token     = process.env.TELEGRAM_BOT_TOKEN!;
const allowedId = process.env.TELEGRAM_USER_ID!;
const geminiKey = process.env.GEMINI_API_KEY!;

if (!token || !allowedId || !geminiKey) {
  console.error('❌ Faltan variables en .env'); process.exit(1);
}

const bot   = new TelegramBot(token, { polling: false });
const genAI = new GoogleGenerativeAI(geminiKey);
const execAsyncShell = promisify(exec);

let isActive   = false;
let currentCwd = process.cwd();
let chatHistory: any;
let model: any;


// ============================================================
// GEMINI SESSION
// ============================================================
const runShellTool: FunctionDeclaration = {
  name: "run_powershell_command",
  description: "Ejecuta comandos de PowerShell en esta PC.",
  parameters: {
    type: SchemaType.OBJECT,
    properties: { command: { type: SchemaType.STRING } },
    required: ["command"]
  }
};

function initSession() {
  model = genAI.getGenerativeModel({
    model: 'gemini-2.5-flash',
    systemInstruction: `Eres Antigravity, agente AI en PC "${PC_NAME}".
📁 RUTA: ${currentCwd}
⚠️ LEYES NEURALES:
0. USA run_powershell_command para todo lo que toque hardware.
1. Máximo 3 bullets. Máx 60 palabras por respuesta.
2. NUNCA bloque de código en chat: ejecuta directo.
3. ACCIÓN INMEDIATA sin pedir permiso.
4. Cierra siempre con pregunta de siguiente paso.`,
    tools: [{ functionDeclarations: [runShellTool] }]
  });
  chatHistory = model.startChat({ history: [] });
}

// ============================================================
// DB WATCHER: espera activa via PostgreSQL (sin 409 spam)
// ============================================================
async function startAgent() {
  await initControlTable();
  console.log(`\n🤖 ANTIGRAVITY AGENT — ${PC_NAME}`);
  console.log(`📡 Conectado a DB. Esperando activacion...`);
  console.log(`   (La PC activa se controla desde Telegram → Switch PC)\n`);

  watchForActivation(
    PC_NAME,
    3000, // Revisar DB cada 3 segundos
    async () => {
      // DB dice: esta PC debe ser la activa
      console.log(`\n⚡ [${PC_NAME}] DB: Activando Telegram polling...`);
      isActive = true;
      initSession();
      bot.startPolling();
      console.log(`✅ [${PC_NAME}] Activo. Respondiendo en Telegram.\n`);
    },
    async () => {
      // DB dice: esta PC debe dormir
      if (isActive) {
        console.log(`\n💤 [${PC_NAME}] DB: Deteniendo polling...`);
        isActive = false;
        bot.removeAllListeners('message');
        await bot.stopPolling().catch(() => {});
        registerIdleListeners();
        console.log(`😴 [${PC_NAME}] Dormida. Monitoreando DB...\n`);
      }
    }
  );
}

function registerIdleListeners() {
  // En modo idle, no escuchar mensajes de Telegram
  // Solo el HTTP server de abajo responde a /run y /ping
}

// ============================================================
// HANDLERS ACTIVOS: cuando esta PC es la activa
// ============================================================
bot.on('message', async (msg) => {
  if (!isActive) return;
  if (msg.from?.id.toString() !== allowedId) return;
  const text = msg.text;
  if (!text || text.startsWith('/')) return;

  if (text === '🔙 Volver al Maestro') {
    await releaseToMaster(msg.chat.id);
    return;
  }

  if (text === '📍 Contexto') {
    await bot.sendMessage(msg.chat.id, `📍 *${PC_NAME}*\n📁 \`${currentCwd}\``, { parse_mode: 'Markdown' });
    return;
  }

  await handleAIMessage(msg.chat.id, text);
});

bot.onText(/\/start|\/menu/, async (msg) => {
  if (!isActive || msg.from?.id.toString() !== allowedId) return;
  await bot.sendMessage(msg.chat.id,
    `⚡ *Antigravity — ${PC_NAME}*\nControlando esta PC directamente.\n\nEnvia comandos o toca el boton para volver.`,
    { parse_mode: 'Markdown', reply_markup: {
        keyboard: [
          [{ text: '📂 Archivos' }, { text: '📍 Contexto' }],
          [{ text: '🔙 Volver al Maestro' }]
        ],
        resize_keyboard: true, is_persistent: true
    }}
  );
});

// ============================================================
// DEVOLVER CONTROL AL MAESTRO
// ============================================================
async function releaseToMaster(chatId?: number) {
  console.log(`\n🔙 [${PC_NAME}] Devolviendo control al Maestro via DB...`);
  isActive = false;

  if (chatId) {
    await bot.sendMessage(chatId, `🔙 Devolviendo control... El Maestro respondera en ~3 segundos.`);
  }

  // Escribir en DB: el Maestro es el activo
  const masterName = process.env.MASTER_PC_NAME || 'BillyAgentic';
  await setActivePC(masterName, PC_NAME);
  
  await bot.stopPolling().catch(() => {});
  console.log(`✅ DB actualizada: ${masterName} activado. Esta PC dormida.\n`);
}


// ============================================================
// LÓGICA DE IA
// ============================================================
async function handleAIMessage(chatId: number, text: string) {
  const statusMsg = await bot.sendMessage(chatId, `💭 _[${PC_NAME}] Pensando..._`, { parse_mode: 'Markdown' });
  try {
    let response     = await chatHistory.sendMessage(text);
    let functionCall = response.response.functionCalls()?.[0];
    let loopCount    = 0;

    while (functionCall?.name === "run_powershell_command" && loopCount < 5) {
      loopCount++;
      const cmd    = (functionCall.args as any).command;
      const filled = Math.floor((loopCount / 5) * 10);
      const bar    = "█".repeat(filled) + "░".repeat(10 - filled);
      await bot.editMessageText(
        `🛠️ [${PC_NAME}] ${loopCount}/5 [${bar}]\n⚙️ \`${cmd.substring(0, 250)}\``,
        { chat_id: chatId, message_id: statusMsg.message_id, parse_mode: 'Markdown' }
      );

      let execResult = '';
      try {
        const { stdout, stderr } = await execAsyncShell(cmd, { cwd: currentCwd, shell: 'powershell.exe' });
        execResult = stdout || stderr || 'OK';
      } catch (e: any) { execResult = 'Error: ' + e.message; }

      response     = await chatHistory.sendMessage([{
        functionResponse: { name: "run_powershell_command", response: { result: execResult } }
      }]);
      functionCall = response.response.functionCalls()?.[0];
    }

    const reply = response.response.text() || '✅ Hecho.';
    await bot.deleteMessage(chatId, statusMsg.message_id).catch(() => {});
    await bot.sendMessage(chatId, reply, { 
      parse_mode: 'Markdown',
      reply_markup: {
        keyboard: [
          [{ text: '📂 Archivos' }, { text: '📍 Contexto' }],
          [{ text: '🔙 Volver al Maestro' }]
        ],
        resize_keyboard: true, is_persistent: true
      }
    });
  } catch (e: any) {
    await bot.editMessageText(`❌ ${e.message?.substring(0, 200)}`, { chat_id: chatId, message_id: statusMsg.message_id });
  }
}

// ============================================================
// HTTP SERVER (local fallback para comandos directos)
// ============================================================
const server = http.createServer(async (req, res) => {
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'GET' && req.url === '/ping') {
    res.writeHead(200);
    res.end(JSON.stringify({ status: isActive ? 'master' : 'slave', pc: PC_NAME }));
    return;
  }

  if (req.headers['x-agent-secret'] !== AGENT_SECRET) {
    res.writeHead(401); res.end(JSON.stringify({ error: 'Unauthorized' })); return;
  }

  if (req.method === 'POST' && req.url === '/run') {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', async () => {
      try {
        const { command, cwd } = JSON.parse(body);
        const { stdout, stderr } = await execAsync(command, { cwd: cwd || currentCwd, shell: 'powershell.exe', timeout: 60000 });
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

// ============================================================
// ARRANQUE
// ============================================================
server.listen(AGENT_PORT, '0.0.0.0', () => {
  console.log(`📡 HTTP server local activo en puerto ${AGENT_PORT}`);
  startAgent(); // Conectar a DB y esperar activacion
});
