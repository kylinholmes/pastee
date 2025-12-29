use arboard::Clipboard;
use clipboard_master::{CallbackResult, ClipboardHandler};
use crossbeam_channel::Sender;
use sha2::{Digest, Sha256};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

// 定义传递给主线程的数据类型
#[derive(Debug)]
pub enum ClipEvent {
    Text(String),
    Image(Vec<u8>), // 这里只传大小作为示例，实际可传 Vec<u8>
    Error(String),
}

// 监听器结构体
pub struct SystemHook {
    // 通信管道发送端
    pub sender: Sender<ClipEvent>,
    // 用于防抖 (Debounce)：记录上一次内容的哈希和时间
    pub last_hash: Arc<Mutex<String>>,
    pub last_update: Arc<Mutex<Instant>>,
}

impl ClipboardHandler for SystemHook {
    // 核心：当系统发生“复制”事件时，操作系统自动回调此函数
    fn on_clipboard_change(&mut self) -> CallbackResult {
        println!(">> ⚡ 底层事件触发 (Hook Triggered)");

        // 1. 初始化读取器 (每次读取都建议新建实例以获取最新状态)
        let mut ctx = match Clipboard::new() {
            Ok(ctx) => ctx,
            Err(e) => {
                let _ = self.sender.send(ClipEvent::Error(e.to_string()));
                return CallbackResult::Next;
            }
        };

        // 2. 尝试读取文本
        if let Ok(text) = ctx.get_text() {
            // --- 防抖与去重逻辑 ---
            let hash = compute_hash(text.as_bytes());
            let now = Instant::now();
            
            let mut last_hash_guard = self.last_hash.lock().unwrap();
            let mut last_time_guard = self.last_update.lock().unwrap();

            // 如果内容相同，且距离上次更新不足 500ms，则忽略 (Windows常见重复触发问题)
            if *last_hash_guard == hash && now.duration_since(*last_time_guard) < Duration::from_millis(500) {
                println!(">> ⚠️ 忽略重复触发 (Debounced)");
                return CallbackResult::Next;
            }

            // 更新状态
            *last_hash_guard = hash;
            *last_time_guard = now;

            // 发送给主线程
            let _ = self.sender.send(ClipEvent::Text(text));
        
        } 
        // 3. 尝试读取图片 (如果不是文本)
        else if let Ok(img) = ctx.get_image() {
            // 图片处理逻辑类似，这里简化处理
            let data = img.bytes.to_vec();
            let _ = self.sender.send(ClipEvent::Image(data));
        }

        // 继续监听下一条消息
        CallbackResult::Next
    }

    fn on_clipboard_error(&mut self, error: std::io::Error) -> CallbackResult {
        eprintln!("Hook Error: {}", error);
        CallbackResult::Next
    }
}

// 辅助函数：计算简单哈希
fn compute_hash(data: &[u8]) -> String {
    let mut hasher = Sha256::new();
    hasher.update(data);
    hex::encode(hasher.finalize())
}