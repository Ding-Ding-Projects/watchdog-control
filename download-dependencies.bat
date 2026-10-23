@echo off
setlocal
set "SILENT_SWITCH="
if /i "%~1"=="/s" set "SILENT_SWITCH=-Silent"
if /i "%~1"=="--silent" set "SILENT_SWITCH=-Silent"
if /i "%SILENT%"=="1" set "SILENT_SWITCH=-Silent"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\download-dependencies.ps1" %SILENT_SWITCH%
set "DEPENDENCY_EXIT=%ERRORLEVEL%"
endlocal & exit /b %DEPENDENCY_EXIT%
