@echo off
setlocal
call "%~dp0build.bat"
set "BUILD_EXIT=%ERRORLEVEL%"
if not "%BUILD_EXIT%"=="0" goto :build_failed
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\package-installer.ps1"
set "PACKAGE_EXIT=%ERRORLEVEL%"
endlocal & exit /b %PACKAGE_EXIT%

:build_failed
endlocal & exit /b %BUILD_EXIT%
