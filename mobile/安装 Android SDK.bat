@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion

echo ========================================
echo   Android SDK 快速安装工具
echo ========================================
echo.

:: 检查是否已安装 Android Studio
if exist "C:\Program Files\Android\Android Studio" (
    echo [✓] 检测到 Android Studio
    set "SDK_ROOT=C:\Users\%USERNAME%\AppData\Local\Android\Sdk"
    goto :configure
)

:: 检查常见 SDK 位置
if exist "C:\Users\%USERNAME%\AppData\Local\Android\Sdk" (
    echo [✓] 检测到 Android SDK
    set "SDK_ROOT=C:\Users\%USERNAME%\AppData\Local\Android\Sdk"
    goto :configure
)

echo [信息] 未找到 Android SDK
echo.
echo ========================================
echo   需要安装 Android SDK
echo ========================================
echo.
echo 请选择安装方式:
echo.
echo 1. 下载并安装 Android Studio（推荐，约 2GB）
echo    网址：https://developer.android.google.cn/studio
echo.
echo 2. 仅安装 Command Line Tools（轻量，约 500MB）
echo    网址：https://dl.google.com/android/repository/commandlinetools-win-11076708_latest.zip
echo.
echo 3. 我已经安装了，帮我配置环境变量
echo.
choice /C 123 /M "请输入选项 (1-3)"

if ERRORLEVEL 3 goto :configure_only
if ERRORLEVEL 2 goto :install_cmdline
if ERRORLEVEL 1 goto :install_studio

:install_studio
echo.
echo 正在打开下载页面...
start https://developer.android.google.cn/studio
echo.
echo ✓ 已在浏览器中打开下载页面
echo.
echo 安装步骤:
echo 1. 下载并运行安装程序
echo 2. 选择默认安装路径
echo 3. 安装完成后重新启动此脚本进行配置
echo.
pause
exit /b

:install_cmdline
echo.
echo 正在打开下载页面...
start https://dl.google.com/android/repository/commandlinetools-win-11076708_latest.zip
echo.
echo ✓ 已开始下载命令行工具
echo.
echo 安装步骤:
echo 1. 下载完成后解压到 C:\Android\cmdline-tools\
echo 2. 以管理员身份运行 CMD
echo 3. 执行：sdkmanager --install "platforms;android-34" "build-tools;34.0.0"
echo 4. 重新启动此脚本进行配置
echo.
pause
exit /b

:configure_only
echo.

:configure
echo ========================================
echo   配置 SDK 路径
echo ========================================
echo.
echo 当前检测到的 SDK 路径:
echo %SDK_ROOT%
echo.

:: 验证 SDK 是否存在
if not exist "%SDK_ROOT%\platforms\android-34" (
    echo [警告] 未找到 Android SDK Platform 34
    echo.
    echo 请先通过 Android Studio 或 sdkmanager 安装:
    echo - Android SDK Platform 34
    echo - Build-Tools 34.0.0
    echo.
    pause
    exit /b 1
)

:: 设置环境变量（当前会话）
set "ANDROID_HOME=%SDK_ROOT%"
setx ANDROID_HOME "%SDK_ROOT%" /M >nul 2>&1
echo [✓] 已设置 ANDROID_HOME = %SDK_ROOT%

:: 创建 local.properties
set "PROJECT_DIR=%~dp0..\..\Desktop\LanDisk_Build\LanDiskMobile"
if exist "%PROJECT_DIR%\android" (
    echo sdk.dir=%SDK_ROOT:\=\\% > "%PROJECT_DIR%\android\local.properties"
    echo [✓] 已创建 local.properties
)

echo.
echo ========================================
echo   配置完成！
echo ========================================
echo.
echo 现在可以编译 APK 了:
echo.
echo cd %PROJECT_DIR%
echo npm run build:apk
echo.

choice /C YN /M "是否现在开始编译"
if ERRORLEVEL 1 (
    cd /d "%PROJECT_DIR%"
    call npm run build:apk
) else (
    echo.
    echo 您可以稍后手动运行上述命令
)

pause
