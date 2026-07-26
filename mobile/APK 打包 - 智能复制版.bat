@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion

echo ========================================
echo   Android APK 一键打包（智能版）
echo ========================================
echo.

:: 设置路径
set "DESKTOP_DIR=%USERPROFILE%\Desktop"
set "TEMP_ENGLISH_DIR=%DESKTOP_DIR%\LanDisk_Build"
set "SOURCE_DIR=%DESKTOP_DIR%\局域网互联"

echo [信息] 检测到项目路径包含中文，使用临时英文目录编译
echo.

:: 检查是否已存在
if exist "%TEMP_ENGLISH_DIR%\mobile\LanDiskMobile" (
    echo [✓] 使用已存在的临时目录：%TEMP_ENGLISH_DIR%
    goto :build
)

:: 创建临时目录
echo [操作] 创建临时英文目录...
mkdir "%TEMP_ENGLISH_DIR%" 2>nul

:: 复制必要文件（只复制需要的，节省时间）
echo [操作] 复制项目文件到临时目录...
echo       这可能需要几分钟...
echo.

xcopy "%SOURCE_DIR%\mobile\LanDiskMobile" "%TEMP_ENGLISH_DIR%\mobile\LanDiskMobile" /E /I /Q /Y >nul
xcopy "%SOURCE_DIR%\mobile\package.json" "%TEMP_ENGLISH_DIR%\mobile\" /Y >nul
xcopy "%SOURCE_DIR%\mobile\tsconfig.json" "%TEMP_ENGLISH_DIR%\mobile\" /Y >nul

if !errorlevel! equ 0 (
    echo [✓] 文件复制完成
) else (
    echo [错误] 复制失败
    pause
    exit /b 1
)

:build
echo.
echo ========================================
echo   开始编译 APK
echo ========================================
echo.

cd /d "%TEMP_ENGLISH_DIR%\mobile\LanDiskMobile"
echo 当前目录：%cd%
echo.

:: 环境检查
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

:: 开始编译
echo [1/3] 清理旧构建...
if exist "android\gradle" (
    cd android
    call gradlew.bat clean --quiet
    cd ..
)

echo [2/3] 安装依赖...
call npm install --legacy-peer-deps --quiet

echo [3/3] 编译 APK...
echo       首次编译需要 5-10 分钟，请耐心等待...
echo.

call npm run build:apk

if %errorlevel% equ 0 (
    goto :success
) else (
    goto :failed
)

:success
echo.
echo ========================================
echo   ✓ APK 编译成功！
echo ========================================
echo.

:: 复制回原始目录
mkdir "%SOURCE_DIR%\release\android" 2>nul
copy "%TEMP_ENGLISH_DIR%\mobile\LanDiskMobile\android\app\build\outputs\apk\debug\app-debug.apk" "%SOURCE_DIR%\release\android\" >nul

echo APK 文件位置：
echo %SOURCE_DIR%\release\android\app-debug.apk
echo.

:: 打开文件夹
explorer "%SOURCE_DIR%\release\android"

echo.
echo ✓ 已完成！您可以关闭此窗口
echo.
pause
exit /b 0

:failed
echo.
echo ========================================
echo   ✗ 编译失败
echo ========================================
echo.
echo 请查看上方的错误信息
echo.
echo 常见原因：
echo 1. 缺少 Java JDK 17+
echo 2. 缺少 Android SDK
echo 3. 网络连接问题
echo.
pause
exit /b 1
