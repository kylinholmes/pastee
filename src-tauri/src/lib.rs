// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
pub mod clipboard;
pub mod persist;

use clipboard::ClipEvent;
use persist::ClipItem;

use tauri::tray::TrayIconBuilder;

#[tauri::command]
fn select_clip_item(id: &str) -> String {
    todo!()
}

#[tauri::command]
fn query_history(query: &str) -> Vec<ClipItem> {
    todo!()
}



#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let tray = TrayIconBuilder::new().build(app)?;
            Ok(())
        })
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}


pub fn handle_clipboard_event(rx: crossbeam_channel::Receiver<clipboard::ClipEvent>) {
    loop {
        match rx.recv() {
            Ok(ClipEvent::Text(text)) => {
                let trimmed_text = text.trim_start().to_string();
                println!("✅ 捕获到文本: [ {} ]", trimmed_text);
            },
            Ok(ClipEvent::Image(image)) => {
                println!("✅ 捕获到图片: [ {} bytes ]", image.len());
            },
            Ok(ClipEvent::Html(html)) => {
                println!("✅ 捕获到 HTML: [ {} bytes ]", html.len());
            },
            Ok(ClipEvent::FileList(files)) => {
                println!("✅ 捕获到文件列表: [ {} files ]", files.len());
            },
            Ok(ClipEvent::Error(e)) => {
                eprintln!("❌ 读取失败: {}", e);
            },
            Err(_) => {}
        }
    }

}