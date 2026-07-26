@echo off
chcp 65001 >nul
cls
echo.
echo ========================================
echo   局域网互联 Mobile - APK 打包向导
echo ========================================
echo.

cd /d "%~dp0LanDiskMobile"

echo 请选择打包方式:
echo.
echo  1. Debug 版本 (推荐 - 快速测试)
echo     - 未签名，仅用于开发测试
echo     - 编译速度快 (2-3 分钟)
echo.
echo  2. Release 版本 (正式发布)
echo     - 需要签名配置
echo     - 编译时间较长 (5-8 分钟)
echo.
echo  3. 退出
echo.
set /p choice="请输入选项 (1/2/3): "

if "%choice%"=="3" exit /b

if "%choice%"=="1" goto DEBUG
if "%choice%"=="2" goto RELEASE

echo 无效选项
pause
exit /b

:DEBUG
echo.
echo ========================================
echo  开始编译 Debug APK...
echo ========================================
echo.
echo [提示] 首次编译需要下载依赖，可能需要 5-10 分钟
echo       后续编译只需 1-2 分钟
echo.
echo 正在执行...
echo.

REM 清理
call npx react-native clean >nul 2>&1
cd android
call gradlew clean >nul 2>&1

REM 编译
echo [1/3] 安装依赖...
call npm install --legacy-peer-deps >nul 2>&1

echo [2/3] 编译 Android 项目...
echo       请稍候，这可能需要几分钟...
echo.

REM 使用批处理模式，显示进度
call gradlew assembleDebug --console=plain

echo.
echo [3/3] 检查输出...
echo.

cd ..
if exist "android\app\build\outputs\apk\debug\app-debug.apk" (
    echo ========================================
    echo   ✓✓✓ APK 打包成功！ ✓✓✓
    echo ========================================
    echo.
    echo  文件位置:
    echo  %CD%\android\app\build\outputs\apk\debug\app-debug.apk
    echo.
    
    for %%A in ("android\app\build\outputs\apk\debug\app-debug.apk") do (
        set size=%%~zA
        set /a sizemb=%%~zA/1048576
    )
    echo  文件大小：%sizemb% MB
    echo.
    
    choice /C YN /M "是否打开 APK 所在文件夹"
    if ERRORLEVEL 1 (
        explorer %CD%\android\app\build\outputs\apk\debug
    )
    
    echo.
    echo ========================================
    echo  下一步操作:
    echo ========================================
    echo.
    echo  1. 将 APK 传输到手机
    echo     - USB 数据线连接
    echo     - 微信/QQ 发送
    echo     - 局域网共享
    echo.
    echo  2. 在手机上安装
    echo     - 打开文件管理器
    echo     - 找到 APK 文件
    echo     - 点击安装（允许未知来源）
    echo.
    echo  3. 测试功能
    echo     - 扫描二维码连接电脑
    echo     - 浏览和下载文件
    echo     - 发送聊天消息
    echo     - 查看设备列表
    echo.
) else (
    echo ========================================
    echo   ✗✗✗ 打包失败 ✗✗✗
    echo ========================================
    echo.
    echo 可能的原因:
    echo  1. 未安装 Android Studio
    echo  2. Android SDK 未配置
    echo  3. 网络连接问题
    echo  4. Java 环境问题
    echo.
    echo 解决方案:
    echo  请查看 "打包安装指南.md" 文档
    echo.
)

pause

:RELEASE
echo.
echo ========================================
echo  Release 版本需要签名配置
echo ========================================
echo.
echo 请按以下步骤配置:
echo.
echo  1. 创建密钥库文件 (.keystore)
echo     keytool -genkey -v -keystore lan-disk.keystore -alias lan-disk -keyalg RSA -keysize 2048 -validity 10000
echo.
echo  2. 编辑 android/gradle.properties
echo     添加签名配置:
echo     LADISK_STORE_FILE=lan-disk.keystore
echo     LADISK_KEY_ALIAS=lan-disk
echo     LADISK_STORE_PASSWORD=你的密码
echo     LADISK_KEY_PASSWORD=你的密码
echo.
echo  3. 编辑 android/app/build.gradle
echo     添加 signingConfigs 配置
echo.
echo  4. 重新运行此脚本选择 Release
echo.
echo 详细说明请参考官方文档:
echo  https://reactnative.dev/docs/signed-apk-android
echo.
pause
