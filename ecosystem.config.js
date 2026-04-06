// ecosystem.config.js — PM2 Configuration for Antigravity Multi-PC
// 
// LAPTOP (BillyLaptop):   pm2 start ecosystem.config.js --only antigravity-agent
// BILLYAGENTIC (Maestro): pm2 start ecosystem.config.js --only antigravity-master

module.exports = {
  apps: [
    // ── Maestro (BillyAgentic - corre index.ts) ──────────────
    {
      name: 'antigravity-master',
      script: 'agent.ts',           // <-- cambiar a 'index.ts' en BillyAgentic
      interpreter: 'tsx',
      interpreter_args: '',
      cwd: __dirname,
      env_file: '.env',
      watch: false,
      autorestart: true,
      max_restarts: 10,
      restart_delay: 3000,
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      error_file: './logs/master-error.log',
      out_file: './logs/master-out.log',
      merge_logs: true,
    },

    // ── Agente (BillyLaptop - corre agent.ts) ────────────────
    {
      name: 'antigravity-agent',
      script: 'agent.ts',
      interpreter: 'tsx',
      interpreter_args: '',
      cwd: __dirname,
      env_file: '.env',
      watch: false,
      autorestart: true,
      max_restarts: 10,
      restart_delay: 3000,
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      error_file: './logs/agent-error.log',
      out_file: './logs/agent-out.log',
      merge_logs: true,
    },
  ],
};
