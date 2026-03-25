// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
pub mod clipboard;
pub mod persist;
pub mod setting;

use std::sync::{Mutex, Arc};
use std::thread;

use base64::{Engine as _, engine::general_purpose};
use chrono::Utc;
use clipboard::ClipEvent;
use persist::{ClipItem, Storage};

use tauri::{Manager, Emitter, AppHandle};

use crate::persist::ClipData;

#[tauri::command]
fn get_recent_clips(
    state: tauri::State<AppState>, 
    limit: usize, 
    offset: usize
) -> Result<Vec<ClipItem>, String> {
    let storage = state.storage.lock().map_err(|_| "Lock error")?;
    storage.get_recent(limit, offset).map_err(|e| e.to_string())
}

#[tauri::command]
fn get_total_count(state: tauri::State<AppState>) -> Result<i64, String> {
    let storage = state.storage.lock().map_err(|_| "Lock error")?;
    storage.get_total_count().map_err(|e| e.to_string())
}

#[tauri::command]
fn clear_unpinned_clips(state: tauri::State<AppState>) -> Result<i64, String> {
    let mut storage = state.storage.lock().map_err(|_| "Lock error")?;
    storage.clear_unpinned().map_err(|e| e.to_string())
}

#[tauri::command]
fn search_clips(
    state: tauri::State<AppState>, 
    query: String
) -> Result<Vec<ClipItem>, String> {
    let storage = state.storage.lock().map_err(|_| "Lock error")?;
    storage.search(&query).map_err(|e| e.to_string())
}

#[tauri::command]
fn get_clip_content(
    state: tauri::State<AppState>,
    id: i64
) -> Result<serde_json::Value, String> {
    let storage = state.storage.lock().map_err(|_| "Lock error")?;
    let content = storage.get_content(id).map_err(|e| e.to_string())?;
    
    let json_value = match content {
        ClipData::Text(text) => serde_json::json!({
            "type": "text",
            "data": text
        }),
        ClipData::Html { text, html } => serde_json::json!({
            "type": "html",
            "text": text,
            "html": html
        }),
        ClipData::Image(_) => serde_json::json!({
            "type": "image"
        }),
        ClipData::Files(files) => serde_json::json!({
            "type": "files",
            "files": files
        }),
        ClipData::Color(color) => serde_json::json!({
            "type": "color",
            "data": color
        }),
    };
    
    Ok(json_value)
}

#[tauri::command]
fn toggle_pin(
    state: tauri::State<AppState>,
    id: i64
) -> Result<bool, String> {
    let storage = state.storage.lock().map_err(|_| "Lock error")?;
    storage.toggle_pin(id).map_err(|e| e.to_string())
}

#[tauri::command]
fn delete_clip(
    state: tauri::State<AppState>,
    id: i64
) -> Result<(), String> {
    println!("🗑️  删除剪贴板项: ID {}", id);
    let storage = state.storage.lock().map_err(|_| "Lock error")?;
    let result = storage.delete_record(id).map_err(|e| e.to_string())?;
    println!("✅ 删除成功: ID {}", id);
    Ok(result)
}

#[tauri::command]
fn toggle_window(app: AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("main") {
        if window.is_visible().unwrap_or(false) {
            window.hide().map_err(|e| e.to_string())?;
        } else {
            window.show().map_err(|e| e.to_string())?;
            window.set_focus().map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

#[tauri::command]
fn set_keep_window_open(state: tauri::State<AppState>, keep: bool) -> Result<(), String> {
    let mut keep_open = state.keep_window_open.lock().map_err(|_| "Lock error")?;
    *keep_open = keep;
    println!("🔒 窗口保持打开: {}", keep);
    Ok(())
}

#[tauri::command]
fn open_accessibility_settings() -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg("x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility")
            .spawn()
            .map_err(|e| format!("Failed to open accessibility settings: {}", e))?;
        Ok(())
    }
    
    #[cfg(not(target_os = "macos"))]
    {
        Err("This feature is only available on macOS".to_string())
    }
}

#[tauri::command]
fn get_image_url(
    state: tauri::State<AppState>,
    id: i64,
    thumbnail: bool,
) -> Result<String, String> {
    let storage = state.storage.lock().map_err(|_| "Lock error")?;
    let (image_path, thumbnail_path) = storage
        .get_image_paths(id)
        .map_err(|e| e.to_string())?;
    
    // 返回相对路径，前端将通过 convertFileSrc 转换
    let path = if thumbnail { thumbnail_path } else { image_path };
    Ok(path)
}

struct AppState {
    storage: Mutex<Storage>,
    keep_window_open: Arc<Mutex<bool>>,
}

impl AppState {
    fn new(data_dir: std::path::PathBuf) -> Result<Self, Box<dyn std::error::Error>> {
        let storage = Storage::new(&data_dir)?;
        Ok(AppState {
            storage: Mutex::new(storage),
            keep_window_open: Arc::new(Mutex::new(false)),
        })
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run(rx: crossbeam_channel::Receiver<clipboard::ClipEvent>) {
    tauri::Builder::default()
        .setup(|app| {
            setup_tray(app)?;
            setup_global_shortcut(app)?;
            setup_storage_and_clipboard(app, rx)?;
            setup_window_events(app)?;
            Ok(())
        })
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_os::init())
        .invoke_handler(tauri::generate_handler![
            get_recent_clips,
            get_total_count,
            clear_unpinned_clips,
            search_clips,
            get_clip_content,
            toggle_pin,
            delete_clip,
            toggle_window,
            set_keep_window_open,
            open_accessibility_settings,
            get_image_url,
        ])
        .on_window_event(|_window, event| {
            match event {
                tauri::WindowEvent::CloseRequested { api, .. } => {
                    api.prevent_close();
                    if let Some(window) = _window.app_handle().get_webview_window("main") {
                        let _ = window.hide();
                    }
                }
                _ => {}
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

pub fn handle_clipboard_event(
    rx: crossbeam_channel::Receiver<clipboard::ClipEvent>,
    app: tauri::AppHandle,
    storage: Arc<Mutex<Storage>>
) {
    loop {
        match rx.recv() {
            Ok(ClipEvent::Text(text)) => {
                let trimmed_text = text.trim_start().to_string();
                println!("✅ 捕获到文本: [ {} ]", trimmed_text);
                
                // 保存到数据库
                if let Ok(mut store) = storage.lock() {
                    if let Err(e) = store.add_text(trimmed_text.clone()) {
                        eprintln!("❌ 保存文本失败: {}", e);
                    }
                }
                
                // 推送事件到前端
                let _ = app.emit("clipboard://new-clip", serde_json::json!({
                    "type": "text",
                    "preview": trimmed_text
                }));
            },
            Ok(ClipEvent::Image { width, height, rgba_data }) => {
                println!("✅ 捕获到图片: [ {}x{}, {} bytes ]", width, height, rgba_data.len());
                
                // 立即发送"处理中"事件给前端
                let temp_id = chrono::Utc::now().timestamp_micros();
                let _ = app.emit("clipboard://image-pending", serde_json::json!({
                    "temp_id": temp_id,
                    "type": "image"
                }));
                
                // 异步处理图片保存和缩略图生成
                let storage_clone = Arc::clone(&storage);
                let app_clone = app.clone();
                thread::spawn(move || {
                    if let Ok(mut store) = storage_clone.lock() {
                        match store.add_image(width, height, rgba_data) {
                            Ok((id, thumbnail_data)) => {
                                // 将缩略图数据编码为 base64 发送给前端
                                let base64_thumbnail = general_purpose::STANDARD.encode(&thumbnail_data);
                                let _ = app_clone.emit("clipboard://image-ready", serde_json::json!({
                                    "temp_id": temp_id,
                                    "id": id,
                                    "type": "image",
                                    "thumbnail": base64_thumbnail
                                }));
                            }
                            Err(e) => {
                                eprintln!("❌ 保存图片失败: {}", e);
                                let _ = app_clone.emit("clipboard://image-error", serde_json::json!({
                                    "temp_id": temp_id,
                                    "error": e.to_string()
                                }));
                            }
                        }
                    }
                });
            },
            Ok(ClipEvent::Html(html)) => {
                println!("✅ 捕获到 HTML: [ {} bytes ]", html.len());
                
                // 从 HTML 中提取纯文本作为 preview
                // 1. 移除 script 和 style 标签及其内容
                let text_preview = html
                    .replace(|c| c == '\n' || c == '\r', " ")
                    .split('<')
                    .enumerate()
                    .filter_map(|(i, s)| {
                        if i == 0 {
                            Some(s.to_string()) // 第一段（标签前的文本）
                        } else if let Some(pos) = s.find('>') {
                            // 检查是否是 script 或 style 标签，跳过其内容
                            let tag_name = s[..pos].split_whitespace().next().unwrap_or("");
                            if tag_name.eq_ignore_ascii_case("script") || tag_name.eq_ignore_ascii_case("style") {
                                None
                            } else {
                                Some(s[pos + 1..].to_string()) // 标签后的文本
                            }
                        } else {
                            None
                        }
                    })
                    .collect::<Vec<_>>()
                    .join(" ")
                    .split_whitespace()
                    .collect::<Vec<_>>()
                    .join(" ");
                
                println!("📄 提取文本预览: [ {} ]", text_preview.chars().take(100).collect::<String>());
                
                // 保存到数据库
                if let Ok(mut store) = storage.lock() {
                    if let Err(e) = store.add_html(text_preview, html.clone()) {
                        eprintln!("❌ 保存 HTML 失败: {}", e);
                    }
                }
                
                let _ = app.emit("clipboard://new-clip", serde_json::json!({
                    "type": "html",
                    "preview": html.chars().take(100).collect::<String>()
                }));
            },
            Ok(ClipEvent::FileList(files)) => {
                println!("✅ 捕获到文件列表: [ {} files ]", files.len());
                
                // 转换 PathBuf 为 String
                let file_paths: Vec<String> = files
                    .iter()
                    .map(|p| p.to_string_lossy().to_string())
                    .collect();
                
                // 保存到数据库
                if let Ok(mut store) = storage.lock() {
                    if let Err(e) = store.add_files(file_paths) {
                        eprintln!("❌ 保存文件列表失败: {}", e);
                    }
                }
                
                let _ = app.emit("clipboard://new-clip", serde_json::json!({
                    "type": "files",
                    "preview": "Files"
                }));
            },
            Ok(ClipEvent::Error(e)) => {
                eprintln!("❌ 读取失败: {}", e);
            },
            Err(_) => {}
        }
    }
}

// ============================================================================
// 辅助函数 - 初始化各个子系统
// ============================================================================

/// 初始化系统托盘图标和菜单
fn setup_tray(app: &mut tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    use tauri::tray::TrayIconBuilder;
    use tauri::tray::TrayIconEvent;
    use tauri::tray::MouseButton;
    use tauri::tray::MouseButtonState;
    use tauri::include_image;
    use tauri::menu::{Menu, MenuItem};

    // 创建托盘菜单
    let show_window = MenuItem::with_id(app, "show", "打开窗口", true, None::<&str>)?;
    let open_settings = MenuItem::with_id(app, "settings", "打开设置", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "退出", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&show_window, &open_settings, &quit])?;

    // 创建托盘图标
    let _tray = TrayIconBuilder::new()
        .icon(include_image!("icons/icon.png"))
        .menu(&menu)
        .on_menu_event(move |app, event| {
            match event.id.as_ref() {
                "show" => {
                    if let Some(window) = app.get_webview_window("main") {
                        let _ = window.show();
                        let _ = window.set_focus();
                    }
                }
                "settings" => {
                    println!("打开设置");
                    #[cfg(target_os = "macos")]
                    {
                        let _ = std::process::Command::new("open")
                            .arg("x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility")
                            .spawn();
                    }
                }
                "quit" => {
                    app.exit(0);
                }
                _ => {}
            }
        })
        .on_tray_icon_event(|tray, event| {
            match event {
                TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } => {
                    if let Some(window) = tray.app_handle().get_webview_window("main") {
                        match window.is_visible() {
                            Ok(true) => {
                                let _ = window.hide();
                            }
                            _ => {
                                let _ = window.show();
                                let _ = window.set_focus();
                            }
                        }
                    }
                }
                _ => {}
            }
        })
        .build(app)?;
    
    println!("✅ 托盘已初始化");
    Ok(())
}

/// 注册全局快捷键
fn setup_global_shortcut(app: &mut tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    use tauri_plugin_global_shortcut::GlobalShortcutExt;
    
    #[cfg(target_os = "macos")]
    let shortcut = "Cmd+Shift+V";
    #[cfg(target_os = "windows")]
    let shortcut = "Ctrl+Shift+V";
    #[cfg(target_os = "linux")]
    let shortcut = "Ctrl+Shift+V";
    
    if let Ok(()) = app.global_shortcut().on_shortcut(shortcut, move |app_handle, _shortcut, _event| {
        if let Some(window) = app_handle.get_webview_window("main") {
            let _ = window.show();
            let _ = window.set_focus();
        }
    }) {
        println!("✅ 全局快捷键已注册: {}", shortcut);
    } else {
        println!("⚠️ 全局快捷键注册失败: {}", shortcut);
        #[cfg(target_os = "macos")]
        println!("macOS提示: 需要在系统设置 → 隐私与安全 → 辅助功能 中授予权限");
    }
    
    Ok(())
}

/// 初始化存储和剪贴板监听
fn setup_storage_and_clipboard(
    app: &mut tauri::App,
    rx: crossbeam_channel::Receiver<clipboard::ClipEvent>,
) -> Result<(), Box<dyn std::error::Error>> {
    // 使用 $HOME/Documents/pastee 作为数据目录
    let home = dirs::home_dir().ok_or("Failed to get home directory")?;
    let data_dir = home.join("Documents").join("pastee");
    
    let app_state = AppState::new(data_dir.clone()).map_err(|e| e.to_string())?;
    let shared_storage = Arc::new(Mutex::new(
        Storage::new(&data_dir).map_err(|e| e.to_string())?
    ));
    
    app.manage(app_state);

    // 获取 app handle 用于事件推送
    let app_handle = app.handle().clone();
    let storage_clone = Arc::clone(&shared_storage);
    
    thread::spawn(move || {
        handle_clipboard_event(rx, app_handle, storage_clone);
    });
    
    Ok(())
}

/// 设置窗口事件监听
fn setup_window_events(app: &mut tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    // 窗口失去焦点时自动隐藏（除非设置了保持打开）
    if let Some(window) = app.get_webview_window("main") {
        let window_clone = window.clone();
        let app_handle = app.handle().clone();
        window.on_window_event(move |event| {
            if let tauri::WindowEvent::Focused(false) = event {
                // 检查是否设置了保持窗口打开
                if let Some(state) = app_handle.try_state::<AppState>() {
                    if let Ok(keep_open) = state.keep_window_open.lock() {
                        if !*keep_open {
                            let _ = window_clone.hide();
                        }
                    }
                }
            }
        });
        
        // 显示主窗口
        let _ = window.show();
        let _ = window.set_focus();
    }
    
    Ok(())
}