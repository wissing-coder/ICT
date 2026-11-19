@echo off
setlocal
where node >nul 2>&1
if errorlevel 1 (
  echo Node.js is required. Install Node.js 24 and open this file again.
  pause
  exit /b 1
)
node "%~dp0server.mjs" --open
if errorlevel 1 pause
