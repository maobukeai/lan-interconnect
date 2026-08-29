use std::process::{Child, Command};
use std::sync::Mutex;
use tauri::State;
use serde::{Deserialize, Serialize};

#[derive(Default)]
pub struct AppState {
    pub child: Mutex<Option<Child>>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ServerConfig {
    pub port: Option<u16>,
    pub pin: Option<String>,
    pub mode: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct StartResult {
    pub success: bool,
    pub port: Option<u16>,
    pub url: Option<String>,
    pub token: Option<String>,
    pub error: Option<String>,
}

#[tauri::command]
fn start_server(state: State<'_, AppState>, cfg: Option<ServerConfig>) -> StartResult {
    let port = cfg.as_ref().and_then(|c| c.port).unwrap_or(3000);
    
    let mut cmd = Command::new("node");
    cmd.arg("server.js");
    if let Some(c) = &cfg {
        if let Some(p) = c.port {
            cmd.arg("--port").arg(p.to_string());
        }
        if let Some(pin) = &c.pin {
            if !pin.is_empty() {
                cmd.arg("--pin").arg(pin);
            }
        }
    }
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
    }

    match cmd.spawn() {
        Ok(child) => {
            let mut lock = state.child.lock().unwrap();
            *lock = Some(child);
            StartResult {
                success: true,
                port: Some(port),
                url: Some(format!("http://127.0.0.1:{}", port)),
                token: Some("".into()),
                error: None,
            }
        }
        Err(e) => StartResult {
            success: false,
            port: None,
            url: None,
            token: None,
            error: Some(format!("启动失败: {}。如需免 Node 环境运行，请使用全内置便携版。", e)),
        },
    }
}

#[tauri::command]
fn stop_server(state: State<'_, AppState>) -> bool {
    let mut lock = state.child.lock().unwrap();
    if let Some(mut child) = lock.take() {
        let _ = child.kill();
        true
    } else {
        false
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .manage(AppState::default())
    .invoke_handler(tauri::generate_handler![start_server, stop_server])
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
