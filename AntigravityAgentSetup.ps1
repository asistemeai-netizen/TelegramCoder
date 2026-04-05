# Este script configura WinRM para permitir la ejecución remota de comandos.
# Se recomienda usar HTTPS y certificados para entornos de producción.

# Habilitar WinRM y configurar el oyente.
# Esto también abre el puerto de firewall por defecto para WinRM (5985 para HTTP).
winrm quickconfig -q

# Configurar el servicio WinRM para que se inicie automáticamente.
Set-Service winrm -StartupType Automatic

# Permitir comunicaciones no cifradas (¡solo para pruebas! Se recomienda usar HTTPS en producción).
Set-Item WSMan:\localhost\Service\AllowUnencrypted -Value $True

# Habilitar autenticación básica (¡solo para pruebas! Se recomienda Kerberos o NTLM en producción).
Set-Item WSMan:\localhost\Service\Auth\Basic -Value $True

# Configurar las reglas de cliente para permitir la conexión a cualquier host.
Set-Item WSMan:\localhost\Client\TrustedHosts -Value "*"

# Habilitar PSRemoting (esto es más una configuración de cliente, pero asegura que todo esté listo).
Enable-PSRemoting -Force

Write-Host "Configuración de WinRM completada. El servicio está escuchando en el puerto 5985 (HTTP)."
Write-Host "ADVERTENCIA: Se han habilitado comunicaciones no cifradas y autenticación básica."
Write-Host "Esto es INSEGURO para entornos de producción y debe ser configurado con HTTPS y autenticación más fuerte."
