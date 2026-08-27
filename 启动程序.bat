@echo off
cd /d "%~dp0"
echo Starting LanDisk...
if exist "node_modules\electron\dist\electron.exe" (
    start "" "node_modules\electron\dist\electron.exe" .
    exit /b 0
)
start "" npm start
exit /b 0
