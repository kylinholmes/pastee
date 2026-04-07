# Horizontal Window Sizing & Slide-In Animation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix macOS horizontal layout window size/position (full-width, pinned to screen bottom) and add slide-up + fade-in/out animation when the window shows and hides.

**Architecture:** Rust reads `settings.json` directly on `toggle_window` to determine layout, then resizes and repositions the window accordingly. Frontend monitors `focus` events to trigger enter animation; closing is intercepted to play exit animation before calling a new `hide_window` Tauri command.

**Tech Stack:** Rust (Tauri 2, serde_json), React 19, motion/react (AnimatePresence), @tauri-apps/api/window

---

## File Map

| File | Change |
|------|--------|
| `src-tauri/src/lib.rs` | Add `read_layout_setting()`, `resize_for_layout()`, `hide_window` command; update `toggle_window` |
| `src-tauri/tauri.conf.json` | Change initial window width/height to 1440×220 |
| `src/components/ClipboardWindow.tsx` | Add focus listener, AnimatePresence, intercept close to play exit animation |
| `src/lib/tauri.ts` | Export `hideWindow` wrapper |

---

## Task 1: Add `hide_window` command and layout-aware window positioning in Rust

**Files:**
- Modify: `src-tauri/src/lib.rs`

### Context

The Tauri plugin-store saves settings to a JSON file. On macOS the path is:
`~/Library/Application Support/com.kylin.pastee/settings.json`

The file is standard JSON. `layoutOverride` values: `"auto"` | `"vertical"` | `"horizontal"`.

`auto` on macOS → treat as `"horizontal"`. `auto` on non-macOS → treat as `"vertical"`.

For horizontal layout: resize window to full screen width × 220px, position at bottom of screen (x=0, y=screen_height−220).
For vertical layout: resize to 420×750, keep existing `position_window_at_cursor` logic.

The screen to use is whichever monitor the cursor is on (reuse the existing monitor-detection logic in `position_window_at_cursor`).

- [ ] **Step 1: Add `read_layout_setting` helper after the existing `get_cursor_position` block**

Add this function in `src-tauri/src/lib.rs` after `get_cursor_position` (around line 38):

```rust
fn read_layout_setting() -> String {
    let home = match dirs::home_dir() {
        Some(h) => h,
        None => return "auto".to_string(),
    };

    #[cfg(target_os = "macos")]
    let settings_path = home
        .join("Library")
        .join("Application Support")
        .join("com.kylin.pastee")
        .join("settings.json");

    #[cfg(target_os = "windows")]
    let settings_path = home
        .join("AppData")
        .join("Roaming")
        .join("com.kylin.pastee")
        .join("settings.json");

    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    let settings_path = home
        .join(".config")
        .join("com.kylin.pastee")
        .join("settings.json");

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
```

- [ ] **Step 2: Add `resize_for_layout` helper after `read_layout_setting`**

```rust
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
            let scale = m.scale_factor();
            let pos = m.position();
            let size = m.size();
            let w = size.width;
            let h = 220_u32;
            let x = pos.x;
            let y = pos.y + size.height as i32 - h as i32;

            let _ = window.set_size(tauri::PhysicalSize::new(w, h));
            let _ = window.set_position(tauri::PhysicalPosition::new(x, y));
            let _ = scale; // scale factor already handled by PhysicalSize/PhysicalPosition
        }
    } else {
        let _ = window.set_size(tauri::PhysicalSize::new(420_u32, 750_u32));
        position_window_at_cursor(window);
    }
}
```

- [ ] **Step 3: Update `toggle_window` to call `resize_for_layout`**

Replace the existing show branch in `toggle_window` (around line 322):

```rust
// Before (show branch):
position_window_at_cursor(&window);
window.show().map_err(|e| e.to_string())?;
window.set_focus().map_err(|e| e.to_string())?;

// After:
resize_for_layout(&window);
window.show().map_err(|e| e.to_string())?;
window.set_focus().map_err(|e| e.to_string())?;
```

- [ ] **Step 4: Also update `setup_global_shortcut` show branch the same way**

In `setup_global_shortcut` (around line 691-695), replace `position_window_at_cursor`:
```rust
// Before:
position_window_at_cursor(&window);
let _ = window.show();
let _ = window.set_focus();

// After:
resize_for_layout(&window);
let _ = window.show();
let _ = window.set_focus();
```

- [ ] **Step 5: Add `hide_window` command (before `toggle_window`)**

```rust
#[tauri::command]
fn hide_window(app: AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("main") {
        window.hide().map_err(|e| e.to_string())?;
    }
    Ok(())
}
```

- [ ] **Step 6: Register `hide_window` in the invoke handler**

In the `invoke_handler` list (around line 444), add `hide_window` after `toggle_window`:
```rust
tauri::generate_handler![
    get_recent_clips,
    get_total_count,
    clear_unpinned_clips,
    search_clips,
    get_clip_content,
    toggle_pin,
    delete_clip,
    toggle_window,
    hide_window,        // <-- add this
    set_keep_window_open,
    open_accessibility_settings,
    get_image_url,
    get_thumbnail,
    get_file_icon,
    paste_clip,
]
```

- [ ] **Step 7: Build and verify Rust compiles**

```bash
cd /Users/kylin/pastey && cargo build --manifest-path src-tauri/Cargo.toml 2>&1 | tail -20
```
Expected: no errors (warnings OK)

- [ ] **Step 8: Commit**

```bash
cd /Users/kylin/pastey
git add src-tauri/src/lib.rs
git commit -m "feat(rust): layout-aware window sizing and hide_window command"
```

---

## Task 2: Update initial window config in tauri.conf.json

**Files:**
- Modify: `src-tauri/tauri.conf.json`

- [ ] **Step 1: Update width and height**

Change the `windows` array entry:
```json
"width": 1440,
"height": 220,
```
(These are just startup defaults; Rust resizes on first show.)

- [ ] **Step 2: Commit**

```bash
cd /Users/kylin/pastey
git add src-tauri/tauri.conf.json
git commit -m "chore: set initial window size to 1440x220 for horizontal layout default"
```

---

## Task 3: Export `hideWindow` in frontend tauri helper

**Files:**
- Modify: `src/lib/tauri.ts`

- [ ] **Step 1: Read current tauri.ts**

Read `src/lib/tauri.ts` to see existing exports.

- [ ] **Step 2: Add `hideWindow` export**

Add at the end of the file:
```ts
export async function hideWindow(): Promise<void> {
  await invoke('hide_window')
}
```

- [ ] **Step 3: Commit**

```bash
cd /Users/kylin/pastey
git add src/lib/tauri.ts
git commit -m "feat(frontend): add hideWindow tauri helper"
```

---

## Task 4: Add slide-up + fade animation to ClipboardWindow

**Files:**
- Modify: `src/components/ClipboardWindow.tsx`

### Context

The window stays mounted at all times (Tauri hides the OS window, not the React tree). We use a `shown` boolean state to drive `AnimatePresence`. On window `focus` (fired when Tauri shows the window), set `shown = true`. On close (Escape or settings button), set `shown = false` and wait for exit animation to complete before calling `hideWindow()`.

`motion/react` is already installed. `AnimatePresence` needs `onExitComplete` to call `hideWindow()`.

The `@tauri-apps/api/window` package exposes `getCurrentWebviewWindow()` and `.onFocusChanged()`.

Animation spec:
- Enter: `y: 40, opacity: 0` → `y: 0, opacity: 1`, spring damping 28 stiffness 260
- Exit: `y: 40, opacity: 0`, duration 0.18 ease-in

- [ ] **Step 1: Update imports in `ClipboardWindow.tsx`**

Add/update imports at the top:
```tsx
import { useEffect, useRef, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow'
import { motion, AnimatePresence } from 'motion/react'
import { Command } from 'cmdk'
import { useClipStore } from '../store/clipStore'
import { useQueueStore } from '../store/queueStore'
import { useSettingsStore } from '../store/settingsStore'
import { detectLayout, Layout } from '../lib/platform'
import { TypeFilterBar } from './TypeFilterBar'
import { ClipList } from './vertical/ClipList'
import { ClipBoard } from './horizontal/ClipBoard'
import { hideWindow } from '../lib/tauri'
```

- [ ] **Step 2: Add `shown` state and focus listener**

Inside `ClipboardWindow`, add after existing state declarations:
```tsx
const [shown, setShown] = useState(false)

// Show animation when window gains focus
useEffect(() => {
  const appWindow = getCurrentWebviewWindow()
  const unlisten = appWindow.onFocusChanged(({ payload: focused }) => {
    if (focused) setShown(true)
  })
  return () => { unlisten.then(fn => fn()) }
}, [])
```

- [ ] **Step 3: Add `closeReason` ref and replace the Escape handler**

Add a ref to track why the window is closing (hide vs open settings):
```tsx
const closeReason = useRef<'hide' | 'settings'>('hide')
```
Add `useRef` to the React import.

Replace the existing Escape `useEffect`:
```tsx
useEffect(() => {
  const handler = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      closeReason.current = 'hide'
      setShown(false)
    }
  }
  window.addEventListener('keydown', handler)
  return () => window.removeEventListener('keydown', handler)
}, [])
```

- [ ] **Step 4: Update the settings button to set closeReason before animating out**

In the footer button `onClick`:
```tsx
onClick={() => { closeReason.current = 'settings'; setShown(false) }}
```

- [ ] **Step 5: Wrap the return JSX with AnimatePresence + motion.div**

The `onExitComplete` callback checks `closeReason` to decide whether to hide the window or switch to settings. This ensures the settings window opens on a visible OS window.

Replace the outer `motion.div` with:
```tsx
return (
  <AnimatePresence onExitComplete={() => {
    if (closeReason.current === 'settings') {
      onOpenSettings()
    } else {
      hideWindow()
    }
  }}>
    {shown && (
      <motion.div
        className={[
          'flex flex-col bg-[var(--bg-primary)] overflow-hidden',
          isHorizontal ? 'w-screen h-[220px]' : 'w-full h-screen',
        ].join(' ')}
        initial={{ y: 40, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 40, opacity: 0, transition: { duration: 0.18, ease: 'easeIn' } }}
        transition={{ type: 'spring', damping: 28, stiffness: 260 }}
      >
        <Command className="flex flex-col h-full" shouldFilter={false}>
          {/* Search bar */}
          <div className={[
            'flex items-center gap-2 px-3 border-b border-[var(--border-subtle)]',
            isHorizontal ? 'py-2' : 'py-2.5',
          ].join(' ')}>
            <span className="text-[var(--text-muted)] text-sm flex-shrink-0">⌕</span>
            <Command.Input
              value={searchQuery}
              onValueChange={setSearchQuery}
              placeholder="搜索剪贴板..."
              className="flex-1 bg-transparent text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none"
            />
            <span className="text-[10px] text-[var(--text-muted)] flex-shrink-0">{totalCount} 条</span>
          </div>

          {/* Type filter */}
          <TypeFilterBar />

          {/* Content */}
          <Command.List className={[
            'flex flex-1 min-h-0',
            isHorizontal ? 'flex-row' : 'flex-col',
          ].join(' ')}>
            {isHorizontal ? <ClipBoard /> : <ClipList />}
          </Command.List>

          {/* Footer */}
          {!isHorizontal && (
            <div className="flex items-center justify-between px-3 py-1.5 border-t border-[var(--border-subtle)]">
              <div className="flex gap-3">
                <span className="text-[10px] text-[var(--text-muted)]">↵ 粘贴</span>
                <span className="text-[10px] text-[var(--text-muted)]">P 固定</span>
                <span className="text-[10px] text-[var(--text-muted)]">⌫ 删除</span>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => { closeReason.current = 'settings'; setShown(false) }}
                  className="text-[10px] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
                >
                  设置
                </button>
                <span className="text-[10px] text-[var(--text-muted)]">Esc 关闭</span>
              </div>
            </div>
          )}
        </Command>
      </motion.div>
    )}
  </AnimatePresence>
)
```

- [ ] **Step 6: Build frontend and verify no TypeScript errors**

```bash
cd /Users/kylin/pastey && bun run build 2>&1 | tail -30
```
Expected: no TypeScript errors, build succeeds

- [ ] **Step 7: Commit**

```bash
cd /Users/kylin/pastey
git add src/components/ClipboardWindow.tsx src/lib/tauri.ts
git commit -m "feat(frontend): slide-up fade animation with focus/hide_window integration"
```

---

## Task 5: Manual smoke test

- [ ] **Step 1: Run the app**

```bash
cd /Users/kylin/pastey && bun tauri dev
```

- [ ] **Step 2: Verify horizontal layout (macOS)**
  - Press `Cmd+Shift+V` — window should slide up from bottom, full screen width, 220px tall, pinned to bottom edge
  - Press `Escape` — window should slide back down and fade out, then disappear

- [ ] **Step 3: Verify settings override**
  - Open settings → General → change layout to "竖向 (Windows)"
  - Press `Cmd+Shift+V` — window should appear at cursor position, 420×750
  - Change back to "自动" — confirm horizontal layout returns

- [ ] **Step 4: Verify settings button exit animation**
  - In vertical mode: click "设置" — window should animate out before settings opens
