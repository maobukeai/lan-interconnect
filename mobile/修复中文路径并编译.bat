@echo off
chcp 65001 >nul
echo ========================================
echo   修复中文路径问题并编译 APK
echo ========================================
echo.

REM 检查当前路径
set "CURRENT_PATH=%cd%"
echo 当前路径：%CURRENT_PATH%
echo.

REM 检测是否包含中文
echo "%CURRENT_PATH%" | findstr /C:"局域网" >nul
if %errorlevel% equ 0 (
    echo [警告] 检测到路径包含中文字符！
    echo.
    echo React Native 无法在中文路径下编译，需要将项目移动到英文路径。
    echo.
    echo 建议操作：
    echo 1. 将整个项目复制到英文路径，例如：
    echo    C:\Projects\LanDisk\
    echo    D:\Dev\LanDisk\
    echo.
    echo 2. 或者在当前目录创建英文软链接：
    echo    mklink /D C:\LanDisk "%CURRENT_PATH%\.."
    echo.
    pause
) else (
    echo [成功] 路径不包含中文，开始编译...
    echo.
    cd /d "%~dp0LanDiskMobile"
    call npm run build:apk
    if %errorlevel% equ 0 (
        echo.
        echo ========================================
        echo   APK 编译成功！
        echo   位置：android\app\build\outputs\apk\debug\app-debug.apk
        echo ========================================
    ) else (
        echo.
        echo [错误] 编译失败，请检查错误信息
    )
    pause
)
