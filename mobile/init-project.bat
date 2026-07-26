@echo off
chcp 65001 >nul
echo ========================================
echo 局域网互联 Mobile - React Native 项目初始化
echo ========================================
echo.

cd /d "%~dp0"

echo [1/4] 检查 Node.js 环境...
node --version >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo 错误：未检测到 Node.js，请先安装 Node.js LTS 版本
    echo 下载地址：https://nodejs.org/
    pause
    exit /b 1
)
echo ✓ Node.js 已安装

echo.
echo [2/4] 创建 React Native 项目...
echo 注意：首次创建需要下载依赖，可能需要几分钟
echo.

npx @react-native-community/cli@latest init LanDiskMobile --version 0.74.0 --pm npm

if not exist "LanDiskMobile" (
    echo 错误：项目创建失败
    pause
    exit /b 1
)

cd LanDiskMobile

echo.
echo [3/4] 安装额外依赖...
call npm install @react-navigation/native @react-navigation/bottom-tabs @react-navigation/drawer react-native-screens react-native-safe-area-context

call npm install @reduxjs/toolkit react-redux axios

call npm install react-native-paper react-native-vector-icons

call npm install react-native-fs react-native-document-picker react-native-permissions react-native-device-info

call npm install react-native-vision-camera react-native-qrcode-svg react-native-svg

call npm install event-source-polyfill

call npm install react-hook-form zod date-fns lodash react-native-fast-image

echo.
echo [4/4] 安装开发依赖...
call npm install --save-dev @types/react @types/lodash typescript jest @testing-library/react-native

echo.
echo ========================================
echo ✓ 项目初始化完成！
echo ========================================
echo.
echo 项目位置：%CD%
echo.
echo 下一步:
echo 1. 使用 Android Studio 打开 android 目录
echo 2. 运行 npx react-native run-android 启动应用
echo 3. 参考 ../android 开发计划.md 继续开发
echo.
pause
