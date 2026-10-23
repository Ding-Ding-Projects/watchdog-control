@echo off
setlocal
set "HOST_MODE=%~1"
if /i "%HOST_MODE%"=="--detached" goto :run
if /i "%HOST_MODE%"=="--logs" goto :run
if /i "%HOST_MODE%"=="--stop" goto :run
if not "%HOST_MODE%"=="" goto :usage

echo Watchdog Control host actions
echo   [D] Start or update the service and return after health checks
echo   [L] Open the live log and status view
echo   [S] Stop the Watchdog Control service
echo   [Q] Exit without changing the service
echo No selection in 8 seconds starts or updates the service.
choice /c DLSQ /t 8 /d D /n /m "Choose D, L, S, or Q: "
if errorlevel 4 goto :exit_menu
if errorlevel 3 goto :select_stop
if errorlevel 2 goto :select_logs
set "HOST_MODE=--detached"
goto :run

:select_stop
set "HOST_MODE=--stop"
goto :run

:select_logs
set "HOST_MODE=--logs"
goto :run

:exit_menu
endlocal & exit /b 0

:run
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\host.ps1" -Mode "%HOST_MODE%"
set "HOST_EXIT=%ERRORLEVEL%"
endlocal & exit /b %HOST_EXIT%

:usage
echo Usage: host.bat [--detached^|--logs^|--stop]
endlocal & exit /b 2
