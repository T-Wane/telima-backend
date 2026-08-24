# telima-launch.ps1 — Lance backend + dashboard + build APK des 2 apps
# Usage: .\telima-launch.ps1
# Ou via telima-launch.bat (double-clic)

$ErrorActionPreference = "Stop"

# --- Config ---
$FLUTTER      = "C:\Users\dev\Documents\DEV\flutter_new\bin\flutter.bat"
$BACKEND_DIR  = "c:\Users\dev\Documents\DEV\telima-backend"
$DASH_DIR     = "c:\Users\dev\Documents\DEV\telimaDashboard"
$DRIVER_DIR   = "c:\Users\dev\Documents\DEV\telima-pro"
$CLIENT_DIR   = "c:\Users\dev\Documents\DEV\telima"
$DRIVER_CFG   = "$DRIVER_DIR\lib\core\config\app_config.dart"
$CLIENT_CFG   = "$CLIENT_DIR\lib\core\constants\app_config.dart"

# --- 1. Detect LAN IP ---
Write-Host "`n=== Detection IP LAN ===" -ForegroundColor Cyan
$ip = (Get-NetIPConfiguration | Where-Object { $_.IPv4DefaultGateway -ne $null } | Select-Object -First 1).IPv4Address.IPAddress
if (-not $ip) {
    Write-Host "Erreur: impossible de detecter l'IP LAN" -ForegroundColor Red
    exit 1
}
Write-Host "IP detectee: $ip" -ForegroundColor Green

# --- 2. Update Flutter configs ---
Write-Host "`n=== Mise a jour des configs Flutter ===" -ForegroundColor Cyan

$driverContent = Get-Content $DRIVER_CFG -Raw
$driverContent = $driverContent -replace "http://[\d\.]+:3000", "http://${ip}:3000"
Set-Content $DRIVER_CFG $driverContent -NoNewline
Write-Host "  -> $DRIVER_CFG" -ForegroundColor Green

$clientContent = Get-Content $CLIENT_CFG -Raw
$clientContent = $clientContent -replace "http://[\d\.]+:3000", "http://${ip}:3000"
Set-Content $CLIENT_CFG $clientContent -NoNewline
Write-Host "  -> $CLIENT_CFG" -ForegroundColor Green

# --- 3. Kill port 3000 ---
Write-Host "`n=== Liberation port 3000 ===" -ForegroundColor Cyan
$lines = netstat -ano | Select-String ":3000.*LISTENING"
foreach ($line in $lines) {
    $parts = ($line.ToString().Trim() -split '\s+')
    $procId = $parts[$parts.Length - 1]
    if ($procId -match '^\d+$') {
        try { taskkill /PID $procId /F 2>&1 | Out-Null } catch { }
        Write-Host "  Process $procId arrete" -ForegroundColor Yellow
    }
}
Write-Host "  Port 3000 pret" -ForegroundColor Green

# --- 4. Start backend ---
Write-Host "`n=== Demarrage backend ===" -ForegroundColor Cyan
Start-Process cmd -ArgumentList "/k", "cd /d $BACKEND_DIR && npm run start:dev"
Write-Host "  Backend lance (fenetre CMD separee)" -ForegroundColor Green

# --- 5. Wait for backend ---
Write-Host "  Attente du backend..." -ForegroundColor Yellow
$ready = $false
for ($i = 0; $i -lt 45; $i++) {
    Start-Sleep -Seconds 2
    try {
        $resp = Invoke-WebRequest -Uri "http://localhost:3000/v1/health" -UseBasicParsing -TimeoutSec 5
        if ($resp.StatusCode -eq 200) { $ready = $true; break }
    } catch { }
    Write-Host "." -NoNewline
}
Write-Host ""
if (-not $ready) {
    Write-Host "  Backend non repondant apres 90s - continue quand meme" -ForegroundColor Yellow
} else {
    Write-Host "  Backend pret!" -ForegroundColor Green
}

# --- 6. Start dashboard ---
Write-Host "`n=== Demarrage dashboard ===" -ForegroundColor Cyan
Start-Process cmd -ArgumentList "/k", "cd /d $DASH_DIR && npm run dev"
Write-Host "  Dashboard lance sur http://localhost:5173" -ForegroundColor Green

# --- 7. Build APKs ---
Write-Host "`n=== Build APK app chauffeur (telima-pro) ===" -ForegroundColor Cyan
Write-Host "  Compilation en cours (release, arm64)...'" -ForegroundColor Yellow
Push-Location $DRIVER_DIR
cmd /c """$FLUTTER"" clean 2>&1"
cmd /c """$FLUTTER"" pub get 2>&1"
cmd /c """$FLUTTER"" build apk --release --split-per-abi --target-platform android-arm64 --no-pub 2>&1"
Pop-Location
$driverApk = "$DRIVER_DIR\build\app\outputs\flutter-apk\app-arm64-v8a-release.apk"
if (Test-Path $driverApk) {
    $sizeMB = [math]::Round((Get-Item $driverApk).Length / 1MB, 1)
    Write-Host "  APK chauffeur: $driverApk ($sizeMB MB)" -ForegroundColor Green
} else {
    Write-Host "  Echec build chauffeur" -ForegroundColor Red
}

Write-Host "`n=== Build APK app client (telima) ===" -ForegroundColor Cyan
Write-Host "  Compilation en cours (release, arm64)..." -ForegroundColor Yellow
Push-Location $CLIENT_DIR
cmd /c """$FLUTTER"" clean 2>&1"
cmd /c """$FLUTTER"" pub get 2>&1"
cmd /c """$FLUTTER"" build apk --release --split-per-abi --target-platform android-arm64 --no-pub 2>&1"
Pop-Location
$clientApk = "$CLIENT_DIR\build\app\outputs\flutter-apk\app-arm64-v8a-release.apk"
if (Test-Path $clientApk) {
    $sizeMB = [math]::Round((Get-Item $clientApk).Length / 1MB, 1)
    Write-Host "  APK client: $clientApk ($sizeMB MB)" -ForegroundColor Green
} else {
    Write-Host "  Echec build client" -ForegroundColor Red
}

# --- 8. Summary ---
$sep = "-" * 40
Write-Host $sep -ForegroundColor Cyan
Write-Host "  RESUME" -ForegroundColor Cyan
Write-Host $sep -ForegroundColor Cyan
Write-Host "  Backend     -> fenetre 'Telima Backend' (port 3000)" -ForegroundColor White
Write-Host "  Dashboard   -> http://localhost:5173" -ForegroundColor White
Write-Host "  IP reseau   -> $ip" -ForegroundColor White
Write-Host ""
if (Test-Path $driverApk) {
    Write-Host "  APK Chauffeur: $driverApk" -ForegroundColor Green
}
if (Test-Path $clientApk) {
    Write-Host "  APK Client:    $clientApk" -ForegroundColor Green
}
Write-Host ""
Write-Host '  Admin login: admin@telima.ml / AdminTelima2026!' -ForegroundColor Yellow
Write-Host $sep -ForegroundColor Cyan
