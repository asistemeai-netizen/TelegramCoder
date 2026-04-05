// agent.ts - Antigravity Slave Agent
// Corre en las PCs secundarias. Escucha comandos del Maestro por red local.
// NO se conecta a Telegram. Solo ejecuta comandos y devuelve resultados.
import * as http from 'http';
import * as dotenv from 'dotenv';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as os from 'os';

dotenv.config();

const execAsync = promisify(exec);
const AGENT_PORT = parseInt(process.env.AGENT_PORT || '4910');
const AGENT_SECRET = process.env.AGENT_SECRET || 'antigravity-secret';
const PC_NAME = process.env.PC_NAME || os.hostname();

const server = http.createServer(async (req, res) => {
  // CORS + JSON headers
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');

  // Health check
  if (req.method === 'GET' && req.url === '/ping') {
    res.writeHead(200);
    res.end(JSON.stringify({ status: 'online', pc: PC_NAME, cwd: process.cwd() }));
    return;
  }

  // Validate secret key
  const secret = req.headers['x-agent-secret'];
  if (secret !== AGENT_SECRET) {
    res.writeHead(401);
    res.end(JSON.stringify({ error: 'Unauthorized' }));
    return;
  }

  // Execute command
  if (req.method === 'POST' && req.url === '/run') {
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', async () => {
      try {
        const { command, cwd } = JSON.parse(body);
        if (!command) {
          res.writeHead(400);
          res.end(JSON.stringify({ error: 'No command provided' }));
          return;
        }
        
        const workDir = cwd || process.cwd();
        console.log(`[AGENT] Executing: ${command} in ${workDir}`);
        
        const { stdout, stderr } = await execAsync(command, {
          cwd: workDir,
          shell: 'powershell.exe',
          timeout: 60000 // 60s timeout
        });
        
        const output = stdout || stderr || 'Comando ejecutado sin salida.';
        res.writeHead(200);
        res.end(JSON.stringify({ success: true, output, pc: PC_NAME }));
      } catch (err: any) {
        res.writeHead(200); // Return 200 so master gets the error message
        res.end(JSON.stringify({ 
          success: false, 
          output: `Error: ${err.message?.substring(0, 500) || 'Error desconocido'}`,
          pc: PC_NAME 
        }));
      }
    });
    return;
  }

  res.writeHead(404);
  res.end(JSON.stringify({ error: 'Not found' }));
});

server.listen(AGENT_PORT, '0.0.0.0', () => {
  console.log(`\n🤖 ANTIGRAVITY AGENT - ${PC_NAME}`);
  console.log(`✅ Escuchando en puerto ${AGENT_PORT}`);
  console.log(`🌐 IP Local: ${getLocalIP()}`);
  console.log(`🔑 Secreto configurado: ${AGENT_SECRET !== 'antigravity-secret' ? '✅' : '⚠️  Usando secreto por defecto'}`);
  console.log(`\nEsta PC está lista para recibir comandos del Maestro Antigravity.\n`);
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
