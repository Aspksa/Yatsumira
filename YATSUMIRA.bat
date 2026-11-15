@echo off
setlocal EnableExtensions
chcp 65001 >nul
title YATSUMIRA AI
cd /d "%~dp0"

if exist ".venv\Scripts\python.exe" (
    ".venv\Scripts\python.exe" "main.py"
    goto finish
)

where py >nul 2>&1
if not errorlevel 1 (
    py -3 "main.py"
    goto finish
)

where python >nul 2>&1
if not errorlevel 1 (
    python "main.py"
    goto finish
)

echo [YATSUMIRA] Python 3 not found.
goto finish

:finish
if errorlevel 1 echo [YATSUMIRA] Startup failed.
endlocal
