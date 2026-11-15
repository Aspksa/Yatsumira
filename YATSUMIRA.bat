@echo off
setlocal EnableExtensions DisableDelayedExpansion
title YATSUMIRA
pushd "%~dp0" || exit /b 1
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\start.ps1"
set "result=%errorlevel%"
popd
if not "%result%"=="0" (
    echo.
    echo YATSUMIRA startup failed. Exit code: %result%
    pause
)
endlocal & exit /b %result%
