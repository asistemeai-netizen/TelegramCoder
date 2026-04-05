# Este script configura WinRM para permitir la ejecución remota de comandos de forma segura con HTTPS.

# 1. Generar un certificado autofirmado para el localhost.
$cert = New-SelfSignedCertificate -DnsName $env:COMPUTERNAME -CertStoreLocation Cert:\LocalMachine\My -FriendlyName "WinRM_SelfSigned_Cert"

# Obtener el Thumbprint del certificado recién creado.
$certThumbprint = $cert.Thumbprint

# 2. Habilitar WinRM y configurar el oyente HTTPS (puerto 5986).
# Esto también abre el puerto de firewall por defecto para WinRM (5986 para HTTPS).
winrm quickconfig -transport:https -q

# 3. Configurar el servicio WinRM para que se inicie automáticamente.
Set-Service winrm -StartupType Automatic

# 4. Eliminar el oyente HTTP existente si lo hubiera (para mayor seguridad).
Get-Item WSMan:\localhost\Listener\* | Where-Object { $_.Keys -contains "Port" -and $_.Port -eq "5985" } | Remove-Item -Force -ErrorAction SilentlyContinue

# 5. Crear o actualizar el oyente HTTPS y vincular el certificado.
# Eliminar cualquier oyente HTTPS existente para evitar conflictos.
Get-Item WSMan:\localhost\Listener\* | Where-Object { $_.Keys -contains "Port" -and $_.Port -eq "5986" } | Remove-Item -Force -ErrorAction SilentlyContinue

# Crear el nuevo oyente HTTPS con el certificado.
New-Item -Path WSMan:\localhost\Listener -Credential "$([System.Management.Automation.PSCredential]::Empty)" -Force -Port 5986 -Transport HTTPS -CertificateThumbprint $certThumbprint

# Asegurarse de que el firewall tiene una regla para el puerto 5986.
# WinRM quickconfig -transport:https debería haberla creado, pero lo verificamos.
if (-not (Get-NetFirewallRule -DisplayName "Windows Remote Management (HTTPS-In)" -ErrorAction SilentlyContinue)) {
    New-NetFirewallRule -DisplayName "Windows Remote Management (HTTPS-In)" -Direction Inbound -LocalPort 5986 -Protocol TCP -Action Allow -Enabled True
}

# Configurar TrustedHosts. '*'' permite conectar desde cualquier máquina, pero con HTTPS y autenticación NTLM, es más seguro.
Set-Item WSMan:\localhost\Client\TrustedHosts -Value "*" -Force

# Deshabilitar AllowUnencrypted si estaba habilitado para HTTP.
Set-Item WSMan:\localhost\Service\AllowUnencrypted -Value $False -Force -ErrorAction SilentlyContinue

# Asegurar que Basic Auth no esté habilitado por defecto si no es necesario.
Set-Item WSMan:\localhost\Service\Auth\Basic -Value $False -Force -ErrorAction SilentlyContinue

Write-Host "Configuración segura de WinRM completada con HTTPS y certificado autofirmado."
Write-Host "El servicio está escuchando en el puerto 5986 (HTTPS)."
Write-Host "Este certificado autofirmado es adecuado para entornos de prueba, pero para producción, considere un certificado de una CA confiable."
