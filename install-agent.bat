@echo off
:: =====================================================
:: Antigravity Agent Installer - PC Esclava
:: Instala el agente como servicio oculto de Windows
:: =====================================================
title Antigravity Agent Setup

echo.
echo  ====================================
echo   ANTIGRAVITY AGENT INSTALLER V5
echo  ====================================
echo.

:: Verificar Node.js
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Node.js no esta instalado. Descargalo en https://nodejs.org
    pause
    exit /b 1
)

:: Verificar que estamos en la carpeta correcta
if not exist "agent.ts" (
    echo [ERROR] Ejecuta este script desde la carpeta del proyecto Antigravity.
    pause
    exit /b 1
)

:: Pedir nombre de esta PC
set /p PC_NAME="Nombre de esta PC (ej: BillyLaptop): "
if "%PC_NAME%"=="" set PC_NAME=%COMPUTERNAME%

:: Pedir secreto compartido
set /p AGENT_SECRET="Secreto compartido (debe coincidir con la PC Maestro): "
if "%AGENT_SECRET%"=="" set AGENT_SECRET=antigravity-secret

:: Instalar dependencias si hace falta
echo.
echo [INFO] Instalando dependencias...
call npm install --silent

:: Crear .env del agente si no existe
if not exist ".env.agent" (
    echo PC_NAME=%PC_NAME% > .env.agent
    echo AGENT_PORT=4910 >> .env.agent
    echo AGENT_SECRET=%AGENT_SECRET% >> .env.agent
    echo [OK] Archivo .env.agent creado.
) else (
    echo [INFO] .env.agent ya existe, no se sobreescribe.
)

:: Instalar pm2 si no esta
pm2 --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [INFO] Instalando PM2 (process manager)...
    call npm install -g pm2 --silent
)

:: Detener instancia previa si existe
pm2 delete antigravity-agent >nul 2>&1

:: Iniciar el agente con PM2 usando las variables del .env.agent
echo.
echo [INFO] Iniciando agente como proceso en background...
for /f "tokens=*" %%a in (.env.agent) do set %%a
pm2 start "npx tsx agent.ts" --name "antigravity-agent" --env .env.agent

:: Guardar para que sobreviva reinicios
pm2 save

:: Configurar autostart en Windows
pm2 startup

echo.
echo  ====================================
echo   AGENTE INSTALADO Y CORRIENDO
echo  ====================================
echo.

:: Detectar IP local
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /i "IPv4.*192"') do (
    set LOCAL_IP=%%a
    set LOCAL_IP=!LOCAL_IP: =!
)
echo  Nombre de esta PC: %PC_NAME%
echo  Puerto del Agente: 4910
echo.
echo  En tu PC MAESTRO, agrega esta linea al .env:
echo  PC_LIST=%PC_NAME%:[IP-DE-ESTA-PC]
echo.
echo  (Reemplaza [IP-DE-ESTA-PC] con la IP de esta maquina en tu red WiFi)
echo  Para ver tu IP: ipconfig ^| findstr IPv4
echo.
pause
