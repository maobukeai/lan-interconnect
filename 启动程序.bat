@echo off
cd /d "%~dp0"
echo Starting LanDisk...
if exist "src-tauri\target\release\lan-disk.exe" (
    start "" "src-tauri\target\release\lan-disk.exe"
    exit /b 0
)
echo [LanDisk] 未找到 release 编译产物，正在以开发模式启动...
start "" npm start
exit /b 0
