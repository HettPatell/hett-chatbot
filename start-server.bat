@echo off
title Hett Localhost Server
echo ===================================================
echo   Starting Hett Localhost Server...
echo ===================================================
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0server.ps1"
pause
