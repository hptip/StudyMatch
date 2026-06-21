@echo off
cd /d "%~dp0backend"
if not exist "node_modules" npm install
echo.
echo StudyMatch dang khoi dong...
echo Mo trinh duyet: http://localhost:3000
echo.
node server.js
pause
