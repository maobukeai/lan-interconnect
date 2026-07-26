@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion

:: 检查管理员权限
net session >nul 2>&1
if %errorlevel% neq 0 (
    :: 不是管理员，重启为管理员
    echo 请求管理员权限...
    powershell -Command "Start-Process cmd.exe -ArgumentList '/c', '%~f0' -Verb RunAs"
    exit /b
)

:: 管理员模式运行
echo ========================================
echo   Android APK 打包工具 - 管理员模式
echo ========================================
echo.

:: 设置路径
set "SOURCE=c:\Users\20269\Desktop\局域网互联"
set "TARGET=C:\LanDisk_Temp"

:: 检查是否已存在软链接
if exist "%TARGET%\mobile\LanDiskMobile" (
    echo [✓] 使用已存在的软链接：%TARGET%
) else (
    echo [操作] 创建软链接...
    echo 源路径：%SOURCE%
    echo 目标：%TARGET%
    echo.
    
    mklink /D "%TARGET%" "%SOURCE%"
    if !errorlevel! equ 0 (
        echo [✓] 软链接创建成功！
    ) else (
        echo [错误] 创建失败
        pause
        exit /b 1
    )
)

echo.
echo ========================================
echo   开始编译 APK
echo ========================================
echo.

cd /d "%TARGET%\mobile\LanDiskMobile"
echo 当前目录：%cd%
echo.

:: 检查依赖
node --version >nul 2>&1
if errorlevel 1 (
    echo [错误] 未安装 Node.js
    pause
    exit /b 1
)

java -version >nul 2>&1
if errorlevel 1 (
    echo [错误] 未安装 Java JDK
    pause
    exit /b 1
)

echo [✓] 环境检查通过
echo.
echo [1/3] 清理旧构建...
cd android
call gradlew.bat clean --quiet
cd ..

echo.
echo [2/3] 安装依赖...
call npm install --legacy-peer-deps --quiet

echo.
echo [3/3] 编译 APK...
echo 首次编译需要 5-10 分钟，请耐心等待...
echo.

call npm run build:apk

if %errorlevel% equ 0 (
    echo.
    echo ========================================
    echo   ✓ APK 编译成功！
    echo ========================================
    echo.
    echo 文件位置：
    echo %TARGET%\mobile\LanDiskMobile\android\app\build\outputs\apk\debug\app-debug.apk
    echo.
    
    :: 复制到项目目录
    mkdir "%SOURCE%\release\android" 2>nul
    copy "%TARGET%\mobile\LanDiskMobile\android\app\build\outputs\apk\debug\app-debug.apk" "%SOURCE%\release\android\"
    
    echo 已复制到：%SOURCE%\release\android\app-debug.apk
    echo.
    
    explorer "%TARGET%\mobile\LanDiskMobile\android\app\build\outputs\apk\debug"
) else (
    echo.
    echo ✗ 编译失败，请查看上方错误信息
)

echo.
pause
