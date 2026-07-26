@echo off
chcp 65001 >nul
cls

echo.
echo ╔══════════════════════════════════════════╗
echo ║   局域网互联 - Android APK 打包工具      ║
echo ╚══════════════════════════════════════════╝
echo.
echo 📋 操作步骤
echo ════════════════════════════════════════════
echo.
echo 由于项目路径包含中文，需要创建英文环境编译
echo.
echo ✅ 推荐方案（3 步完成）:
echo.
echo  1️⃣  以管理员身份打开 PowerShell
echo      按 Win+X，选择"Windows PowerShell(管理员)"
echo.
echo  2️⃣  复制并执行以下命令:
echo.
echo      mklink /D C:\LanDisk_Temp "c:\Users\20269\Desktop\局域网互联"
echo.
echo  3️⃣  在 PowerShell 中继续执行:
echo.
echo      cd C:\LanDisk_Temp\mobile\LanDiskMobile
echo      npm run build:apk
echo.
echo ════════════════════════════════════════════
echo.
echo ⏱️  预计时间：首次 5-10 分钟，后续 1-3 分钟
echo.
echo 📦 APK 位置：
echo    c:\Users\20269\Desktop\局域网互联\release\android\app-debug.apk
echo.
echo ════════════════════════════════════════════
echo.
pause

:: 询问是否自动打开 PowerShell
choice /C YN /M "是否现在打开 PowerShell(管理员)"
if ERRORLEVEL 2 goto :end

:: 打开 PowerShell
powershell -Command "Start-Process powershell -Verb RunAs"

:end
echo.
echo ✓ 已打开 PowerShell，请按步骤操作
echo.
pause
