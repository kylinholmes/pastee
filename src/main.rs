// Prevent console window in addition to Slint window in Windows release builds when, e.g., starting the app via file manager. Ignored on other platforms.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]


use pastee::clipboard;
use std::thread;
use clipboard_master::Master;

use std::sync::{Arc, Mutex};
use std::time::Instant;
use anyhow::Result;


use std::error::Error;

slint::include_modules!();

fn main() -> Result<(), Box<dyn Error>> {
    let history = Arc::new(Mutex::new(Vec::<slint::SharedString>::new()));
    let ui = AppWindow::new()?;

    let history_clone = history.clone();
    let ui_weak = ui.as_weak();
    let ui_weak_clone = ui_weak.clone();
    ui.on_clear_all(move || {
        {
            let mut hist = history_clone.lock().unwrap();
            hist.clear();
        }
        let hist: Vec<slint::SharedString> = vec![];
        let ui_weak = ui_weak_clone.clone();
        slint::invoke_from_event_loop(move || {
            if let Some(ui) = ui_weak.upgrade() {
                ui.set_items(slint::ModelRc::from(hist.as_slice()));
            }
        }).unwrap();
    });

    // 1. 创建通道：后台监听线程 -> 主线程
    let (tx, rx) = crossbeam_channel::unbounded();

    // 2. 启动后台线程进行 Hook (因为 Master.run() 是阻塞的)
    thread::spawn(move || {
        let hook = clipboard::SystemHook {
            sender: tx,
            last_hash: Arc::new(Mutex::new(String::new())),
            last_update: Arc::new(Mutex::new(Instant::now())),
        };

        println!(">> 🎧 剪切板监听已启动...");
        
        // 开始进入系统事件循环 (阻塞操作)
        let _ = Master::new(hook).unwrap().run();
    });

    // 3. 启动处理线程
    let ui_weak = ui.as_weak();
    let history_clone = history.clone();
    thread::spawn(move || {
        loop {
            let event = rx.recv();
            match event {
                Ok(clipboard::ClipEvent::Text(text)) => {
                    let trimmed_text = text.trim_start().to_string();
                    println!("✅ 捕获到文本: [ {} ]", trimmed_text.replace('\n', "\\n"));
                    {
                        let mut hist = history_clone.lock().unwrap();
                        hist.push(slint::SharedString::from(trimmed_text));
                    }
                    let hist = history_clone.lock().unwrap().clone();
                    let ui_weak = ui_weak.clone();
                    slint::invoke_from_event_loop(move || {
                        if let Some(ui) = ui_weak.upgrade() {
                            ui.set_items(slint::ModelRc::from(hist.as_slice()));
                        }
                    }).unwrap();
                }
                Ok(clipboard::ClipEvent::Image(img)) => {
                    println!("✅ 捕获到图片: [ {} bytes ]", img.len());
                }
                Ok(clipboard::ClipEvent::Error(e)) => {
                    eprintln!("❌ 读取失败: {}", e);
                }
                Err(_) => break,
            }
        }
    });

    ui.run()?;

    Ok(())
}
