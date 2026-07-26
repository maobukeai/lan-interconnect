# 以管理员身份创建软链接
$SourcePath = "c:\Users\20269\Desktop\局域网互联"
$TargetPath = "C:\LanDisk"

# 检查是否已存在
if (Test-Path $TargetPath) {
    Write-Host "目标路径已存在：$TargetPath" -ForegroundColor Yellow
} else {
    # 尝试创建软链接
    try {
        cmd /c "mklink /D `"$TargetPath`" `"$SourcePath`"" | Out-Null
        if ($LASTEXITCODE -eq 0) {
            Write-Host "✓ 软链接创建成功！" -ForegroundColor Green
            Write-Host "  源路径：$SourcePath"
            Write-Host "  目标：$TargetPath"
        } else {
            Write-Host "✗ 创建失败，请以管理员身份运行此脚本" -ForegroundColor Red
        }
    } catch {
        Write-Host "✗ 错误：$_" -ForegroundColor Red
    }
}

Write-Host ""
Write-Host "按任意键继续..."
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
