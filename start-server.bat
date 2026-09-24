@echo off
title Hett Chatbot Host with MCP
cd /d "%~dp0"
echo Starting Hett Chatbot & Local MCP Server...
powershell -NoProfile -ExecutionPolicy Bypass -File run_host.ps1
pause
