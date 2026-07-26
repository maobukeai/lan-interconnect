@echo off
chcp 65001 >nul
echo ========================================
echo 局域网互联 Pro - 启动程序
echo ========================================
echo.

cd /d "%~dp0"

if exist "release\win-unpacked\局域网互联 Pro.exe" (
    echo 正在启动...
    start "" "release\win-unpacked\局域网互联 Pro.exe"
    echo 程序已启动！
) else if exist "局域网互联 Pro.exe" (
    echo 正在启动...
    start "" "局域网互联 Pro.exe"
    echo 程序已启动！
) else (
    echo 错误：找不到可执行文件！
    echo 请先运行构建脚本生成程序。
    pause
    exit /b 1
)

echo.
echo ========================================
