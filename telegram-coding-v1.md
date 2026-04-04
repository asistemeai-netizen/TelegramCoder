# Telegram Remote Programming (MVP v1)

## Goal
Permitir al desarrollador continuar programando de forma remota a través de Telegram usando el agente bajo demanda. Se orquestarán comandos, llamadas MCP y de sistema desde la interfaz móvil, con retroalimentación inmediata, y sin costo de arquitectura adicional.

## Tasks
- [ ] Task 1: Crear el servicio de Telegram (Polling) en el monorepo (ej. en `packages/ai` o como un script de entrada en la raíz). → Verify: El script conecta exitosamente con Telegram, verifica whitelist de ID de usuario y lee un mensaje de prueba.
- [ ] Task 2: Integrar el motor de Antigravity (AI Service Orchestrator). Conectar la entrada de Telegram al flujo de entrada estándar o al despachador de IA, dándole contexto del entorno actual. → Verify: Una orden vía Telegram (ej. "evalúa 1+1") es comprendida y retorna acción.
- [ ] Task 3: Establecer el canal de Feedback (Stdout/Stderr a Telegram). → Verify: La salida de los agentes (textos, logs de terminal) se fragmenta (<4096 caracteres) y se envía de vuelta a Telegram limpiamente.
- [ ] Task 4: Crear el comando predefinido bajo demanda (`npm run dev:telegram` o un script `start_telegram.bat`). → Verify: Correr el script en el PC activa el puente; cerrarlo (`Ctrl+C`) apaga por completo el servicio.

## Done When
- [ ] [ ] El servicio se inicia con un comando desde el PC.
- [ ] [ ] Como usuario, envío "Crea un archivo temporal llamado hola.txt en el root con un texto de prueba" vía Telegram.
- [ ] [ ] El agente recibe el mensaje, crea el archivo en tu disco local usando sus herramientas, y recibo una confirmación en Telegram con el log de lo que hizo.
- [ ] [ ] El proceso solo existe "On-Demand" sin costos ocultos de servidores 24/7.

## Notes
- Se usará Long-Polling para evitar Webhooks o abrir puertos ("Ngrok", etc).
- Es imperativa la validación del "User ID" de Telegram para evitar que un intruso envíe código a tu PC.
