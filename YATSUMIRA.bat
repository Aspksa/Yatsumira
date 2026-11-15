@echo off
setlocal EnableExtensions
title YATSUMIRA
cd /d "%~dp0"

where npm.cmd >nul 2>&1
if errorlevel 1 (
    echo Node.js and npm are required. Install from https://nodejs.org/
    pause
    exit /b 1
)

if not exist "node_modules\vite\bin\vite.js" (
    call npm.cmd install
    if errorlevel 1 (
        echo Failed to install dependencies.
        pause
        exit /b 1
    )
)

call npm.cmd run dev
if errorlevel 1 pause
endlocal
