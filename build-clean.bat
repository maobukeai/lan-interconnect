@echo off
echo ========================================
echo 局域网互联 Pro - 清洁构建脚本
echo ========================================
echo.

echo [1/4] 停止所有可能的 Electron 进程...
taskkill /F /IM electron.exe >nul 2>&1
taskkill /F /FI "WINDOWTITLE eq *Electron*" >nul 2>&1
timeout /t 2 /nobreak >nul

echo [2/4] 清理旧的构建产物...
if exist dist (
    echo 删除旧的 dist 目录...
    rmdir /s /q dist
)
if exist dist_backup (
    rmdir /s /q dist_backup
)
timeout /t 1 /nobreak >nul

echo [3/4] 清理 npm 缓存...
call npm cache clean --force >nul 2>&1
timeout /t 1 /nobreak >nul

echo [4/4] 开始构建...
echo.
call npm run build

echo.
echo ========================================
if %ERRORLEVEL% EQU 0 (
    echo 构建成功！
    echo 输出目录：dist\
) else (
    echo 构建失败，请检查错误信息
)
echo ========================================
pause
