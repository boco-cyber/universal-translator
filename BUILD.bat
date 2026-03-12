@echo off
title Universal AI Translator — Build EXE
color 0B

echo.
echo  ========================================
echo   Building Universal AI Translator EXE
echo  ========================================
echo.

:: Check Node / npm
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo  [ERROR] Node.js not found. Install from https://nodejs.org
    pause & exit /b 1
)

:: Install dependencies
echo  [1/4] Installing project dependencies...
call npm install
if %errorlevel% neq 0 ( echo  [ERROR] npm install failed. & pause & exit /b 1 )

:: Install pkg globally if not present
echo  [2/4] Checking for pkg bundler...
call pkg --version >nul 2>&1
if %errorlevel% neq 0 (
    echo  Installing pkg...
    call npm install -g pkg
)

:: Bundle
echo  [3/4] Bundling into standalone EXE...
call pkg . --targets node18-win-x64 --output dist\universal-translator.exe --compress GZip

if %errorlevel% neq 0 (
    echo.
    echo  [ERROR] Build failed.  Make sure you have enough disk space and that
    echo  pkg is installed (npm install -g pkg).
    pause & exit /b 1
)

:: Copy assets
echo  [4/4] Copying runtime assets to dist\...
if not exist dist mkdir dist
xcopy /E /I /Y data dist\data >nul 2>&1
copy /Y index.html dist\ >nul 2>&1

echo.
echo  ========================================
echo   Done!  EXE is at:  dist\universal-translator.exe
echo  ========================================
echo.
pause
