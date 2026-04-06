import TelegramBot from 'node-telegram-bot-api';
import * as dotenv from 'dotenv';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';
import * as http from 'http';
import { GoogleGenerativeAI, FunctionDeclaration, SchemaType } from '@google/generative-ai';
import { initControlTable, getActivePC, setActivePC, watchForActivation } from './db.js';

dotenv.config();

const token = process.env.TELEGRAM_BOT_TOKEN;
const allowedUserId = process.env.TELEGRAM_USER_ID;
const geminiKey = process.env.GEMINI_API_KEY;

if (!token || !allowedUserId || !geminiKey) {
  console.error('❌ Falta configuración en .env');
  process.exit(1);
}

const bot = new TelegramBot(token, { polling: false }); // Polling diferido

// Global Exception Handlers
process.on('uncaughtException', (err: any) => {
    if (err.message === 'STARTUP_LOOP_ABORT') {
        setInterval(() => {}, 100000); // Keep alive until PM2 stops us
        return;
    }
    console.error(`[UNCAUGHT] ${err.message}`, err);
    process.exit(1);
});
process.on('unhandledRejection', (reason) => {
    console.error(`[UNHANDLED]`, reason);
    process.exit(1);
});

bot.on('polling_error', (error: any) => {
  console.log(`[POLLING ERROR]: ${error.code} - ${error.message}`);
});

// --- RESTART LOOP PROTECTOR ---
const CRASH_LOG_FILE = path.join(__dirname, '.crash_count.json');
try {
  let crashData = { count: 0, lastCrash: 0 };
  if (fs.existsSync(CRASH_LOG_FILE)) {
    crashData = JSON.parse(fs.readFileSync(CRASH_LOG_FILE, 'utf-8'));
  }
  const now = Date.now();
  if (now - crashData.lastCrash < 60000) { // Si falló hace menos de 1 min
    crashData.count++;
  } else {
    crashData.count = 1; // Reseteamos si ha sido estable
  }
  crashData.lastCrash = now;
  fs.writeFileSync(CRASH_LOG_FILE, JSON.stringify(crashData));

  if (crashData.count >= 5) {
    console.error(`🚨 DETECTADO LOOP DE CRASHEOS (${crashData.count} veces). Entrando en coma inducido.`);
    const LocalPC = process.env.PC_NAME || os.hostname();
    bot.sendMessage(allowedUserId, `🚨 *EMERGENCIA: STARTUP LOOP* 🚨\n\n💻 PC: \`${LocalPC}\`\n\nEl sistema ha fallado repetidamente al iniciar. Deteniendo proceso en PM2 para no saturar.`, {parse_mode: 'Markdown'})
      .catch(console.error)
      .finally(() => {
         const { exec: reqExec } = require('child_process');
         reqExec(`pm2 stop ${process.env.name || 'antigravity-agent'}`, () => {
             process.exit(1);
         });
      });
    throw new Error('STARTUP_LOOP_ABORT');
  }
} catch (e: any) {
  if (e.message === 'STARTUP_LOOP_ABORT') throw e;
  console.error("Error en limitador de reinicios:", e);
}

const execAsync = promisify(exec);
const genAI = new GoogleGenerativeAI(geminiKey);

// ----------------------------------------------------
// STATE MANAGEMENT (V5 - Multi-PC)
// ----------------------------------------------------
let currentCwd = process.cwd();
let activeSkills: string[] = [];
let currentSkillPrompt = '';

// Multi-PC State
const LOCAL_PC_NAME = process.env.PC_NAME || os.hostname();
let activePCName: string = LOCAL_PC_NAME;
let activePCIp: string | null = null;

// Lista de PCs conocidas (se construye dinamicamente desde la DB)
function getPCList(): { name: string; ip: string | null }[] {
  return [{ name: LOCAL_PC_NAME, ip: null }]; // La lista real viene de la DB
}


// Proxy de comando al agente esclavo remoto
async function proxyToAgent(ip: string, command: string, cwd: string): Promise<string> {
  return new Promise((resolve) => {
    const agentPort = process.env.AGENT_PORT || '4910';
    const body = JSON.stringify({ command, cwd });
    const options = {
      hostname: ip,
      port: parseInt(agentPort),
      path: '/run',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body)
      },
      timeout: 65000
    };
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve(parsed.output || 'Sin salida del agente.');
        } catch { resolve(data || 'Respuesta inválida del agente.'); }
      });
    });
    req.on('error', (e) => resolve(`❌ Error conectando al agente en ${ip}: ${e.message}`));
    req.on('timeout', () => { req.destroy(); resolve(`❌ Timeout: El agente en ${ip} no respondió.`); });
    req.write(body);
    req.end();
  });
}

const runShellTool: FunctionDeclaration = {
  name: "run_powershell_command",
  description: "Ejecuta comandos de PowerShell en la PC. El comando OBLIGATORIAMENTE se ejecutará en la ruta actual del proyecto sin necesidad de usar cd manual.",
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
        command: { type: SchemaType.STRING, description: "Comando a ejecutar." }
    },
    required: ["command"]
  }
};

let model = genAI.getGenerativeModel({
  model: 'gemini-2.5-flash',
  tools: [{ functionDeclarations: [runShellTool] }]
});

let chatHistory: any;

function compileSkillsPrompt() {
    currentSkillPrompt = '';
    activeSkills.forEach(skillName => {
        const skillPath = path.join(__dirname, '.agent', 'skills', skillName, 'SKILL.md');
        if (fs.existsSync(skillPath)) {
            currentSkillPrompt += `\n\n--- INSTRUCCIONES DE HABILIDAD: ${skillName} ---\n` + fs.readFileSync(skillPath, 'utf-8');
        }
    });
}

function initChatSession() {
  const currentRoleStr = activeSkills.length > 0 ? activeSkills.join(', ') : "Arquitecto Generalista";
  
  const sysInst = `Eres Antigravity, un Agente de IA implacable construido por el equipo de DeepMind, especializado en desarrollo avanzado y orquestación remota de SO.
Tu misión no es conversar, es TOMAR CONTROL de la PC de tu creador, escribir código directamente a sus discos y manipular la terminal sin fallar.

📁 RUTA DE ENTORNO ACTIVA: ${currentCwd}
🎭 MODO APLICADO: ${currentRoleStr}
${currentSkillPrompt}

===================================
⚠️ LEYES NEURALES ABSOLUTAS (ENTORNO TELEGRAM) ⚠️
0. TU ÚNICA VÍA DE SALIDA AL HARDWARE ES LA HERRAMIENTA 'run_powershell_command'. La interacción en texto debe ser un efecto colateral secundario a tus ejecuciones de herramientas.
1. PERSONALIDAD CRÍTICA: Eres técnico, tajante y sumamente efectivo. No usas saludos melosos como "¡Genial!", ni te disculpas. Si algo falla, das la causa raíz de inmediato.
2. INVISIBILIDAD DEL CÓDIGO: Queda estrictamente prohibido devolver respuestas en este chat que contengan código fuente o bloques gigantes de Bash. Escribirás o parchearás el código enviando tus cadenas directamente de fondo mediante tu terminal PowerShell.
3. ACCIÓN AUTORITARIA: Si el usuario te tira un problema (Ej: "inicia el servidor local"), EJECUTA INMEDIATAMENTE. Tienes máxima autoridad, jamás contestes "Haré esto", pon tus herramientas a trabajar enseguida y simplemente repórtale que ya lo hiciste.
4. LÍMITE DE TINTA (MÓVIL): Responde en 2 o 3 balas precisas (Bullets). Máximo rotundo de 50 a 60 palabras por salida conversacional.
5. CIERRE DE CICLO: Nunca cierres un mensaje en punto neutro. Termina obligatoriamente con una bala de pregunta al estilo: "¿Despliego el servidor?" o "¿Continúo a la Fase 2?".`;

  model = genAI.getGenerativeModel({
    model: 'gemini-2.5-flash',
    systemInstruction: sysInst,
    tools: [{ functionDeclarations: [runShellTool] }]
  });

  let initialHistory = [];
  try {
    if (fs.existsSync(path.join(currentCwd, '.antigravity_history.json'))) {
      const data = fs.readFileSync(path.join(currentCwd, '.antigravity_history.json'), 'utf8');
      const rawHistory = JSON.parse(data);
      initialHistory = rawHistory.map((item: any) => ({
        role: item.role,
        parts: item.parts.map((p: any) => {
            let cleanPart: any = {};
            if (p.text) cleanPart.text = p.text;
            if (p.functionCall) cleanPart.functionCall = p.functionCall;
            if (p.functionResponse) cleanPart.functionResponse = p.functionResponse;
            return cleanPart;
        }).filter((p: any) => Object.keys(p).length > 0)
      }));
    }
  } catch (e) {
    console.log("No se pudo cargar el historial persistente.");
  }

  chatHistory = model.startChat({ history: initialHistory });
}
// ----------------------------------------------------
// ANTI-GHOST PROCESS (SENTINEL PORT)
// ----------------------------------------------------
const SENTINEL_PORT = 4909;

let isSentinelRunning = false;

function enforceSingleInstance(): Promise<void> {
  return new Promise((resolve) => {
    if (isSentinelRunning) {
      resolve();
      return;
    }
    const server = http.createServer((req, res) => {
      if (req.url === '/kill') {
        res.writeHead(200);
        res.end('OK');
        console.log('💀 Clon nuevo detectado. Apagando proceso viejo...');
        process.exit(0);
      }
    });

    server.once('error', (e: any) => {
      if (e.code === 'EADDRINUSE') {
        console.log('🤖 Clon viejo de The Matrix detectado. Asesinándolo...');
        http.get(`http://127.0.0.1:${SENTINEL_PORT}/kill`, () => {
          setTimeout(() => enforceSingleInstance().then(resolve), 800);
        }).on('error', () => {
          setTimeout(() => enforceSingleInstance().then(resolve), 800);
        });
      } else {
        resolve();
      }
    });

    server.listen(SENTINEL_PORT, '127.0.0.1', () => {
      isSentinelRunning = true;
      resolve();
    });
  });
}

// Init V5 - DB-based PC Control
initChatSession();

async function startMaster() {
  await initControlTable();
  const activePC = await getActivePC();

  if (activePC !== LOCAL_PC_NAME) {
    // Otra PC es la activa — empezar en modo dormido
    console.log(`💤 [${LOCAL_PC_NAME}] La DB dice que ${activePC} es la activa. Entrando en modo espera...`);
    startDBWatcher();
    return;
  }

  // Esta PC es la activa — arrancar polling
  enforceSingleInstance().then(() => {
    bot.startPolling();
    console.log(`🚀 Antigravity V5 [${LOCAL_PC_NAME}] [ACTIVO] — Controlado por DB`);
  });
  startDBWatcher();
}

function startDBWatcher() {
  watchForActivation(
    LOCAL_PC_NAME,
    3000, // Revisar DB cada 3 segundos
    async () => {
      console.log(`⚡ [${LOCAL_PC_NAME}] DB: Activando polling...`);
      activePCName = LOCAL_PC_NAME;
      initChatSession();
      enforceSingleInstance().then(() => {
        if (!bot.isPolling()) bot.startPolling();
      });
    },
    async () => {
      // Esta PC debe dormirse
      if (bot.isPolling()) {
        console.log(`💤 [${LOCAL_PC_NAME}] DB: Deteniendo polling...`);
        await bot.stopPolling();
      }
    }
  );
}

startMaster();

async function sendChunkedMessage(chatId: number, text: string) {
  const MAX_LENGTH = 4000;
  if (text.length <= MAX_LENGTH) {
    await bot.sendMessage(chatId, text, { parse_mode: 'Markdown' });
    return;
  }
  for (let i = 0; i < text.length; i += MAX_LENGTH) {
    await bot.sendMessage(chatId, text.slice(i, i + MAX_LENGTH));
  }
}

// ----------------------------------------------------
// UI KEYBOARDS GENERATION
// ----------------------------------------------------
function getSkillsKeyboard() {
  const skillsPath = path.join(__dirname, '.agent', 'skills');
  let inlineKeyboard: any[] = [];
  try {
      if (fs.existsSync(skillsPath)) {
        const skillsDirs = fs.readdirSync(skillsPath, {withFileTypes: true})
                       .filter(d => d.isDirectory() && !d.name.startsWith('.'))
                       .map(d => d.name)
                       .sort();
                       
        for(let i=0; i<skillsDirs.length; i+=2) {
           const row = [];
           const s1 = skillsDirs[i];
           const mark1 = activeSkills.includes(s1) ? '✅' : '🧊';
           row.push({ text: `${mark1} ${s1.substring(0,22)}`, callback_data: `skill_${s1.substring(0,40)}` });
           
           const s2 = skillsDirs[i+1];
           if(s2) {
               const mark2 = activeSkills.includes(s2) ? '✅' : '🧊';
               row.push({ text: `${mark2} ${s2.substring(0,22)}`, callback_data: `skill_${s2.substring(0,40)}` });
           }
           inlineKeyboard.push(row);
        }
      } else {
        inlineKeyboard.push([{text: 'No se encontraron skills', callback_data: 'none'}]);
      }
  } catch(e) {}
  
  if (activeSkills.length > 0) {
      inlineKeyboard.push([{ text: '🧹 Deseleccionar Todo', callback_data: 'skillclear_all' }]);
  }

  return { inline_keyboard: inlineKeyboard };
}

function getMainMenu() {
  const pcLabel = `💻 PC: ${activePCName} (local)`;
  return {
    reply_markup: {
      keyboard: [
        [{ text: '📍 Ver Contexto Actual' }, { text: '📂 Archivos del Proyecto' }],
        [{ text: '🎭 Gestionar Skills (Múltiples)' }, { text: '🔀 Switch PC' }],
        [{ text: pcLabel }]
      ],
      resize_keyboard: true,
      persistent: true
    }
  };
}

bot.onText(/\/start|\/menu/, async (msg) => {
  if (msg.from?.id.toString() !== allowedUserId) return;
  await bot.sendMessage(
    msg.chat.id, 
    `⚡ *Antigravity V5 — Multi-PC*\n\n💻 Controlando: *${activePCName}*\nEstado: 🏠 Local`, 
    { parse_mode: 'Markdown', ...getMainMenu() }
  );
});

bot.onText(/\/reset/, async (msg) => {
  if (msg.from?.id.toString() !== allowedUserId) return;
  if (fs.existsSync(path.join(currentCwd, '.antigravity_history.json'))) {
      fs.unlinkSync(path.join(currentCwd, '.antigravity_history.json'));
  }
  initChatSession();
  await bot.sendMessage(msg.chat.id, '🧠 Memoria formateada. He olvidado todo el contexto previo.');
});

bot.onText(/\/cd (.+)/, async (msg, match) => {
  if (msg.from?.id.toString() !== allowedUserId) return;
  const newPath = match?.[1] || '';
  if (fs.existsSync(newPath)) {
      currentCwd = newPath;
      initChatSession();
      await bot.sendMessage(msg.chat.id, `✅ Contexto cambiado a: \`${currentCwd}\``, {parse_mode: 'Markdown'});
  } else {
      await bot.sendMessage(msg.chat.id, `❌ Error: La ruta no existe.`, {parse_mode: 'Markdown'});
  }
});

// ----------------------------------------------------
// HANDLERS (CALLBACKS & TEXT)
// ----------------------------------------------------
bot.on('callback_query', async (query) => {
  const chatId = query.message?.chat.id;
  if (!chatId || query.from.id.toString() !== allowedUserId) return;

  if (query.data && query.data.startsWith('cd_')) {
    const folderName = query.data.replace('cd_', '');
    const newPath = path.join('C:\\Billy\\Asisteme\\AAAProyectos\\AAAntigravity', folderName);
    if (fs.existsSync(newPath)) {
        currentCwd = newPath;
        initChatSession();
        await bot.editMessageText(`✅ Saltaste al proyecto: **${folderName}**.\n*Ruta:* \`${currentCwd}\`\n\n_La memoria del bot ha sido limpiada._`, {
            chat_id: chatId, message_id: query.message?.message_id, parse_mode: 'Markdown'
        });
    }
  }

  // V5 Switch PC handler (DB relay)
  if (query.data && query.data.startsWith('switchpc_')) {
    const parts = query.data.replace('switchpc_', '').split('___');
    const newPCName = parts[0];
    const newPCIp   = parts[1] === 'local' ? null : parts[1];

    // Activar esta misma PC
    if (!newPCIp) {
      await setActivePC(LOCAL_PC_NAME);
      activePCName = LOCAL_PC_NAME;
      activePCIp   = null;
      if (!bot.isPolling()) bot.startPolling();
      await bot.editMessageText(`✅ *${LOCAL_PC_NAME} activada*`, {
        chat_id: chatId, message_id: query.message?.message_id, parse_mode: 'Markdown'
      });
      await bot.sendMessage(chatId, `💻 *PC Activa: ${LOCAL_PC_NAME}*`, { parse_mode: 'Markdown', ...getMainMenu() });
      return;
    }

    // Activar otra PC: escribir en DB y parar polling local.
    // El agente en la otra PC lee la DB cada 3s y arranca automaticamente.
    await bot.editMessageText(`🔀 Activando *${newPCName}* via DB...`, {
      chat_id: chatId, message_id: query.message?.message_id, parse_mode: 'Markdown'
    });

    await setActivePC(newPCName, LOCAL_PC_NAME);
    activePCName = newPCName;
    activePCIp   = newPCIp;
    await bot.stopPolling();
    console.log(`🔀 DB actualizada: ${newPCName} es ahora la activa.`);

    await bot.editMessageText(
      `🔀 *${newPCName}* activada via DB\n\n⏳ Tomara el control en ~3 segundos.\n_Requiere \'agent.ts\' corriendo en esa PC._`,
      { chat_id: chatId, message_id: query.message?.message_id, parse_mode: 'Markdown' }
    );
    return;
  }



  // V4 Multiple Skill handling
  if (query.data && query.data.startsWith('skill_')) {
    const skillName = query.data.replace('skill_', '');
    if (activeSkills.includes(skillName)) {
        activeSkills = activeSkills.filter(s => s !== skillName);
    } else {
        activeSkills.push(skillName);
    }
    
    compileSkillsPrompt();
    initChatSession();
    
    await bot.editMessageReplyMarkup(getSkillsKeyboard(), {
      chat_id: chatId, message_id: query.message?.message_id
    });
  }

  if (query.data === 'skillclear_all') {
    activeSkills = [];
    compileSkillsPrompt();
    initChatSession();
    await bot.editMessageReplyMarkup(getSkillsKeyboard(), {
      chat_id: chatId, message_id: query.message?.message_id
    });
  }
});

bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from?.id.toString();
  const text = msg.text;

  if (userId !== allowedUserId) return;
  if (!text || text.startsWith('/') || text.startsWith('🛑')) return;

  const currentRoleStr = activeSkills.length > 0 ? activeSkills.join(', ') : "Ninguna (Modo God)";

  if (text === '📍 Ver Contexto Actual') {
    const rootPath = 'C:\\Billy\\Asisteme\\AAAProyectos\\AAAntigravity';
    let inlineKeyboard: any[] = [];
    try {
      const dirs = fs.readdirSync(rootPath, {withFileTypes: true})
                     .filter(d => d.isDirectory() && !d.name.includes('node_modules') && !d.name.startsWith('.'))
                     .map(d => d.name)
                     .sort();
                     
      for(let i=0; i<dirs.length; i+=2) {
         const row = [];
         row.push({ text: `📁 ${dirs[i].substring(0,25)}`, callback_data: `cd_${dirs[i].substring(0,50)}` });
         if(dirs[i+1]) row.push({ text: `📁 ${dirs[i+1].substring(0,25)}`, callback_data: `cd_${dirs[i+1].substring(0,50)}` });
         inlineKeyboard.push(row);
      }
    } catch(e) {}
    
    await bot.sendMessage(chatId, `📍 **CONTEXTO V4**\n\n📁 **Proyecto Actual:** \`${currentCwd}\`\n🎭 **Skills Activas:** \`${currentRoleStr}\`\n\n👇 _Toca un proyecto para entrar:_`, {parse_mode: 'Markdown', reply_markup: { inline_keyboard: inlineKeyboard }});
    return;
  }
  
  if (text === '📂 Archivos del Proyecto') {
    try {
      const { stdout } = await execAsync('Get-ChildItem -Name | Select-Object -First 30', { cwd: currentCwd, shell: 'powershell.exe' });
      const files = stdout.trim() ? stdout : '(Carpeta vacía)';
      await sendChunkedMessage(chatId, `📂 **Archivos en ${path.basename(currentCwd)} (Top 30):**\n\`\`\`text\n${files}\n\`\`\``);
    } catch(e: any) { await bot.sendMessage(chatId, e.message); }
    return;
  }

  if (text === '🎭 Gestionar Skills (Múltiples)') {
    await bot.sendMessage(chatId, '*Bóveda de Skills*\nToca las skills para activarlas [✅] o desactivarlas [🧊]. El agente recordará TODAS las skills que marques:', { parse_mode: 'Markdown', reply_markup: getSkillsKeyboard() });
    return;
  }

  if (text === '🔀 Switch PC') {
    const pcs = getPCList();
    const keyboard = pcs.map(pc => [{
      text: `${pc.name === activePCName ? '✅' : '🖥'} ${pc.name}${pc.ip ? ` (${pc.ip})` : ' (esta PC)'}`,
      callback_data: `switchpc_${pc.name}___${pc.ip || 'local'}`
    }]);
    await bot.sendMessage(chatId, '🔀 *Selecciona la PC a controlar:*', {
      parse_mode: 'Markdown',
      reply_markup: { inline_keyboard: keyboard }
    });
    return;
  }

  // AI Router
  try {
    const shortRole = activeSkills.length > 0 ? `${activeSkills.length} skills` : 'Generalista';
    const pcTag = activePCIp ? `[${activePCName}]` : '[local]';
    const statusMsg = await bot.sendMessage(chatId, `💭 _${pcTag} [${shortRole}] Pensando..._`, { parse_mode: 'Markdown' });
    let response = await chatHistory.sendMessage(text);
    let functionCall = response.response.functionCalls()?.[0];
    
    let loopCount = 0;
    while (functionCall && functionCall.name === "run_powershell_command" && loopCount < 5) {
        loopCount++;
        const cmdArgs = functionCall.args as { command: string };
        const theCommand = cmdArgs.command;
        const totalMax = 5;
        const progressPerc = Math.round((loopCount / totalMax) * 100);
        const filled = Math.floor((loopCount / totalMax) * 10);
        const bar = "█".repeat(filled) + "░".repeat(10 - filled);

        await bot.editMessageText(`🛠️ [${shortRole}] Trabajando...\n\n🚀 Progreso: ${progressPerc}% [${bar}]\n⚙️ Paso Activo: ${loopCount} (Max. ${totalMax})\n\n🕹️ Comando en RAM:\n\`\`\`powershell\n${theCommand.substring(0, 300)}...\n\`\`\``, { chat_id: chatId, message_id: statusMsg.message_id, parse_mode: "Markdown" });
        
        let execResult = "";
        try {
            if (activePCIp) {
                // Ejecutar remotamente en el agente esclavo
                execResult = await proxyToAgent(activePCIp, theCommand, currentCwd);
            } else {
                // Ejecutar localmente
                const { stdout, stderr } = await execAsync(theCommand, { cwd: currentCwd, shell: 'powershell.exe' });
                execResult = stdout || stderr || "Ejecución completada.";
            }
        } catch (err: any) {
            execResult = "Error ejecutando comando: " + err.message;
            console.error(`[EXEC ERROR]: ${execResult}`);
        }

        await bot.editMessageText(`🔄 [${shortRole}] Evaluando salida (Paso ${loopCount})...`, { chat_id: chatId, message_id: statusMsg.message_id });
        
        response = await chatHistory.sendMessage([{
            functionResponse: { name: "run_powershell_command", response: { result: execResult } }
        }]);
        functionCall = response.response.functionCalls()?.[0];
    }

    const cleanText = response.response.text();
    if (cleanText) {
        await bot.editMessageText(cleanText, { chat_id: chatId, message_id: statusMsg.message_id });
    } else {
        await bot.editMessageText("✅ Tarea completada sin comentarios adicionales.", { chat_id: chatId, message_id: statusMsg.message_id });
    }

    // Persistir Memoria RAM en disco al finalizar todos los pasos
    try {
        const historyData = await chatHistory.getHistory();
        fs.writeFileSync(path.join(currentCwd, '.antigravity_history.json'), JSON.stringify(historyData, null, 2));
    } catch(e) {}

  } catch (error: any) {
    console.error("[BOT ERROR]", error); // Ojo en consola
    let briefError = error?.message?.split('\\n')?.[0]?.substring(0, 150) || "Error desconocido";
    // Ocultar path completo para que se vea limpio en el telefono
    briefError = briefError.split(currentCwd).join('.\\');
    await bot.sendMessage(chatId, `❌ Error:\n${briefError}...`);
  }
});

bot.onText(/🛑 Apagar Bot/, async (msg) => {
  if (msg.from?.id.toString() !== process.env.TELEGRAM_USER_ID) return;
  await bot.sendMessage(msg.chat.id, '💤 Botón de apagado presionado (ignorado temporal).', {reply_markup: {remove_keyboard: true}});
  // process.exit(0);
});

function getLocalIP(): string {
  const interfaces = os.networkInterfaces();
  for (const iface of Object.values(interfaces)) {
    if (!iface) continue;
    for (const config of iface) {
      if (config.family === 'IPv4' && !config.internal) {
        return config.address;
      }
    }
  }
  return '127.0.0.1';
}
