@echo off
title Universal Translator — Build Electron App
color 0B

echo.
echo  ========================================
echo   Building Universal Translator
echo  ========================================
echo.

:: Check Node / npm
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo  [ERROR] Node.js not found. Install from https://nodejs.org
    pause & exit /b 1
)

:: Install dependencies
echo  [1/2] Installing dependencies...
call npm install
if %errorlevel% neq 0 ( echo  [ERROR] npm install failed. & pause & exit /b 1 )

:: Build portable exe
echo  [2/2] Building portable EXE...
set CSC_IDENTITY_AUTO_DISCOVERY=false
call npx electron-builder --win portable

if %errorlevel% neq 0 (
    echo  [ERROR] Build failed.
    pause & exit /b 1
)

echo.
echo  ========================================
echo   Done!
echo   EXE:  dist-electron\universal-translator.exe
echo.
echo   Double-click the EXE to launch the app.
echo   It opens in its own window — no browser needed.
echo  ========================================
echo.
pause
