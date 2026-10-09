@echo off
REM Glow Assistant — auto-start Vite dev server after login
cd /d "%~dp0.."
where npm >nul 2>&1
if errorlevel 1 (
  echo npm not found in PATH. Install Node.js first.
  pause
  exit /b 1
)

REM Avoid duplicate servers on the same port
powershell -NoProfile -Command "try { $c = Get-NetTCPConnection -LocalPort 1420 -State Listen -ErrorAction Stop; if ($c) { exit 2 } } catch { exit 0 }"
if errorlevel 2 (
  exit /b 0
)

set "LOG_DIR=%LOCALAPPDATA%\GlowAI\logs"
if not exist "%LOG_DIR%" mkdir "%LOG_DIR%" >nul 2>&1
npm run dev >> "%LOG_DIR%\dev-server.log" 2>&1
