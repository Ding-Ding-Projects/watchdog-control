@echo off
setlocal
call "%~dp0download-dependencies.bat" --silent
set "DEPENDENCY_EXIT=%ERRORLEVEL%"
if not "%DEPENDENCY_EXIT%"=="0" goto :failed
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\build.ps1"
set "BUILD_EXIT=%ERRORLEVEL%"
endlocal & exit /b %BUILD_EXIT%

:failed
endlocal & exit /b %DEPENDENCY_EXIT%
