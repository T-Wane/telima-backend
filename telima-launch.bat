@echo off
cd /d "%~dp0"
powershell -ExecutionPolicy Bypass -File "%~dp0\telima-launch.ps1"
pause
