@echo off
rem dsh-glass-weather mount wrapper: bypasses the script execution policy.
rem   usage: mount-profile.cmd [profile] [extra args]     (default profile: desktop)
setlocal
set PROFILE=%1
if "%PROFILE%"=="" set PROFILE=desktop
set SCRIPT=%~dp0mount-profile.ps1
where pwsh >nul 2>nul
if %ERRORLEVEL%==0 (
  pwsh -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT%" -Profile %PROFILE% %2 %3 %4
) else (
  powershell -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT%" -Profile %PROFILE% %2 %3 %4
)
endlocal
