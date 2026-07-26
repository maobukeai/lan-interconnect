@echo off
chcp 65001 >nul
cls
echo.
echo ========================================
echo   局域网互联 Mobile - 一键打包 APK
echo ========================================
echo.
echo  正在检查环境...
echo.

REM 检查 Node.js
node --version >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo [错误] 未检测到 Node.js
    echo 请先安装 Node.js: https://nodejs.org/
    pause
    exit /b 1
)
echo [✓] Node.js 已安装

REM 检查 Java
java -version >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo [错误] 未检测到 Java JDK
    echo 请先安装 JDK 17 或更高版本
    pause
    exit /b 1
)
echo [✓] Java 已安装

REM 检查路径是否包含中文
set "CURRENT_PATH=%cd%"
echo "%CURRENT_PATH%" | findstr /C:"局域网" >nul
if %ERRORLEVEL% equ 0 (
    echo.
    echo [警告] 检测到路径包含中文字符！
    echo [方案] 创建临时英文链接进行编译...
    echo.
    
    set "TARGET_DIR=C:\LanDisk_Temp"
    if exist "%TARGET_DIR%" (
        echo [信息] 使用已存在的链接：%TARGET_DIR%
    ) else (
        cmd /c mklink /D "%TARGET_DIR%" "%~dp0.." >nul 2>&1
        if !ERRORLEVEL! equ 0 (
            echo [✓] 软链接创建成功：%TARGET_DIR%
        ) else (
            echo [错误] 无法创建软链接
            echo.
            echo 请右键点击此脚本 - "以管理员身份运行"
            echo 或者手动执行：mklink /D C:\LanDisk_Temp "%~dp0.."
            pause
            exit /b 1
        )
    )
    
    cd /d "%TARGET_DIR%\mobile\LanDiskMobile"
) else (
    cd /d "%~dp0LanDiskMobile"
)

echo.
echo 当前工作目录：%cd%
echo.
echo [1/4] 清理旧文件...
call npx react-native clean >nul 2>&1
cd android
call gradlew clean >nul 2>&1

echo [2/4] 安装依赖...
call npm install --legacy-peer-deps >nul 2>&1

echo [3/4] 编译 Android 项目...
echo       首次编译需要 5-10 分钟，请耐心等待...
echo.
call gradlew assembleDebug --console=plain

echo.
echo [4/4] 检查输出...
echo.

cd ..
if exist "android\app\build\outputs\apk\debug\app-debug.apk" (
    echo ========================================
    echo   ✓ APK 打包成功！
    echo ========================================
    echo.
    echo  文件位置:
    echo  %CD%\android\app\build\outputs\apk\debug\app-debug.apk
    echo.
    echo  文件大小:
    for %%A in ("android\app\build\outputs\apk\debug\app-debug.apk") do echo  %%~zA 字节
    echo.
    
    choice /C YN /M "是否打开 APK 所在文件夹"
    if ERRORLEVEL 1 explorer %CD%\android\app\build\outputs\apk\debug
    
    echo.
    echo 下一步:
    echo  1. 将 APK 传输到手机
    echo  2. 在手机上安装并运行
    echo  3. 测试各项功能
    echo.
) else (
    echo ========================================
    echo   ✗ APK 打包失败
    echo ========================================
    echo.
    echo 请检查上方的错误信息
    echo.
    echo 常见问题:
    echo  1. 未安装 Android Studio
    echo  2. SDK 路径配置错误
    echo  3. 网络连接问题（Gradle 下载失败）
    echo.
    echo 解决方案请参考 "打包安装指南.md"
)

echo ========================================
pause
