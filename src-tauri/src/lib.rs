use std::process::{Child, Command};
use std::sync::Mutex;
use tauri::{State, Manager};
use serde::{Deserialize, Serialize};

#[cfg(target_os = "windows")]
use std::os::windows::io::AsRawHandle;
#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;
#[cfg(target_os = "windows")]
use windows_sys::Win32::Foundation::{CloseHandle, HANDLE};
#[cfg(target_os = "windows")]
use windows_sys::Win32::System::JobObjects::{
    AssignProcessToJobObject, CreateJobObjectW, SetInformationJobObject,
    JobObjectExtendedLimitInformation, JOBOBJECT_EXTENDED_LIMIT_INFORMATION,
    JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE,
};

pub struct JobObjectGuard {
    #[cfg(target_os = "windows")]
    handle: HANDLE,
}

unsafe impl Send for JobObjectGuard {}
unsafe impl Sync for JobObjectGuard {}

impl JobObjectGuard {
    pub fn new() -> Option<Self> {
        #[cfg(target_os = "windows")]
        unsafe {
            let job = CreateJobObjectW(std::ptr::null(), std::ptr::null());
            if job.is_null() {
                return None;
            }
            let mut info: JOBOBJECT_EXTENDED_LIMIT_INFORMATION = std::mem::zeroed();
            info.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
            let res = SetInformationJobObject(
                job,
                JobObjectExtendedLimitInformation,
                &info as *const _ as *const std::ffi::c_void,
                std::mem::size_of::<JOBOBJECT_EXTENDED_LIMIT_INFORMATION>() as u32,
            );
            if res == 0 {
                CloseHandle(job);
                return None;
            }
            Some(Self { handle: job })
        }
        #[cfg(not(target_os = "windows"))]
        None
    }

    pub fn assign_process(&self, _child: &Child) -> bool {
        #[cfg(target_os = "windows")]
        unsafe {
            let handle = _child.as_raw_handle() as HANDLE;
            AssignProcessToJobObject(self.handle, handle) != 0
        }
        #[cfg(not(target_os = "windows"))]
        true
    }

    pub fn terminate(&self) {
        #[cfg(target_os = "windows")]
        unsafe {
            if !self.handle.is_null() {
                windows_sys::Win32::System::JobObjects::TerminateJobObject(self.handle, 1);
            }
        }
    }
}

impl Drop for JobObjectGuard {
    fn drop(&mut self) {
        #[cfg(target_os = "windows")]
        unsafe {
            if !self.handle.is_null() {
                CloseHandle(self.handle);
            }
        }
    }
}

#[derive(Default)]
pub struct AppState {
    pub child: Mutex<Option<Child>>,
    pub job: Mutex<Option<JobObjectGuard>>,
    pub last_server_info: Mutex<Option<StartResult>>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ServerConfig {
    pub port: Option<u16>,
    pub pin: Option<String>,
    pub mode: Option<String>,
    #[serde(rename = "customDir")]
    pub custom_dir: Option<String>,
    #[serde(rename = "bindIp")]
    pub bind_ip: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct StartResult {
    pub success: bool,
    pub port: Option<u16>,
    pub url: Option<String>,
    pub token: Option<String>,
    #[serde(rename = "fallbackFromPort")]
    pub fallback_from_port: Option<u16>,
    pub error: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
struct ReadyPayload {
    pub ip: Option<String>,
    pub port: Option<u16>,
    pub token: Option<String>,
    #[serde(rename = "fallbackFromPort")]
    pub fallback_from_port: Option<u16>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ServerStatus {
    pub running: bool,
    pub port: Option<u16>,
    pub url: Option<String>,
    pub token: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct NetworkInterfaceInfo {
    pub name: String,
    pub address: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SysInfo {
    pub cpu: String,
    #[serde(rename = "cpuUsage")]
    pub cpu_usage: u32,
    #[serde(rename = "memTotal")]
    pub mem_total: f64,
    #[serde(rename = "memFree")]
    pub mem_free: f64,
    pub platform: String,
    pub arch: String,
    #[serde(rename = "diskSpace")]
    pub disk_space: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct IpcResult {
    pub success: bool,
    pub message: Option<String>,
    pub error: Option<String>,
}

fn resolve_server_binary() -> Result<(std::path::PathBuf, Vec<String>, std::path::PathBuf), String> {
    // 1. 安装/打包运行态：检查程序同级或 binaries 目录
    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            let p1 = dir.join("lan-disk-server.exe");
            if p1.exists() {
                return Ok((p1, vec![], dir.to_path_buf()));
            }
            let p2 = dir.join("binaries").join("lan-disk-server-x86_64-pc-windows-msvc.exe");
            if p2.exists() {
                return Ok((p2, vec![], dir.to_path_buf()));
            }
        }
    }

    // 2. 本地开发与调试态：检查当前工作目录及项目结构
    if let Ok(cur) = std::env::current_dir() {
        let p1 = cur.join("src-tauri").join("binaries").join("lan-disk-server-x86_64-pc-windows-msvc.exe");
        if p1.exists() {
            return Ok((p1, vec![], cur));
        }
        let p2 = cur.join("binaries").join("lan-disk-server-x86_64-pc-windows-msvc.exe");
        if p2.exists() {
            let parent = cur.parent().unwrap_or(&cur).to_path_buf();
            return Ok((p2, vec![], parent));
        }
        // node server.js 回退
        let s1 = cur.join("server.js");
        if s1.exists() {
            return Ok((std::path::PathBuf::from("node"), vec![s1.to_string_lossy().to_string()], cur));
        }
        let s2 = cur.join("..").join("server.js");
        if s2.exists() {
            let parent = cur.parent().unwrap_or(&cur).to_path_buf();
            return Ok((std::path::PathBuf::from("node"), vec![s2.to_string_lossy().to_string()], parent));
        }
    }

    Err("未找到 lan-disk-server 服务端二进制或 node server.js".into())
}

#[tauri::command]
fn start_server(state: State<'_, AppState>, cfg: Option<ServerConfig>) -> StartResult {
    // 停止已在运行的旧子进程与旧 JobObject
    {
        let mut job_lock = state.job.lock().unwrap();
        if let Some(old_job) = job_lock.take() {
            old_job.terminate();
        }
        let mut lock = state.child.lock().unwrap();
        if let Some(mut old_child) = lock.take() {
            let _ = old_child.kill();
            let _ = old_child.wait();
        }
    }

    let (exe, base_args, cwd) = match resolve_server_binary() {
        Ok(res) => res,
        Err(e) => return StartResult {
            success: false,
            port: None,
            url: None,
            token: None,
            fallback_from_port: None,
            error: Some(e),
        },
    };

    let target_port = cfg.as_ref().and_then(|c| c.port).unwrap_or(3000);
    let mut cmd = Command::new(&exe);
    for arg in base_args {
        cmd.arg(arg);
    }
    if let Some(c) = &cfg {
        if let Some(p) = c.port {
            cmd.arg("--port").arg(p.to_string());
        }
        if let Some(pin) = &c.pin {
            if !pin.is_empty() {
                cmd.arg("--pin").arg(pin);
            }
        }
        if let Some(m) = &c.mode {
            if !m.is_empty() {
                cmd.arg("--mode").arg(m);
            }
        }
        if let Some(cd) = &c.custom_dir {
            if !cd.is_empty() {
                cmd.arg("--custom-dir").arg(cd);
            }
        }
        if let Some(b) = &c.bind_ip {
            if !b.is_empty() {
                cmd.arg("--bind-ip").arg(b);
            }
        }
    }
    cmd.current_dir(&cwd);
    cmd.stdout(std::process::Stdio::piped());
    cmd.stderr(std::process::Stdio::piped());

    #[cfg(target_os = "windows")]
    {
        cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
    }

    let mut child = match cmd.spawn() {
        Ok(c) => c,
        Err(e) => return StartResult {
            success: false,
            port: None,
            url: None,
            token: None,
            fallback_from_port: None,
            error: Some(format!("启动子进程失败: {}", e)),
        },
    };

    // 绑定至 Windows JobObject，主进程崩溃或退出时子进程绝对停稳
    let mut job_lock = state.job.lock().unwrap();
    let new_job = JobObjectGuard::new();
    if let Some(ref guard) = new_job {
        guard.assign_process(&child);
    }
    *job_lock = new_job;

    // 监听子进程 stdout 获取 [LAN_DISK_READY] 信号，并持续排空管道防止 EPIPE 崩溃
    let stdout_pipe = child.stdout.take();
    let (ready_tx, ready_rx) = std::sync::mpsc::channel();
    if let Some(pipe) = stdout_pipe {
        std::thread::spawn(move || {
            use std::io::{BufRead, BufReader};
            let reader = BufReader::new(pipe);
            let mut ready_sent = false;
            for line in reader.lines().flatten() {
                if !ready_sent {
                    if let Some(idx) = line.find("[LAN_DISK_READY]") {
                        let json_str = line[idx + "[LAN_DISK_READY]".len()..].trim();
                        let _ = ready_tx.send(json_str.to_string());
                        ready_sent = true;
                    }
                }
                log::info!("[Sidecar stdout] {}", line);
            }
        });
    }

    // 监听子进程 stderr 并持续排空，防止 4KB 管道阻塞死锁，并收集错误日志
    let stderr_pipe = child.stderr.take();
    let (err_tx, err_rx) = std::sync::mpsc::channel();
    if let Some(pipe) = stderr_pipe {
        std::thread::spawn(move || {
            use std::io::{BufRead, BufReader};
            let reader = BufReader::new(pipe);
            for line in reader.lines().flatten() {
                log::warn!("[Sidecar stderr] {}", line);
                let _ = err_tx.send(line);
            }
        });
    }

    // 等待就绪信号，超时时间 8000ms（留足首次冷启动与杀软拦截扫描耗时）
    let ready_payload: Option<ReadyPayload> = match ready_rx.recv_timeout(std::time::Duration::from_millis(8000)) {
        Ok(json_str) => serde_json::from_str(&json_str).ok(),
        Err(_) => None,
    };

    if ready_payload.is_none() {
        // 收集 stderr 错误输出
        let mut err_msg = String::new();
        while let Ok(line) = err_rx.try_recv() {
            if !err_msg.is_empty() {
                err_msg.push('\n');
            }
            err_msg.push_str(&line);
        }

        let child_status = child.try_wait().ok().flatten();
        let _ = child.kill();
        let _ = child.wait();

        let detail = if let Some(status) = child_status {
            format!("子进程异常退出 (状态: {}){}", status, if err_msg.is_empty() { String::new() } else { format!(": {}", err_msg) })
        } else if !err_msg.is_empty() {
            format!("服务端启动超时: {}", err_msg)
        } else {
            "服务端启动超时，未收到就绪信号".to_string()
        };

        return StartResult {
            success: false,
            port: None,
            url: None,
            token: None,
            fallback_from_port: None,
            error: Some(detail),
        };
    }

    let actual_port = ready_payload.as_ref().and_then(|p| p.port).unwrap_or(target_port);
    let token = ready_payload.as_ref().and_then(|p| p.token.clone()).unwrap_or_default();
    let ip = ready_payload.as_ref().and_then(|p| p.ip.clone()).unwrap_or_else(|| "127.0.0.1".into());
    let fallback = ready_payload.as_ref().and_then(|p| p.fallback_from_port);

    let res = StartResult {
        success: true,
        port: Some(actual_port),
        url: Some(format!("http://{}:{}", ip, actual_port)),
        token: Some(token),
        fallback_from_port: fallback,
        error: None,
    };

    let mut last = state.last_server_info.lock().unwrap();
    *last = Some(res.clone());

    let mut lock = state.child.lock().unwrap();
    *lock = Some(child);

    res
}

#[tauri::command]
fn stop_server(state: State<'_, AppState>) -> bool {
    let mut last = state.last_server_info.lock().unwrap();
    *last = None;
    let mut job_lock = state.job.lock().unwrap();
    if let Some(job) = job_lock.take() {
        job.terminate();
    }
    let mut lock = state.child.lock().unwrap();
    if let Some(mut child) = lock.take() {
        let _ = child.kill();
        let _ = child.wait();
        true
    } else {
        false
    }
}

#[tauri::command]
fn get_server_status(state: State<'_, AppState>) -> ServerStatus {
    let mut lock = state.child.lock().unwrap();
    let is_running = match lock.as_mut() {
        Some(child) => match child.try_wait() {
            Ok(None) => true,
            _ => false,
        },
        None => false,
    };
    if !is_running {
        *lock = None;
        let mut last = state.last_server_info.lock().unwrap();
        *last = None;
    }
    let last = state.last_server_info.lock().unwrap();
    if let Some(info) = &*last {
        ServerStatus {
            running: is_running,
            port: info.port,
            url: info.url.clone(),
            token: info.token.clone(),
        }
    } else {
        ServerStatus {
            running: is_running,
            port: None,
            url: None,
            token: None,
        }
    }
}

#[tauri::command]
fn select_folder() -> Option<String> {
    rfd::FileDialog::new()
        .pick_folder()
        .map(|p| p.to_string_lossy().to_string())
}

#[tauri::command]
fn open_path(path: String) -> IpcResult {
    let p = std::path::PathBuf::from(&path);
    if !p.exists() {
        return IpcResult {
            success: false,
            message: None,
            error: Some("路径不存在".into()),
        };
    }
    if !p.is_dir() {
        return IpcResult {
            success: false,
            message: None,
            error: Some("仅支持打开目录".into()),
        };
    }
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        let mut cmd = Command::new("explorer");
        cmd.arg(&path);
        cmd.creation_flags(0x08000000);
        match cmd.spawn() {
            Ok(_) => IpcResult { success: true, message: None, error: None },
            Err(e) => IpcResult { success: false, message: None, error: Some(e.to_string()) },
        }
    }
    #[cfg(not(target_os = "windows"))]
    {
        IpcResult { success: true, message: None, error: None }
    }
}

#[tauri::command]
fn open_root() -> IpcResult {
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        let mut cmd = Command::new("explorer");
        cmd.arg("C:\\");
        cmd.creation_flags(0x08000000);
        let _ = cmd.spawn();
    }
    IpcResult { success: true, message: None, error: None }
}

#[tauri::command]
fn open_url(url: String) -> IpcResult {
    if !url.starts_with("http://") && !url.starts_with("https://") {
        return IpcResult {
            success: false,
            message: None,
            error: Some("仅支持 http/https 链接".into()),
        };
    }
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        let mut cmd = Command::new("cmd");
        cmd.args(["/C", "start", "", &url]);
        cmd.creation_flags(0x08000000);
        match cmd.spawn() {
            Ok(_) => IpcResult { success: true, message: None, error: None },
            Err(e) => IpcResult { success: false, message: None, error: Some(e.to_string()) },
        }
    }
    #[cfg(not(target_os = "windows"))]
    {
        IpcResult { success: true, message: None, error: None }
    }
}

#[tauri::command]
fn open_firewall() -> IpcResult {
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        let mut cmd = Command::new("control");
        cmd.arg("firewall.cpl");
        cmd.creation_flags(0x08000000);
        let _ = cmd.spawn();
    }
    IpcResult { success: true, message: None, error: None }
}

#[tauri::command]
fn get_home_dir() -> String {
    std::env::var("USERPROFILE")
        .or_else(|_| std::env::var("HOME"))
        .unwrap_or_else(|_| "C:\\".into())
}

#[tauri::command]
fn get_network_info() -> Vec<NetworkInterfaceInfo> {
    let mut results = Vec::new();
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        if let Ok(output) = Command::new("cmd")
            .args(["/C", "chcp 65001 >nul && ipconfig"])
            .creation_flags(0x08000000)
            .output()
        {
            let text = String::from_utf8_lossy(&output.stdout);
            let mut current_adapter = "局域网适配器".to_string();
            for line in text.lines() {
                let trimmed = line.trim();
                if line.ends_with(':') && !line.starts_with(' ') {
                    current_adapter = line.trim_end_matches(':').trim().to_string();
                } else if trimmed.starts_with("IPv4") || trimmed.contains("IPv4 地址") || trimmed.contains("IPv4 Address") {
                    if let Some(colon_idx) = trimmed.rfind(':') {
                        let ip = trimmed[colon_idx + 1..].trim().trim_matches('(').trim_matches(')').trim();
                        if !ip.is_empty() && ip != "127.0.0.1" {
                            results.push(NetworkInterfaceInfo {
                                name: current_adapter.clone(),
                                address: ip.to_string(),
                            });
                        }
                    }
                }
            }
        }
    }
    results
}

#[tauri::command]
fn get_sys_info() -> SysInfo {
    let mut cpu = "Intel / AMD Processor".to_string();
    let mut mem_total = 16.0;
    let mut mem_free = 8.0;
    let mut disk_space = "".to_string();

    #[cfg(target_os = "windows")]
    {
        use windows_sys::Win32::System::SystemInformation::{GlobalMemoryStatusEx, MEMORYSTATUSEX};
        use windows_sys::Win32::Storage::FileSystem::GetDiskFreeSpaceExW;

        unsafe {
            let mut mem: MEMORYSTATUSEX = std::mem::zeroed();
            mem.dwLength = std::mem::size_of::<MEMORYSTATUSEX>() as u32;
            if GlobalMemoryStatusEx(&mut mem) != 0 {
                mem_total = (mem.ullTotalPhys as f64 / 1024.0 / 1024.0 / 1024.0 * 10.0).round() / 10.0;
                mem_free = (mem.ullAvailPhys as f64 / 1024.0 / 1024.0 / 1024.0 * 10.0).round() / 10.0;
            }

            let path: Vec<u16> = "C:\\\0".encode_utf16().collect();
            let mut free_bytes = 0u64;
            let mut total_bytes = 0u64;
            let mut total_free = 0u64;
            if GetDiskFreeSpaceExW(path.as_ptr(), &mut free_bytes, &mut total_bytes, &mut total_free) != 0 {
                let free_gb = (free_bytes as f64 / 1024.0 / 1024.0 / 1024.0 * 10.0).round() / 10.0;
                let total_gb = (total_bytes as f64 / 1024.0 / 1024.0 / 1024.0 * 10.0).round() / 10.0;
                disk_space = format!("{} GB 可用 / 共 {} GB", free_gb, total_gb);
            }
        }

        if let Ok(identifier) = std::env::var("PROCESSOR_IDENTIFIER") {
            cpu = identifier;
        }
    }

    SysInfo {
        cpu,
        cpu_usage: 5,
        mem_total,
        mem_free,
        platform: "win32".into(),
        arch: "x64".into(),
        disk_space,
    }
}

#[tauri::command]
fn schedule_shutdown(minutes: i64) -> IpcResult {
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        if minutes > 0 {
            let seconds = (minutes * 60).to_string();
            let status = Command::new("shutdown")
                .args(["/s", "/t", &seconds])
                .creation_flags(0x08000000)
                .status();
            match status {
                Ok(s) if s.success() => IpcResult {
                    success: true,
                    message: Some(format!("系统将在 {} 分钟后关机", minutes)),
                    error: None,
                },
                Ok(_) | Err(_) => IpcResult {
                    success: false,
                    message: None,
                    error: Some("设置定时关机失败".into()),
                },
            }
        } else {
            let status = Command::new("shutdown")
                .arg("/a")
                .creation_flags(0x08000000)
                .status();
            match status {
                Ok(_) => IpcResult {
                    success: true,
                    message: Some("已取消定时关机".into()),
                    error: None,
                },
                Err(e) => IpcResult {
                    success: false,
                    message: None,
                    error: Some(e.to_string()),
                },
            }
        }
    }
    #[cfg(not(target_os = "windows"))]
    IpcResult { success: false, message: None, error: Some("仅支持 Windows".into()) }
}

#[tauri::command]
fn get_autostart() -> bool {
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        let output = Command::new("reg")
            .args(["query", "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run", "/v", "LanDisk"])
            .creation_flags(0x08000000)
            .output();
        if let Ok(out) = output {
            out.status.success()
        } else {
            false
        }
    }
    #[cfg(not(target_os = "windows"))]
    false
}

#[tauri::command]
fn set_autostart(enable: bool) -> IpcResult {
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        if enable {
            let exe = match std::env::current_exe() {
                Ok(e) => e,
                Err(e) => return IpcResult { success: false, message: None, error: Some(e.to_string()) },
            };
            let exe_str = format!("\"{}\"", exe.to_string_lossy());
            let status = Command::new("reg")
                .args(["add", "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run", "/v", "LanDisk", "/t", "REG_SZ", "/d", &exe_str, "/f"])
                .creation_flags(0x08000000)
                .status();
            match status {
                Ok(s) if s.success() => IpcResult { success: true, message: None, error: None },
                _ => IpcResult { success: false, message: None, error: Some("添加开机自启动项失败".into()) },
            }
        } else {
            let _ = Command::new("reg")
                .args(["delete", "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run", "/v", "LanDisk", "/f"])
                .creation_flags(0x08000000)
                .status();
            IpcResult { success: true, message: None, error: None }
        }
    }
    #[cfg(not(target_os = "windows"))]
    IpcResult { success: false, message: None, error: Some("仅支持 Windows".into()) }
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DevToolsResult {
    pub success: bool,
    pub opened: bool,
}

#[tauri::command]
fn minimize_window(window: tauri::Window) -> Result<(), String> {
    window.minimize().map_err(|e| e.to_string())
}

#[tauri::command]
fn maximize_window(window: tauri::Window) -> Result<bool, String> {
    if window.is_maximized().map_err(|e| e.to_string())? {
        window.unmaximize().map_err(|e| e.to_string())?;
        Ok(false)
    } else {
        window.maximize().map_err(|e| e.to_string())?;
        Ok(true)
    }
}

#[tauri::command]
fn start_dragging(window: tauri::Window) -> Result<(), String> {
    window.start_dragging().map_err(|e| e.to_string())
}

#[tauri::command]
fn close_window(window: tauri::Window) -> Result<(), String> {
    window.close().map_err(|e| e.to_string())
}

#[tauri::command]
fn hide_window(window: tauri::Window) -> Result<(), String> {
    window.hide().map_err(|e| e.to_string())
}

#[tauri::command]
fn quit_app(app: tauri::AppHandle) {
    app.exit(0);
}

#[tauri::command]
fn open_dev_tools(window: tauri::WebviewWindow) -> DevToolsResult {
    if window.is_devtools_open() {
        window.close_devtools();
        DevToolsResult { success: true, opened: false }
    } else {
        window.open_devtools();
        DevToolsResult { success: true, opened: true }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app_state = AppState {
        child: Mutex::new(None),
        job: Mutex::new(JobObjectGuard::new()),
        last_server_info: Mutex::new(None),
    };

    tauri::Builder::default()
        .manage(app_state)
        .invoke_handler(tauri::generate_handler![
            start_server,
            stop_server,
            get_server_status,
            select_folder,
            open_path,
            open_root,
            open_url,
            open_firewall,
            get_home_dir,
            get_network_info,
            get_sys_info,
            schedule_shutdown,
            get_autostart,
            set_autostart,
            minimize_window,
            maximize_window,
            start_dragging,
            close_window,
            hide_window,
            quit_app,
            open_dev_tools
        ])
        .setup(|app| {
            if cfg!(debug_assertions) {
                let _ = app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                );
            }

            // 系统托盘配置
            let show_i = tauri::menu::MenuItem::with_id(app, "show", "显示主窗口", true, None::<&str>)?;
            let quit_i = tauri::menu::MenuItem::with_id(app, "quit", "完全退出", true, None::<&str>)?;
            let menu = tauri::menu::Menu::with_items(app, &[&show_i, &quit_i])?;

            if let Some(icon) = app.default_window_icon() {
                let _ = tauri::tray::TrayIconBuilder::new()
                    .icon(icon.clone())
                    .tooltip("猫步互联 Pro")
                    .menu(&menu)
                    .on_menu_event(|app, event| {
                        match event.id.as_ref() {
                            "show" => {
                                if let Some(w) = app.get_webview_window("main") {
                                    let _ = w.show();
                                    let _ = w.unminimize();
                                    let _ = w.set_focus();
                                }
                            }
                            "quit" => {
                                app.exit(0);
                            }
                            _ => {}
                        }
                    })
                    .on_tray_icon_event(|tray, event| {
                        if let tauri::tray::TrayIconEvent::Click { button: tauri::tray::MouseButton::Left, button_state: tauri::tray::MouseButtonState::Up, .. } = event {
                            let app = tray.app_handle();
                            if let Some(w) = app.get_webview_window("main") {
                                let _ = w.show();
                                let _ = w.unminimize();
                                let _ = w.set_focus();
                            }
                        }
                    })
                    .build(app);
            }

            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app_handle, event| {
            if let tauri::RunEvent::Exit = event {
                let state: tauri::State<AppState> = app_handle.state();
                let mut job_lock = state.job.lock().unwrap();
                if let Some(job) = job_lock.take() {
                    job.terminate();
                }
                let mut lock = state.child.lock().unwrap();
                if let Some(mut child) = lock.take() {
                    let _ = child.kill();
                    let _ = child.wait();
                }
            }
        });
}
