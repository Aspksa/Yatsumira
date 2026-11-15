@echo off
setlocal EnableExtensions
chcp 65001 >nul
title YATSUMIRA AI
cd /d "%~dp0"

:menu
cls
echo ==================================================
echo                  YATSUMIRA AI
echo                Eight-Tailed Kitsune
echo ==================================================
echo.
echo [1] Start Yatsumira
echo [2] Check environment
echo [0] Exit
echo.
set "choice="
set /p "choice=Select an option: "
if "%choice%"=="1" goto start
if "%choice%"=="2" goto diagnostics
if "%choice%"=="0" goto end
echo.
echo Invalid option.
pause
goto menu

:find_python
set "PYTHON="
if exist ".venv\Scripts\python.exe" (
    set "PYTHON=.venv\Scripts\python.exe"
    exit /b 0
)
py -3 --version >nul 2>&1
if not errorlevel 1 (
    set "PYTHON=py -3"
    exit /b 0
)
python --version >nul 2>&1
if not errorlevel 1 (
    set "PYTHON=python"
    exit /b 0
)
exit /b 1

:diagnostics
cls
echo [YATSUMIRA] Environment check
echo.
call :find_python
if errorlevel 1 (
    echo [ERROR] Python 3 was not found.
    echo Install Python 3 from https://www.python.org/
) else (
    echo [OK] Python:
    %PYTHON% --version
)
if exist "main.py" (
    echo [OK] main.py found.
) else if exist "src\main.py" (
    echo [OK] src\main.py found.
) else (
    echo [INFO] AI core not added yet: main.py or src\main.py
)
if defined OPENAI_API_KEY (
    echo [OK] OPENAI_API_KEY environment variable is set.
) else (
    echo [INFO] OPENAI_API_KEY is not set.
)
echo.
pause
goto menu

:start
cls
echo [YATSUMIRA] Initializing...
call :find_python
if errorlevel 1 (
    echo [ERROR] Python 3 is required.
    echo Download: https://www.python.org/
    pause
    goto menu
)
if exist "main.py" (
    %PYTHON% "main.py"
    goto finished
)
if exist "src\main.py" (
    %PYTHON% "src\main.py"
    goto finished
)
echo [INFO] Launcher is ready. AI core has not been created yet.
echo [NEXT] Add main.py to activate Yatsumira.
pause
goto menu

:finished
echo.
echo [YATSUMIRA] Process finished.
pause
goto menu

:end
endlocal
exit /b 0
