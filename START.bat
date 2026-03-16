@echo off
title Universal AI Translator
color 0A

echo.
echo  ========================================
echo   Universal AI Translator - Starting up
echo  ========================================
echo.

:: Check Node.js
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo  [ERROR] Node.js not found!
    echo  Please install Node.js from https://nodejs.org
    pause
    exit /b 1
)

:: Install dependencies if node_modules missing
if not exist "node_modules" (
    echo  Installing dependencies...
    call npm install
    if %errorlevel% neq 0 (
        echo  [ERROR] npm install failed.
        pause
        exit /b 1
    )
)

:: Create data directory if missing
if not exist "data" mkdir data
if not exist "data\uploads" mkdir data\uploads

:: Launch Electron desktop app
echo  Launching desktop app...
echo.
node_modules\.bin\electron.cmd .

pause
