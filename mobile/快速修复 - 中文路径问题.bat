@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion

echo ========================================
echo   快速修复：创建英文路径并编译
echo ========================================
echo.

REM 设置路径
set "SOURCE_DIR=c:\Users\20269\Desktop\局域网互联"
set "TARGET_DIR=C:\LanDisk"

echo [步骤 1] 检查目标位置...
if exist "%TARGET_DIR%" (
    echo 已存在路径：%TARGET_DIR%
    echo 将直接使用该路径进行编译
    goto :build
) else (
    echo 目标路径不存在，尝试创建软链接...
)

echo.
echo [步骤 2] 创建软链接...
echo 源目录：%SOURCE_DIR%
echo 链接到：%TARGET_DIR%
echo.
echo 注意：此操作需要管理员权限
echo.

REM 尝试创建软链接
mklink /D "%TARGET_DIR%" "%SOURCE_DIR%" >nul 2>&1
if !errorlevel! equ 0 (
    echo [成功] 软链接创建成功！
    goto :build
) else (
    echo [失败] 无法创建软链接
    echo.
    echo ========================================
    echo   解决方案
    echo ========================================
    echo.
    echo 方法 1: 以管理员身份重新运行此脚本
    echo   右键点击 - "以管理员身份运行"
    echo.
    echo 方法 2: 手动创建（管理员 CMD）
    echo   mklink /D C:\LanDisk "%SOURCE_DIR%"
    echo.
    echo 方法 3: 移动项目到英文路径
    echo   将整个文件夹移动到 C:\Projects\LanDisk\
    echo.
    pause
    exit /b 1
)

:build
echo.
echo [步骤 3] 开始编译 APK...
cd /d "%TARGET_DIR%\mobile\LanDiskMobile"
echo 当前目录：%cd%
echo.

call npm run build:apk

if %errorlevel% equ 0 (
    echo.
    echo ========================================
    echo   ✓ 编译成功！
    echo ========================================
    echo.
    echo APK 文件位置：
    echo %TARGET_DIR%\mobile\LanDiskMobile\android\app\build\outputs\apk\debug\app-debug.apk
    echo.
    echo 可以将此 APK 安装到手机进行测试
    echo.
) else (
    echo.
    echo ========================================
    echo   ✗ 编译失败
    echo ========================================
    echo.
    echo 请查看上方的错误信息
    echo 常见原因：
    echo - 缺少 Java JDK 17+
    echo - 缺少 Android SDK
    echo - 网络连接问题
    echo.
)

pause
