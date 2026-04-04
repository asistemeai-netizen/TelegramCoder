import TelegramBot from 'node-telegram-bot-api';
import * as dotenv from 'dotenv';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';
import { GoogleGenerativeAI, FunctionDeclaration, SchemaType } from '@google/generative-ai';

dotenv.config();

const token = process.env.TELEGRAM_BOT_TOKEN;
const allowedUserId = process.env.TELEGRAM_USER_ID;
const geminiKey = process.env.GEMINI_API_KEY;

if (!token || !allowedUserId || !geminiKey) {
  console.error('❌ Falta configuración en .env');
  process.exit(1);
}

const bot = new TelegramBot(token, { polling: true });
const execAsync = promisify(exec);
const genAI = new GoogleGenerativeAI(geminiKey);

// ----------------------------------------------------
// STATE MANAGEMENT (V4)
// ----------------------------------------------------
let currentCwd = process.cwd();
let activeSkills: string[] = []; // Multiple skills
let currentSkillPrompt = '';

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
  
  const sysInst = `Eres Antigravity Mobile (Agente Múltiple).\n📁 RUT ACTIVA: ${currentCwd}\n🎭 SKILLS: ${currentRoleStr}\n\n${currentSkillPrompt}\n\n===================================\n⚠️ DIRECTRIZ CRÍTICA DE INTERACCION PARA TELEGRAM (MÓVIL) ⚠️\nEsta regla sobrescribe cualquier otra instrucción previa:\n1. OBLIGATORIO: Tu respuesta NO PUEDE superar las 50 palabras máximas. El usuario está en celular, se ahogará en texto.\n2. COMUNÍCATE SOLO CON 2 O 3 BULLET POINTS cortos y Emojis.\n3. JAMÁS incluyes código fuente, bloques de bash o logs de errores largos en tus respuestas visuales en Telegram. Si encuentras un error o creas un archivo, solo avisa "✅ Archivo X creado" o "❌ Error en dependencia Y, lo arreglaré".\n4. Si el usuario no te pide que expongas el código explícitamente, TÚ NUNCA DEBES MOSTRARLO EN EL CHAT. Solo haz el trabajo silenciosamente mediante 'run_powershell_command' y repórtalo en 1 o 2 líneas ejecutivas.\n5. Tu tono debe ser directo, ejecutivo y minimalista.`;

  model = genAI.getGenerativeModel({
    model: 'gemini-2.5-flash',
    systemInstruction: sysInst,
    tools: [{ functionDeclarations: [runShellTool] }]
  });

  chatHistory = model.startChat({});
}
// Init V4
initChatSession();

console.log('🚀 Servicio Antigravity V4 (Omni-Skills) Iniciado...');

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

const mainMenu = {
  reply_markup: {
    keyboard: [
      [{ text: '📍 Ver Contexto Actual' }, { text: '📂 Archivos del Proyecto' }],
      [{ text: '🎭 Gestionar Skills (Múltiples)' }, { text: '🛑 Apagar Bot' }]
    ],
    resize_keyboard: true,
    persistent: true
  }
};

bot.onText(/\/start|\/menu/, async (msg) => {
  if (msg.from?.id.toString() !== allowedUserId) return;
  await bot.sendMessage(
    msg.chat.id, 
    '⚡ *Antigravity V4*\n\nAhora puedes combinar infinitas Skills al mismo tiempo y aplicarlas juntas en tus tareas.', 
    { parse_mode: 'Markdown', ...mainMenu }
  );
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

  // AI Router
  try {
    const shortRole = activeSkills.length > 0 ? `${activeSkills.length} skills` : 'Generalista';
    const statusMsg = await bot.sendMessage(chatId, `💭 _[${shortRole}] Pensando sobre ${currentCwd}..._`, { parse_mode: 'Markdown' });
    let response = await chatHistory.sendMessage(text);
    let functionCall = response.response.functionCalls()?.[0];
    
    if (functionCall && functionCall.name === "run_powershell_command") {
        const cmdArgs = functionCall.args as { command: string };
        const theCommand = cmdArgs.command;
        
        await bot.editMessageText(`🛠️ [${shortRole}] Ejecutando...\n${theCommand.substring(0, 500)}`, { chat_id: chatId, message_id: statusMsg.message_id });
        
        let execResult = "";
        try {
            const { stdout, stderr } = await execAsync(theCommand, { cwd: currentCwd });
            execResult = stdout || stderr || "Ejecución completada.";
        } catch (err: any) {
            execResult = "Error ejecutando comando: " + err.message;
        }

        await bot.editMessageText(`🔄 [${shortRole}] Evaluando salida de consola...`, { chat_id: chatId, message_id: statusMsg.message_id });
        
        const finalResponse = await chatHistory.sendMessage([{
            functionResponse: { name: "run_powershell_command", response: { result: execResult } }
        }]);

        await bot.editMessageText(finalResponse.response.text() || "✅ Listo.", { chat_id: chatId, message_id: statusMsg.message_id });

    } else {
        const cleanText = response.response.text();
        if (cleanText) {
          await bot.editMessageText(cleanText, { chat_id: chatId, message_id: statusMsg.message_id });
        }
    }

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
