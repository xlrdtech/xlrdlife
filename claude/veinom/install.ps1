# =============================================================
#  VEINOM · one-command installer (Windows / PowerShell)
#  Run:  irm https://hitthe.link/claude/veinom/install.ps1 | iex
# =============================================================
$ErrorActionPreference = "Stop"
$VEINOM = "$env:USERPROFILE\.veinom"
$EXT    = "$VEINOM\extension"
$AVA    = "$VEINOM\ava"

Write-Host ""
Write-Host "  VEINOM  ·  Voice OS Avatar installer" -ForegroundColor Green
Write-Host "  ----------------------------------------------" -ForegroundColor DarkGreen

# 1. Python check
$py = (Get-Command python -ErrorAction SilentlyContinue).Source
if (-not $py) { $py = (Get-Command python3 -ErrorAction SilentlyContinue).Source }
if (-not $py) {
  Write-Host "  ! Python not found. Install from python.org, then re-run." -ForegroundColor Yellow
  return
}
Write-Host "  + python: $py"

# 2. Ava voice dependencies
Write-Host "  > installing Ava voice engine (edge-tts + aiohttp)..."
& $py -m pip install --quiet --upgrade edge-tts aiohttp 2>&1 | Out-Null
Write-Host "  + Ava voice engine ready"

# 3. Fetch the Ava server + extension zip
New-Item -ItemType Directory -Force -Path $AVA, $EXT | Out-Null
Write-Host "  > downloading components..."
Invoke-WebRequest "https://hitthe.link/claude/veinom/ava-server.py" -OutFile "$AVA\ava-server.py" -UseBasicParsing
Invoke-WebRequest "https://hitthe.link/veinom/extension/veinom.zip" -OutFile "$EXT\veinom.zip" -UseBasicParsing
Expand-Archive -Path "$EXT\veinom.zip" -DestinationPath $EXT -Force
Write-Host "  + components downloaded to $VEINOM"

# 4. Auto-start the Ava server on login (HKCU Run + Startup shortcut)
$run = "`"$py`" `"$AVA\ava-server.py`""
Set-ItemProperty -Path "HKCU:\Software\Microsoft\Windows\CurrentVersion\Run" -Name "VeinomAva" -Value $run -ErrorAction SilentlyContinue
Write-Host "  + Ava auto-start registered (HKCU Run)"

# 5. Start Ava now (detached, minimized)
Start-Process -WindowStyle Hidden -FilePath $py -ArgumentList "`"$AVA\ava-server.py`""
Start-Sleep -Seconds 2
try {
  $h = Invoke-RestMethod "http://localhost:7723/health" -TimeoutSec 4
  if ($h -eq "ok") { Write-Host "  + Ava server LIVE on http://localhost:7723" -ForegroundColor Green }
} catch { Write-Host "  ~ Ava server starting (give it a moment)" -ForegroundColor Yellow }

# 6. Finish · tell the user the one manual click (Chrome blocks programmatic ext-load)
Write-Host ""
Write-Host "  DONE. One click left:" -ForegroundColor Green
Write-Host "  ----------------------------------------------" -ForegroundColor DarkGreen
Write-Host "  1. Open  chrome://extensions/"
Write-Host "  2. Toggle 'Developer mode' (top-right)"
Write-Host "  3. Click 'Load unpacked' -> select:"
Write-Host "       $EXT" -ForegroundColor Cyan
Write-Host "  4. Visit any AI chat + click Start on the VEINOM panel"
Write-Host ""
Write-Host "  Or skip the extension entirely — open the web app:" -ForegroundColor DarkGreen
Write-Host "       https://hitthe.link/claude/veinom/app/" -ForegroundColor Cyan
Write-Host ""
Start-Process "chrome://extensions/"
Start-Process "https://hitthe.link/claude/veinom/app/"
