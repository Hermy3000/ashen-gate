@echo off
cd /d "%~dp0"
if not exist node_modules (
  echo Installing dependencies...
  call npm install
)
echo Starting Ashen Gate on http://localhost:8090
npm run dev
pause
