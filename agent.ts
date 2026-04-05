// agent.ts - Antigravity Agent V5 (Token Arbitrage Protocol)
// Ambas PCs compiten por el token. Solo una responde a la vez.
// 100% Telegram/Internet nativo. Sin IPs, sin puertos, sin servicios externos.
import TelegramBot from 'node-telegram-bot-api';
import * as dotenv from 'dotenv';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as os from 'os';
import * as http from 'http';
import { GoogleGenerativeAI, FunctionDeclaration, SchemaType } from '@google/generative-ai';

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

let isActive   = false; // ¿Esta PC está respondiendo en Telegram ahora mismo?
let currentCwd = process.cwd();
let chatHistory: any;
let model: any;
let retryTimer: ReturnType<typeof setTimeout> | null = null;

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
// TOKEN ARBITRAGE PROTOCOL
// ============================================================
async function tryClaimToken() {
  if (isActive) return;
  if (retryTimer) { clearTimeout(retryTimer); retryTimer = null; }

  try {
    await bot.stopPolling().catch(() => {}); // Limpiar estado anterior
    bot.startPolling({ interval: 300, params: { timeout: 10 } });
    console.log(`🎯 [${PC_NAME}] Intentando tomar el token...`);
  } catch (e) {
    scheduleRetry();
  }
}

function scheduleRetry(delayMs = 2500) {
  if (isActive || retryTimer) return;
  retryTimer = setTimeout(() => {
    retryTimer = null;
    tryClaimToken();
  }, delayMs);
}

// Perdimos el token (otro bot lo tiene) → esperar y reintentar
bot.on('polling_error', async (error: any) => {
  const is409 = error?.response?.statusCode === 409 ||
                error?.message?.includes('409') ||
                error?.code === 'CONFLICT';

  if (is409 && !isActive) {
    await bot.stopPolling().catch(() => {});
    console.log(`💤 [${PC_NAME}] Maestro activo. Esperando turno...`);
    scheduleRetry();
    return;
  }

  // Otro tipo de error (red, API, etc.) → también reintentar
  if (!isActive) {
    console.error(`⚠️  [${PC_NAME}] Error de polling: ${error?.message}`);
    scheduleRetry(5000);
  }
});

// ============================================================
// HANDLERS: cuando esta PC es la activa
// ============================================================
bot.on('message', async (msg) => {
  if (msg.from?.id.toString() !== allowedId) return;
  const text = msg.text;
  if (!text) return;

  // Primera vez que recibimos un mensaje = confirmamos que somos el maestro activo
  if (!isActive) {
    isActive = true;
    console.log(`\n✅ [${PC_NAME}] TOKEN TOMADO — Ahora soy el MAESTRO activo\n`);
    // Anunciar al usuario que esta PC tomó el control
    await bot.sendMessage(msg.chat.id,
      `🔀 *${PC_NAME}* tomó el control\n💻 Envía comandos directamente o toca el botón para volver.`,
      { parse_mode: 'Markdown', reply_markup: {
          keyboard: [
            [{ text: '📂 Archivos' }, { text: '📍 Contexto' }],
            [{ text: `🔙 Volver al Maestro` }]
          ],
          resize_keyboard: true, persistent: true
      }}
    );
    initSession();
    return; // El mensaje que nos "despertó" era el switch, no procesarlo como IA
  }

  if (text.startsWith('/')) return;

  // Comando para devolver el control
  if (text === '🔙 Volver al Maestro') {
    await releaseToken(msg.chat.id);
    return;
  }

  // Comando de contexto
  if (text === '📍 Contexto') {
    await bot.sendMessage(msg.chat.id, `📍 *${PC_NAME}*\n📁 \`${currentCwd}\``, { parse_mode: 'Markdown' });
    return;
  }

  // IA procesa el resto
  await handleAIMessage(msg.chat.id, text);
});

bot.onText(/\/start|\/menu/, async (msg) => {
  if (msg.from?.id.toString() !== allowedId) return;
  if (!isActive) return; // Si no somos maestro, ignorar
  await bot.sendMessage(msg.chat.id,
    `⚡ *Antigravity — ${PC_NAME}*\nControlando esta PC directamente.\n\n Envía comandos o vuelve al Maestro.`,
    { parse_mode: 'Markdown', reply_markup: {
        keyboard: [
          [{ text: '📂 Archivos' }, { text: '📍 Contexto' }],
          [{ text: '🔙 Volver al Maestro' }]
        ],
        resize_keyboard: true, persistent: true
    }}
  );
});

// ============================================================
// LIBERAR TOKEN (devolver al maestro)
// ============================================================
async function releaseToken(chatId?: number) {
  console.log(`\n🔙 [${PC_NAME}] Liberando token → Maestro tomará control en ~3s`);
  isActive = false;
  bot.removeAllListeners();

  if (chatId) {
    await bot.sendMessage(chatId, `🔙 Devolviendo control... El Maestro responderá en ~3 segundos.`);
  }

  await bot.stopPolling().catch(() => {});

  // Re-registrar solo el handler de polling_error para el modo idle
  bot.on('polling_error', async (error: any) => {
    const is409 = error?.response?.statusCode === 409 ||
                  error?.message?.includes('409');
    if (is409 && !isActive) {
      await bot.stopPolling().catch(() => {});
      scheduleRetry();
    }
  });

  // Volvemos al modo de competencia pasiva (retry loop)
  scheduleRetry(1000);
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
    await bot.editMessageText(reply, { chat_id: chatId, message_id: statusMsg.message_id });
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
  console.log(`\n🤖 ANTIGRAVITY AGENT — ${PC_NAME}`);
  console.log(`📡 HTTP server activo en puerto ${AGENT_PORT}`);
  console.log(`🏆 Iniciando Token Arbitrage Protocol...`);
  console.log(`   (Competiendo por el token de Telegram. Si hay otro bot activo,`);
  console.log(`    este esperará automáticamente hasta que sea su turno.)\n`);
  tryClaimToken();
});
