# Kill electron processes launched by this project only (match dev-electron path fragment)
$procs = Get-CimInstance Win32_Process -Filter "Name='electron.exe'"
foreach ($p in $procs) {
    $cmd = $p.CommandLine
    if ($cmd -and $cmd -like '*node_modules\electron*') {
        Write-Output ("KILL " + $p.ProcessId)
        Stop-Process -Id $p.ProcessId -Force -ErrorAction SilentlyContinue
    }
}
