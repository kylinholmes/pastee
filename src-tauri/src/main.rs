// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use pastee_lib::clipboard::SystemHook;
use clipboard_master::Master;
use std::sync::{Arc, Mutex};
use std::thread;
use crossbeam_channel;


fn main() {
    let (tx, rx) = crossbeam_channel::bounded(128);
    let skip_next = Arc::new(Mutex::new(false));

    let skip_clone = Arc::clone(&skip_next);
    thread::spawn(move || {
        let handler = SystemHook::new(tx, skip_clone);
        println!(">> 🎧 剪切板监听已启动...");
        let _ = Master::new(handler).unwrap().run();
    });

    pastee_lib::run(rx, skip_next)
}
