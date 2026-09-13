@echo off
chcp 65001 >nul
cd /d "%~dp0"
title 猫步互联 Pro 启动器

echo ==================================================
echo   正在启动 猫步互联 Pro...
echo ==================================================

:: 清理可能残留的死锁或孤儿后台进程，确保窗口创建不受阻
taskkill /f /im lan-disk.exe >nul 2>&1
taskkill /f /im lan-disk-server.exe >nul 2>&1
taskkill /f /im LanDisk-Pro*.exe >nul 2>&1

:: 优先启动 Release 最新编译产物
if exist "src-tauri\target\release\lan-disk.exe" (
    echo [LanDisk] 启动 Release 客户端...
    start "" "src-tauri\target\release\lan-disk.exe"
    exit /b 0
)

:: 其次动态启动 dist_output 中最新的便携版
for /f "delims=" %%f in ('dir /b /o-d "dist_output\LanDisk-Pro-*-Portable.exe" 2^>nul') do (
    echo [LanDisk] 启动最新便携版: %%f...
    start "" "dist_output\%%f"
    exit /b 0
)

:: 若未编译则以开发模式启动
echo [LanDisk] 未找到 release 编译产物，正在以开发模式启动...
start "" npm start
exit /b 0
