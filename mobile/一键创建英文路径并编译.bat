@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion

echo ========================================
echo   一键创建英文路径并编译 APK
echo ========================================
echo.

REM 获取当前目录的父目录
set "PARENT_DIR=%~dp0.."
set "ENGLISH_LINK=C:\LanDisk"

echo 步骤 1: 检查是否已存在英文链接...
if exist "%ENGLISH_LINK%" (
    echo [信息] 已存在链接：%ENGLISH_LINK%
    echo 指向：!LINK_TARGET!
) else (
    echo [操作] 创建英文软链接...
    echo 源路径：%PARENT_DIR%
    echo 目标链接：%ENGLISH_LINK%
    echo.
    
    REM 尝试创建软链接（需要管理员权限）
    mklink /D "%ENGLISH_LINK%" "%PARENT_DIR%" >nul 2>&1
    if !errorlevel! equ 0 (
        echo [成功] 软链接创建成功！
    ) else (
        echo [失败] 无法创建软链接（可能需要管理员权限）
        echo.
        echo 请手动执行以下命令（以管理员身份运行 CMD）：
        echo mklink /D C:\LanDisk "%PARENT_DIR%"
        echo.
        pause
        goto :manual_build
    )
)

echo.
echo 步骤 2: 进入英文路径并编译...
cd /d "%ENGLISH_LINK%\mobile\LanDiskMobile"
echo 当前工作目录：%cd%
echo.

call npm run build:apk

if %errorlevel% equ 0 (
    echo.
    echo ========================================
    echo   APK 编译成功！
    echo   位置：android\app\build\outputs\apk\debug\app-debug.apk
    echo ========================================
    echo.
    echo 您可以直接安装此 APK 进行测试
) else (
    echo.
    echo [错误] 编译失败
    echo 请检查上方的错误信息
)

pause
exit /b

:manual_build
echo.
echo 手动编译模式：
echo 1. 将项目文件夹重命名为英文，例如：C:\Projects\LanDisk
echo 2. 然后运行以下命令：
echo    cd C:\Projects\LanDisk\mobile\LanDiskMobile
echo    npm run build:apk
echo.
pause
