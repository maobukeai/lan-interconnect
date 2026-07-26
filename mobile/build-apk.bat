@echo off
chcp 65001 >nul
echo ========================================
echo 局域网互联 Mobile - APK 打包工具
echo ========================================
echo.

cd /d "%~dp0LanDiskMobile"

echo [1/3] 清理旧的构建文件...
call npx react-native clean 2>nul
cd android
call gradlew clean 2>nul
cd ..

echo.
echo [2/3] 安装依赖...
call npm install

echo.
echo [3/3] 开始编译 Debug APK...
cd android
call gradlew assembleDebug

echo.
echo ========================================
if exist "app\build\outputs\apk\debug\app-debug.apk" (
    echo ✓ APK 打包成功！
    echo.
    echo APK 位置：%CD%\app\build\outputs\apk\debug\app-debug.apk
    echo.
    echo 是否打开 APK 所在文件夹？(Y/N)
    set /p openFolder=
    if /i "%openFolder%"=="Y" (
        explorer %CD%\app\build\outputs\apk\debug
    )
) else (
    echo ✗ APK 打包失败
    echo 请检查上方的错误信息
)
echo ========================================
pause
