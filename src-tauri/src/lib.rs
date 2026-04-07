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

#[cfg(target_os = "windows")]
fn get_cursor_position() -> Option<(i32, i32)> {
    use std::mem::MaybeUninit;
    #[repr(C)]
    struct POINT { x: i32, y: i32 }
    extern "system" { fn GetCursorPos(lp_point: *mut POINT) -> i32; }
    unsafe {
        let mut pt = MaybeUninit::<POINT>::uninit();
        if GetCursorPos(pt.as_mut_ptr()) != 0 {
            let pt = pt.assume_init();
            Some((pt.x, pt.y))
        } else {
            None
        }
    }
}

#[cfg(target_os = "macos")]
fn get_cursor_position() -> Option<(i32, i32)> {
    // CGEventGetLocation works from any thread
    #[link(name = "CoreGraphics", kind = "framework")]
    extern "C" {
        fn CGEventCreate(source: *const std::ffi::c_void) -> *mut std::ffi::c_void;
        fn CGEventGetLocation(event: *mut std::ffi::c_void) -> CGPoint;
        fn CFRelease(cf: *mut std::ffi::c_void);
    }
    #[repr(C)]
    struct CGPoint { x: f64, y: f64 }

    unsafe {
        let event = CGEventCreate(std::ptr::null());
        if event.is_null() { return None; }
        let pt = CGEventGetLocation(event);
        CFRelease(event);
        // CGEvent coordinates are already in top-left origin on macOS (screen coordinates)
        Some((pt.x as i32, pt.y as i32))
    }
}

#[cfg(not(any(target_os = "windows", target_os = "macos")))]
fn get_cursor_position() -> Option<(i32, i32)> {
    None
}

fn read_layout_setting() -> String {
    let home = match dirs::home_dir() {
        Some(h) => h,
        None => return "auto".to_string(),
    };
    let settings_path = home.join("Documents").join("pastee").join("settings.json");

    let contents = match std::fs::read_to_string(&settings_path) {
        Ok(s) => s,
        Err(_) => return "auto".to_string(),
    };

    let json: serde_json::Value = match serde_json::from_str(&contents) {
        Ok(v) => v,
        Err(_) => return "auto".to_string(),
    };

    json.get("layoutOverride")
        .and_then(|v| v.as_str())
        .unwrap_or("auto")
        .to_string()
}

fn resize_for_layout(window: &tauri::WebviewWindow) {
    let layout_override = read_layout_setting();

    let is_horizontal = match layout_override.as_str() {
        "horizontal" => true,
        "vertical" => false,
        _ => cfg!(target_os = "macos"), // auto: horizontal on macOS
    };

    if is_horizontal {
        // Find the monitor the cursor is on (reuse existing logic)
        let monitor = {
            let (cx, cy) = get_cursor_position().unwrap_or((0, 0));
            window.available_monitors().ok()
                .and_then(|monitors| {
                    monitors.into_iter().find(|m| {
                        let pos = m.position();
                        let size = m.size();
                        cx >= pos.x && cx < pos.x + size.width as i32
                            && cy >= pos.y && cy < pos.y + size.height as i32
                    })
                })
                .or_else(|| window.current_monitor().ok().flatten())
        };

        if let Some(m) = monitor {
            let pos = m.position();
            let size = m.size();
            let scale = m.scale_factor();
            let w = size.width;
            let h = 680;
            let x = pos.x;
            let y = pos.y + size.height as i32 - h as i32;

            let _ = window.set_size(tauri::PhysicalSize::new(w, h));
            let _ = window.set_position(tauri::PhysicalPosition::new(x, y));
            let _ = window.set_always_on_top(true);
            #[cfg(target_os = "macos")]
            set_window_above_dock(window);
        }
    } else {
        // Vertical layout: position near cursor, cap height to available screen area
        let (cx, cy) = get_cursor_position().unwrap_or((0, 0));
        let monitor = window.available_monitors().ok()
            .and_then(|monitors| {
                monitors.into_iter().find(|m| {
                    let pos = m.position();
                    let size = m.size();
                    cx >= pos.x && cx < pos.x + size.width as i32
                        && cy >= pos.y && cy < pos.y + size.height as i32
                })
            })
            .or_else(|| window.current_monitor().ok().flatten());

        let logical_h: u32 = if let Some(ref m) = monitor {
            let scale = m.scale_factor();
            // Available height in logical pixels, leave ~80px for Dock + margin
            let available = (m.size().height as f64 / scale) as u32;
            (available.saturating_sub(80)).min(750)
        } else {
            750
        };

        let _ = window.set_size(tauri::LogicalSize::new(420_u32, logical_h));
        #[cfg(target_os = "macos")]
        set_window_above_dock(window);
        position_window_at_cursor(window);
    }
}

/// Extract system file icon for a given extension, returns base64 PNG
#[cfg(target_os = "windows")]
fn extract_file_icon(extension: &str) -> Option<Vec<u8>> {
    use windows::Win32::UI::Shell::{SHGetFileInfoW, SHFILEINFOW, SHGFI_ICON, SHGFI_LARGEICON, SHGFI_USEFILEATTRIBUTES};
    use windows::Win32::UI::WindowsAndMessaging::{GetIconInfo, ICONINFO, DestroyIcon};
    use windows::Win32::Graphics::Gdi::{
        CreateCompatibleDC, DeleteDC, SelectObject, GetDIBits,
        BITMAPINFO, BITMAPINFOHEADER, DIB_RGB_COLORS, DeleteObject, GetObjectW, BITMAP,
    };
    use windows::core::PCWSTR;
    use std::mem;

    unsafe {
        // Create a dummy filename like "file.ext"
        let dummy: Vec<u16> = format!("file.{}\0", extension).encode_utf16().collect();
        let mut shfi: SHFILEINFOW = mem::zeroed();

        let result = SHGetFileInfoW(
            PCWSTR(dummy.as_ptr()),
            windows::Win32::Storage::FileSystem::FILE_ATTRIBUTE_NORMAL,
            Some(&mut shfi),
            mem::size_of::<SHFILEINFOW>() as u32,
            SHGFI_ICON | SHGFI_LARGEICON | SHGFI_USEFILEATTRIBUTES,
        );

        if result == 0 || shfi.hIcon.is_invalid() {
            return None;
        }

        let hicon = shfi.hIcon;

        // Get icon info to access the bitmap
        let mut icon_info: ICONINFO = mem::zeroed();
        if GetIconInfo(hicon, &mut icon_info).is_err() {
            DestroyIcon(hicon).ok();
            return None;
        }

        let hbm_color = icon_info.hbmColor;
        let hbm_mask = icon_info.hbmMask;

        // Get bitmap dimensions
        let mut bm: BITMAP = mem::zeroed();
        if GetObjectW(hbm_color, mem::size_of::<BITMAP>() as i32, Some(&mut bm as *mut _ as *mut _)) == 0 {
            DeleteObject(hbm_color).ok();
            DeleteObject(hbm_mask).ok();
            DestroyIcon(hicon).ok();
            return None;
        }

        let width = bm.bmWidth as u32;
        let height = bm.bmHeight as u32;

        // Setup BITMAPINFO for 32-bit BGRA
        let mut bmi: BITMAPINFO = mem::zeroed();
        bmi.bmiHeader.biSize = mem::size_of::<BITMAPINFOHEADER>() as u32;
        bmi.bmiHeader.biWidth = width as i32;
        bmi.bmiHeader.biHeight = -(height as i32); // top-down
        bmi.bmiHeader.biPlanes = 1;
        bmi.bmiHeader.biBitCount = 32;
        bmi.bmiHeader.biCompression = 0; // BI_RGB

        let hdc = CreateCompatibleDC(None);
        let old = SelectObject(hdc, hbm_color);

        let mut pixels = vec![0u8; (width * height * 4) as usize];
        GetDIBits(
            hdc, hbm_color, 0, height,
            Some(pixels.as_mut_ptr() as *mut _),
            &mut bmi,
            DIB_RGB_COLORS,
        );

        SelectObject(hdc, old);
        DeleteDC(hdc).ok();
        DeleteObject(hbm_color).ok();
        DeleteObject(hbm_mask).ok();
        DestroyIcon(hicon).ok();

        // Convert BGRA to RGBA
        for chunk in pixels.chunks_exact_mut(4) {
            chunk.swap(0, 2); // B <-> R
        }

        // Encode as PNG using the image crate
        let img = image::RgbaImage::from_raw(width, height, pixels)?;
        let mut png_buf = Vec::new();
        let encoder = image::codecs::png::PngEncoder::new(&mut png_buf);
        img.write_with_encoder(encoder).ok()?;

        Some(png_buf)
    }
}

#[cfg(target_os = "macos")]
fn extract_file_icon(extension: &str) -> Option<Vec<u8>> {
    use objc2_app_kit::NSWorkspace;
    use objc2_foundation::NSString;
    use objc2::rc::autoreleasepool;

    autoreleasepool(|_| unsafe {
        let workspace = NSWorkspace::sharedWorkspace();
        // Fake path — macOS resolves icon by extension even if file doesn't exist
        let fake_path = NSString::from_str(&format!("/tmp/dummy.{}", extension));
        let ns_image = workspace.iconForFile(&fake_path);
        ns_image.setSize(objc2_foundation::NSSize { width: 64.0, height: 64.0 });

        let tiff_data = ns_image.TIFFRepresentation()?;
        let bytes = tiff_data.bytes();
        let img = image::load_from_memory(bytes).ok()?;
        let mut png_buf = Vec::new();
        img.write_with_encoder(image::codecs::png::PngEncoder::new(&mut png_buf)).ok()?;
        Some(png_buf)
    })
}

#[cfg(not(any(target_os = "windows", target_os = "macos")))]
fn extract_file_icon(_extension: &str) -> Option<Vec<u8>> {
    None
}

#[cfg(target_os = "macos")]
fn get_frontmost_app() -> Option<String> {
    use objc2_app_kit::NSWorkspace;
    use objc2::rc::autoreleasepool;
    autoreleasepool(|_| unsafe {
        let workspace = NSWorkspace::sharedWorkspace();
        let app = workspace.frontmostApplication()?;
        let name = app.localizedName()?;
        Some(name.to_string())
    })
}

#[cfg(not(target_os = "macos"))]
fn get_frontmost_app() -> Option<String> {
    None
}

/// Set window level above Dock on macOS. Called once at startup and on every layout change.
#[cfg(target_os = "macos")]
fn set_window_above_dock(window: &tauri::WebviewWindow) {
    use objc2_app_kit::NSWindow;
    use objc2::rc::autoreleasepool;
    // NSPopUpMenuWindowLevel = 101: above Dock (20), Spotlight (1000 in some contexts),
    // and NSStatusWindowLevel (25). This is the standard level for transient system-like panels.
    const NS_POP_UP_MENU_WINDOW_LEVEL: isize = 101;
    autoreleasepool(|_| unsafe {
        if let Ok(ns_window) = window.ns_window() {
            let ns_window = ns_window as *mut NSWindow;
            (*ns_window).setLevel(NS_POP_UP_MENU_WINDOW_LEVEL);
        }
    });
}

/// Position window near cursor, using the monitor the cursor is actually on
fn position_window_at_cursor(window: &tauri::WebviewWindow) {
    let (cx, cy) = match get_cursor_position() {
        Some(pos) => pos,
        None => return,
    };

    // Find the monitor that contains the cursor
    let monitor = window.available_monitors().ok()
        .and_then(|monitors| {
            monitors.into_iter().find(|m| {
                let pos = m.position();
                let size = m.size();
                cx >= pos.x && cx < pos.x + size.width as i32
                    && cy >= pos.y && cy < pos.y + size.height as i32
            })
        })
        .or_else(|| window.current_monitor().ok().flatten());

    let monitor = match monitor {
        Some(m) => m,
        None => return,
    };

    let mon_pos = monitor.position();
    let mon_size = monitor.size();
    let win_size = window.outer_size().unwrap_or(tauri::PhysicalSize { width: 420, height: 750 });

    let mon_right = mon_pos.x + mon_size.width as i32;
    let mon_bottom = mon_pos.y + mon_size.height as i32;
    let w = win_size.width as i32;
    let h = win_size.height as i32;

    let mut x = cx;
    let mut y = cy;
    if x + w > mon_right { x = mon_right - w; }
    if y + h > mon_bottom { y = mon_bottom - h; }
    if x < mon_pos.x { x = mon_pos.x; }
    if y < mon_pos.y { y = mon_pos.y; }

    let _ = window.set_position(tauri::PhysicalPosition::new(x, y));
}

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
fn get_thumbnail(
    state: tauri::State<AppState>,
    id: i64,
) -> Result<Option<String>, String> {
    let storage = state.storage.lock().map_err(|_| "Lock error")?;
    storage.get_thumbnail_base64(id).map_err(|e| e.to_string())
}

/// Get system file icon for a file extension, returns base64 PNG.
/// Icons are cached to disk at {data_dir}/icon/{platform}/{ext}.png
#[tauri::command]
fn get_file_icon(state: tauri::State<AppState>, extension: String) -> Result<Option<String>, String> {
    let ext = extension.trim_start_matches('.').to_lowercase();
    if ext.is_empty() {
        return Ok(None);
    }

    // Cache path: ~/Documents/pastee/icon/{platform}/{ext}.png
    let storage = state.storage.lock().map_err(|_| "Lock error")?;
    let data_dir = storage.data_dir();
    let platform = if cfg!(target_os = "windows") { "windows" }
        else if cfg!(target_os = "macos") { "macos" }
        else { "linux" };
    let icon_dir = data_dir.join("icon").join(platform);
    let cache_path = icon_dir.join(format!("{}.png", ext));

    // Check cache first
    if cache_path.exists() {
        if let Ok(bytes) = std::fs::read(&cache_path) {
            let b64 = general_purpose::STANDARD.encode(&bytes);
            return Ok(Some(b64));
        }
    }

    // Extract from system and cache
    match extract_file_icon(&ext) {
        Some(png_bytes) => {
            let _ = std::fs::create_dir_all(&icon_dir);
            let _ = std::fs::write(&cache_path, &png_bytes);
            let b64 = general_purpose::STANDARD.encode(&png_bytes);
            Ok(Some(b64))
        }
        None => Ok(None),
    }
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
fn hide_window(app: AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("main") {
        window.hide().map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn toggle_window(app: AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("main") {
        if window.is_visible().unwrap_or(false) {
            window.hide().map_err(|e| e.to_string())?;
        } else {
            // Resize and position window according to layout setting
            resize_for_layout(&window);
            window.show().map_err(|e| e.to_string())?;
            window.set_focus().map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

#[tauri::command]
fn paste_clip(
    state: tauri::State<AppState>,
    id: i64,
) -> Result<(), String> {
    let storage = state.storage.lock().map_err(|_| "Lock error")?;
    let content = storage.get_content(id).map_err(|e| e.to_string())?;

    // Set skip flag so clipboard listener ignores our own write
    if let Ok(mut skip) = state.skip_next_clip.lock() {
        *skip = true;
    }

    let mut clipboard = arboard::Clipboard::new().map_err(|e| e.to_string())?;
    match content {
        ClipData::Text(text) => {
            clipboard.set_text(&text).map_err(|e| e.to_string())?;
        }
        ClipData::Html { text, html } => {
            clipboard.set_html(&html, Some(&text)).map_err(|e| e.to_string())?;
        }
        ClipData::Image(bytes) => {
            let img = image::load_from_memory(&bytes).map_err(|e| e.to_string())?;
            let rgba = img.to_rgba8();
            let (w, h) = rgba.dimensions();
            let img_data = arboard::ImageData {
                width: w as usize,
                height: h as usize,
                bytes: rgba.into_raw().into(),
            };
            clipboard.set_image(img_data).map_err(|e| e.to_string())?;
        }
        ClipData::Files(files) => {
            // For files, copy the file paths as text
            clipboard.set_text(&files.join("\n")).map_err(|e| e.to_string())?;
        }
        ClipData::Color(color) => {
            clipboard.set_text(&color).map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

#[tauri::command]
fn open_settings_window(app: AppHandle) -> Result<(), String> {
    if let Some(w) = app.get_webview_window("settings") {
        w.show().map_err(|e| e.to_string())?;
        w.set_focus().map_err(|e| e.to_string())?;
        return Ok(());
    }
    tauri::WebviewWindowBuilder::new(&app, "settings", tauri::WebviewUrl::App("#/settings".into()))
        .title("pastee 设置")
        .inner_size(720.0, 560.0)
        .resizable(false)
        .decorations(true)
        .transparent(false)
        .always_on_top(false)
        .build()
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn update_hotkey(app: AppHandle, state: tauri::State<AppState>, hotkey: String) -> Result<(), String> {
    use tauri_plugin_global_shortcut::GlobalShortcutExt;

    // Un-register all existing shortcuts first
    app.global_shortcut().unregister_all().map_err(|e| e.to_string())?;

    // Register new shortcut
    app.global_shortcut()
        .on_shortcut(hotkey.as_str(), move |ah, _shortcut, _event| {
            if let Some(window) = ah.get_webview_window("main") {
                resize_for_layout(&window);
                let _ = window.show();
                let _ = window.set_focus();
            }
        })
        .map_err(|e| format!("快捷键注册失败: {}", e))?;

    // Persist to settings.json
    let path = {
        let storage = state.storage.lock().map_err(|_| "Lock error")?;
        storage.data_dir().join("settings.json")
    };
    let mut settings: serde_json::Value = match std::fs::read_to_string(&path) {
        Ok(s) => serde_json::from_str(&s).unwrap_or(serde_json::json!({})),
        Err(_) => serde_json::json!({}),
    };
    settings["activationHotkey"] = serde_json::Value::String(hotkey.clone());
    let s = serde_json::to_string_pretty(&settings).map_err(|e| e.to_string())?;
    std::fs::write(&path, s).map_err(|e| e.to_string())?;

    println!("✅ 全局快捷键已更新: {}", hotkey);
    Ok(())
}

#[tauri::command]
fn set_keep_window_open(state: tauri::State<AppState>, keep: bool) -> Result<(), String> {
    let mut keep_open = state.keep_window_open.lock().map_err(|_| "Lock error")?;
    *keep_open = keep;
    println!("🔒 窗口保持打开: {}", keep);
    Ok(())
}

struct LinkMeta {
    title: Option<String>,
    domain: Option<String>,
    og_image: Option<String>,
    favicon: Option<String>,
}

/// Fetch link metadata synchronously with a 5-second timeout. Returns None on failure.
fn fetch_link_meta_sync(url: &str) -> Option<LinkMeta> {
    use std::io::Read;
    use std::time::Duration;

    let domain = extract_domain(url);

    let response = ureq::AgentBuilder::new()
        .timeout(Duration::from_secs(5))
        .build()
        .get(url)
        .set("User-Agent", "Mozilla/5.0 (compatible; pastee/1.0)")
        .call()
        .ok()?;

    let mut body = String::new();
    response.into_reader().take(128 * 1024).read_to_string(&mut body).ok()?;

    let title = parse_meta_tag(&body, "og:title").or_else(|| parse_title(&body));
    let og_image = parse_meta_tag(&body, "og:image").map(|u| resolve_url(url, &u));
    let favicon = Some(find_favicon(&body, url));

    Some(LinkMeta { title, domain, og_image, favicon })
}

mod url_helper {
    pub fn extract_domain(url: &str) -> Option<String> {
        let without_scheme = url.trim_start_matches("https://").trim_start_matches("http://");
        let host = without_scheme.split('/').next()?;
        let host = host.split('?').next()?;
        Some(host.trim_start_matches("www.").to_string())
    }
}

fn extract_domain(url: &str) -> Option<String> {
    url_helper::extract_domain(url)
}

fn parse_meta_tag(html: &str, property: &str) -> Option<String> {
    let lower = html.to_lowercase();
    let search = format!("property=\"{}\"", property.to_lowercase());
    let search2 = format!("property='{}'", property.to_lowercase());
    let search3 = format!("name=\"{}\"", property.to_lowercase());

    for s in [&search, &search2, &search3] {
        if let Some(pos) = lower.find(s.as_str()) {
            let tag_start = html[..pos].rfind('<').unwrap_or(0);
            let tag_end = html[pos..].find('>').map(|e| pos + e + 1).unwrap_or(html.len());
            let tag = &html[tag_start..tag_end];
            if let Some(content) = extract_attr(tag, "content") {
                return Some(decode_html_entities(&content));
            }
        }
    }
    None
}

fn parse_title(html: &str) -> Option<String> {
    let lower = html.to_lowercase();
    let start = lower.find("<title")?;
    let end_tag = lower[start..].find('>')?;
    let content_start = start + end_tag + 1;
    let content_end = lower[content_start..].find("</title>").map(|e| content_start + e)?;
    let raw = &html[content_start..content_end];
    Some(decode_html_entities(raw.trim()))
}

fn find_favicon(html: &str, base_url: &str) -> String {
    let lower = html.to_lowercase();
    // Look for <link rel="icon" or rel="shortcut icon"
    let mut pos = 0;
    while let Some(link_pos) = lower[pos..].find("<link") {
        let abs = pos + link_pos;
        let end = lower[abs..].find('>').map(|e| abs + e + 1).unwrap_or(html.len());
        let tag = &html[abs..end];
        let tag_lower = tag.to_lowercase();
        if tag_lower.contains("rel=\"icon\"") || tag_lower.contains("rel='icon'")
            || tag_lower.contains("shortcut icon") {
            if let Some(href) = extract_attr(tag, "href") {
                return resolve_url(base_url, &href);
            }
        }
        pos = end;
    }
    // Fallback: /favicon.ico
    let domain_part = {
        let s = base_url.trim_start_matches("https://").trim_start_matches("http://");
        let host = s.split('/').next().unwrap_or("");
        format!("https://{}/favicon.ico", host)
    };
    domain_part
}

fn extract_attr(tag: &str, attr: &str) -> Option<String> {
    let lower = tag.to_lowercase();
    let search_dq = format!("{}=\"", attr.to_lowercase());
    let search_sq = format!("{}='", attr.to_lowercase());
    if let Some(pos) = lower.find(&search_dq) {
        let start = pos + search_dq.len();
        let end = tag[start..].find('"').map(|e| start + e)?;
        return Some(tag[start..end].to_string());
    }
    if let Some(pos) = lower.find(&search_sq) {
        let start = pos + search_sq.len();
        let end = tag[start..].find('\'').map(|e| start + e)?;
        return Some(tag[start..end].to_string());
    }
    None
}

fn resolve_url(base: &str, url: &str) -> String {
    if url.starts_with("http://") || url.starts_with("https://") {
        return url.to_string();
    }
    let scheme_host = {
        let s = base.trim_start_matches("https://").trim_start_matches("http://");
        let host = s.split('/').next().unwrap_or("");
        let scheme = if base.starts_with("https://") { "https" } else { "http" };
        format!("{}://{}", scheme, host)
    };
    if url.starts_with('/') {
        format!("{}{}", scheme_host, url)
    } else {
        // relative — best effort
        let base_path = base.rsplitn(2, '/').nth(1).unwrap_or(base);
        format!("{}/{}", base_path, url)
    }
}

fn decode_html_entities(s: &str) -> String {
    s.replace("&amp;", "&")
     .replace("&lt;", "<")
     .replace("&gt;", ">")
     .replace("&quot;", "\"")
     .replace("&#39;", "'")
     .replace("&apos;", "'")
}

#[tauri::command]
fn apply_layout(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("main") {
        resize_for_layout(&window);
    }
    // Notify main window to reload settings
    let _ = app.emit("settings://changed", ());
    Ok(())
}

#[tauri::command]
fn get_settings(state: tauri::State<AppState>) -> Result<serde_json::Value, String> {
    let storage = state.storage.lock().map_err(|_| "Lock error")?;
    let path = storage.data_dir().join("settings.json");
    match std::fs::read_to_string(&path) {
        Ok(s) => serde_json::from_str(&s).map_err(|e| e.to_string()),
        Err(_) => Ok(serde_json::json!({})),
    }
}

#[tauri::command]
fn save_settings(state: tauri::State<AppState>, settings: serde_json::Value) -> Result<(), String> {
    let storage = state.storage.lock().map_err(|_| "Lock error")?;
    let path = storage.data_dir().join("settings.json");
    let s = serde_json::to_string_pretty(&settings).map_err(|e| e.to_string())?;
    std::fs::write(&path, s).map_err(|e| e.to_string())
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
    skip_next_clip: Arc<Mutex<bool>>,
}

impl AppState {
    fn new(data_dir: std::path::PathBuf, skip_next_clip: Arc<Mutex<bool>>) -> Result<Self, Box<dyn std::error::Error>> {
        let storage = Storage::new(&data_dir)?;
        Ok(AppState {
            storage: Mutex::new(storage),
            keep_window_open: Arc::new(Mutex::new(false)),
            skip_next_clip,
        })
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run(rx: crossbeam_channel::Receiver<clipboard::ClipEvent>, skip_next_clip: Arc<Mutex<bool>>) {
    tauri::Builder::default()
        .setup(move |app| {
            setup_tray(app)?;
            setup_global_shortcut(app)?;
            setup_storage_and_clipboard(app, rx, skip_next_clip)?;
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
            hide_window,
            open_settings_window,
            set_keep_window_open,
            open_accessibility_settings,
            get_image_url,
            get_thumbnail,
            get_file_icon,
            paste_clip,
            get_settings,
            save_settings,
            apply_layout,
            update_hotkey,
        ])
        .on_window_event(|_window, event| {
            match event {
                tauri::WindowEvent::CloseRequested { api, .. } => {
                    // Only intercept close on the main window; settings window can close normally
                    if _window.label() == "main" {
                        api.prevent_close();
                        let _ = _window.hide();
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
                let source = get_frontmost_app();

                // 保存到数据库，获取 id
                let saved_id = if let Ok(mut store) = storage.lock() {
                    match store.add_text(trimmed_text.clone(), source) {
                        Ok(id) => Some(id),
                        Err(e) => { eprintln!("❌ 保存文本失败: {}", e); None }
                    }
                } else { None };

                // 推送事件到前端
                let _ = app.emit("clipboard://new-clip", serde_json::json!({
                    "type": "text",
                    "preview": trimmed_text
                }));

                // 如果是 URL，后台异步 fetch 元数据
                if let Some(id) = saved_id {
                    let is_url = trimmed_text.starts_with("http://") || trimmed_text.starts_with("https://");
                    if is_url && id > 0 {
                        let url = trimmed_text.clone();
                        let storage_clone = Arc::clone(&storage);
                        let app_clone = app.clone();
                        thread::spawn(move || {
                            if let Some(meta) = fetch_link_meta_sync(&url) {
                                if let Ok(store) = storage_clone.lock() {
                                    let _ = store.update_link_meta(
                                        id,
                                        meta.title.as_deref(),
                                        meta.domain.as_deref(),
                                        meta.og_image.as_deref(),
                                        meta.favicon.as_deref(),
                                    );
                                }
                                let _ = app_clone.emit("clipboard://link-meta-ready", serde_json::json!({ "id": id }));
                            }
                        });
                    }
                }
            },
            Ok(ClipEvent::Image { width, height, rgba_data }) => {
                println!("✅ 捕获到图片: [ {}x{}, {} bytes ]", width, height, rgba_data.len());
                let source = get_frontmost_app();

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
                        match store.add_image(width, height, rgba_data, source) {
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
                let source = get_frontmost_app();
                
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
                    if let Err(e) = store.add_html(text_preview, html.clone(), source) {
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
                let source = get_frontmost_app();
                
                // 转换 PathBuf 为 String
                let file_paths: Vec<String> = files
                    .iter()
                    .map(|p| p.to_string_lossy().to_string())
                    .collect();
                
                // 保存到数据库
                if let Ok(mut store) = storage.lock() {
                    if let Err(e) = store.add_files(file_paths, source) {
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

    let home = dirs::home_dir().ok_or("Failed to get home directory")?;
    let settings_path = home.join("Documents").join("pastee").join("settings.json");

    let hotkey: String = if let Ok(s) = std::fs::read_to_string(&settings_path) {
        if let Ok(v) = serde_json::from_str::<serde_json::Value>(&s) {
            v["activationHotkey"]
                .as_str()
                .map(|s| s.to_owned())
                .unwrap_or_else(default_hotkey)
        } else {
            default_hotkey()
        }
    } else {
        default_hotkey()
    };

    if let Ok(()) = app.global_shortcut().on_shortcut(hotkey.as_str(), move |app_handle, _shortcut, _event| {
        if let Some(window) = app_handle.get_webview_window("main") {
            resize_for_layout(&window);
            let _ = window.show();
            let _ = window.set_focus();
        }
    }) {
        println!("✅ 全局快捷键已注册: {}", hotkey);
    } else {
        println!("⚠️ 全局快捷键注册失败: {}", hotkey);
        #[cfg(target_os = "macos")]
        println!("macOS提示: 需要在系统设置 → 隐私与安全 → 辅助功能 中授予权限");
    }

    Ok(())
}

fn default_hotkey() -> String {
    "CommandOrControl+Shift+V".to_owned()
}

/// 初始化存储和剪贴板监听
fn setup_storage_and_clipboard(
    app: &mut tauri::App,
    rx: crossbeam_channel::Receiver<clipboard::ClipEvent>,
    skip_next_clip: Arc<Mutex<bool>>,
) -> Result<(), Box<dyn std::error::Error>> {
    // 使用 $HOME/Documents/pastee 作为数据目录
    let home = dirs::home_dir().ok_or("Failed to get home directory")?;
    let data_dir = home.join("Documents").join("pastee");

    let app_state = AppState::new(data_dir.clone(), skip_next_clip).map_err(|e| e.to_string())?;
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
        // Apply vibrancy effect
        #[cfg(target_os = "windows")]
        {
            use window_vibrancy::apply_acrylic;
            let _ = apply_acrylic(&window, Some((31, 31, 31, 190)));
        }
        #[cfg(target_os = "macos")]
        {
            use window_vibrancy::{apply_vibrancy, NSVisualEffectMaterial};
            let _ = apply_vibrancy(&window, NSVisualEffectMaterial::HudWindow, None, None);
            set_window_above_dock(&window);
        }

        let window_clone = window.clone();
        let app_handle = app.handle().clone();
        window.on_window_event(move |event| {
            if let tauri::WindowEvent::Focused(false) = event {
                // 如果设置窗口正在显示（可见），不隐藏主窗口
                let settings_visible = app_handle
                    .get_webview_window("settings")
                    .and_then(|w| w.is_visible().ok())
                    .unwrap_or(false);
                if settings_visible {
                    return;
                }
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