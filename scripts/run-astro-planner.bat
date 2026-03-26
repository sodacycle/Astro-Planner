@echo off
setlocal

REM Get the directory where this script is located
set SCRIPT_DIR=%~dp0

REM Move to the project root (one level up from scripts/)
cd /d "%SCRIPT_DIR%\.."

REM Move into the src folder where astro.html lives
cd src

REM Start Python server in background on port 8000 (no new window)
start /b python -m http.server 8000

REM Wait a moment for the server to start
timeout /t 2 >nul

REM Open the default browser to the dashboard
start "" http://localhost:8000/astro.html