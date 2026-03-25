# Pastee Redesign — Design Spec

**Date:** 2026-03-25
**Status:** Approved
**Scope:** Full frontend rewrite + feature additions; Rust backend minimal additions only

---

## 1. Background

Pastee is a local-first, privacy-first clipboard manager built with Tauri + Rust + React. The current UI is a debug-quality single page (`DebugPage.tsx`). This spec covers a full frontend redesign with new features. The Rust backend is stable (53 passing tests) and will receive only two targeted additions described below.

**Design philosophy: Zero friction. Natural as breathing.**
When users need it, it's there. When they don't, it's invisible. Never make the user do extra work.

---

## 2. Target Users

General users — developers, designers, knowledge workers. All content types are first-class citizens.

---

## 3. Features

### 3.1 Core (existing, being redesigned)

- Real-time clipboard monitoring: text, HTML, images, files, colors
- Auto-categorization by content type (no manual tagging)
- Full-text search with CJK support
- Pin / delete items
- Global hotkey activation (Ctrl+Shift+V / Cmd+Shift+V)
- System tray integration
- Auto-hide on blur
- Image loading states handled via existing events: `clipboard://image-pending`, `clipboard://image-ready`, `clipboard://image-error`

### 3.2 New: Clipboard Queue

When the user copies multiple items in quick succession, they are automatically grouped into a **queue**. Pressing ↵ on the queue pastes items in order one by one.

**Detection rules (rolling window):**
- Window: 3 seconds, **rolling** — each new copy extends the window from that item's timestamp
- Minimum group size: 2 items
- A 4th item copied within 3s of the 3rd joins the same queue
- If the user waits >3s, a new queue can start
- Mid-queue paste: the pasted item is consumed (removed from queue head); remaining items stay in the queue until the window closes or all are consumed

**Paste mechanism:**
- Queue paste writes item content to the system clipboard via a new Rust command `paste_clip(id: number)`, then simulates Ctrl+V / Cmd+V using `enigo` (or equivalent). This requires a minimal Rust backend addition.
- The window stays open during sequential queue paste

**Visual:**
- Amber accent (#f59e0b), numbered items (①②③...)
- Always expanded, never collapsed
- Queue groups appear at the top of the list

**Detection lives in:** `queueStore` (frontend), listens to `clipStore` item additions

### 3.3 New: OCR (optional, deferred)

OCR requires a new `ocr_image(id)` Rust command. This is **out of scope for this iteration** and will be a separate backend addition. The Settings → OCR panel is scaffolded (toggle + URL + API key fields) but non-functional until the backend is ready.

---

## 4. Window Behavior

| Mode | Trigger | Position | Animation |
|------|---------|----------|-----------|
| Vertical (Windows default) | Hotkey | Follows cursor position at hotkey press | Fade in |
| Horizontal (macOS default) | Hotkey | Full screen width, bottom of screen | Slide up from bottom |

**Near-cursor popup (vertical mode only):**
- Triggered by hotkey when cursor is inside an input field
- Window positioned adjacent to cursor using Tauri `window.setPosition()` with current mouse coordinates from `@tauri-apps/plugin-global-shortcut` or a new lightweight Rust command `get_cursor_position()` returning `{x, y}`
- This requires a minimal Rust backend addition (cursor position query)
- Falls back to center-screen if cursor position cannot be determined

**Settings override:** `settingsStore.layoutOverride: 'auto' | 'vertical' | 'horizontal'` overrides platform detection.

---

## 5. Frontend Architecture

**Strategy:** Rewrite frontend. Rust backend receives two targeted additions: `paste_clip` and `get_cursor_position`. All existing backend commands and tests remain unchanged.

**Tech stack:** See full details in `docs/superpowers/specs/2026-03-25-frontend-stack.md`

| 类别 | 库 |
|------|---|
| 样式 | Tailwind CSS 4（手写，不用预设组件库） |
| 动效 | `motion` |
| 搜索+键盘导航 | `cmdk` |
| 无障碍原语 | `@radix-ui/react-dialog` / `tooltip` / `scroll-area` |
| 快捷键 | `react-hotkeys-hook` |
| 设置持久化 | `@tauri-apps/plugin-store` |
| 状态管理 | Zustand 5（已有） |
| 图标 | Lucide React（已有） |

### 5.1 Component Tree

```
App
├── PlatformProvider            # Detects OS, provides layout context
├── SettingsProvider            # Global settings context
└── conditional render (no router)
    ├── ClipboardWindow         # Main popup window (default view)
    │   ├── SearchBar
    │   ├── TypeFilterBar       # All / Text / Html / Image / Color / Files
    │   ├── ClipList            # Vertical layout (Windows)
    │   │   ├── QueueGroup      # Always expanded, ↵ pastes in order
    │   │   └── ClipItem
    │   └── ClipBoard           # Horizontal layout (macOS)
    │       ├── QueueGroupCard
    │       └── ClipCard
    └── SettingsWindow          # Shown when user opens settings (tray or shortcut)
        ├── SettingsSidebar
        └── SettingsPanel
```

No URL router. `ClipboardWindow` and `SettingsWindow` are mutually exclusive views rendered conditionally. Settings can open in a separate Tauri window or as an overlay — implementer's choice, but separate window is preferred to avoid disrupting clipboard access.

### 5.2 Store Responsibilities

| Store | Responsibility |
|-------|---------------|
| `clipStore` | Clipboard data, search, pagination, real-time events, image loading state |
| `queueStore` | Queue detection (rolling 3s window, ≥2 items), queue state, sequential paste via `paste_clip` |
| `settingsStore` | Layout override, hotkeys, OCR config (future), history retention days, `keep_window_open` flag |

**`keep_window_open`:** Currently lives in Rust `AppState`. After the rewrite, `settingsStore` mirrors this value and calls `set_keep_window_open(bool)` to sync with Rust on change. Rust side is kept as-is.

**Settings persistence:** `settingsStore` persists via Tauri's `store` plugin (`@tauri-apps/plugin-store`), writing to a JSON file in the app data directory. This is already a dependency in the project or can be added; it is the idiomatic Tauri approach for settings.

### 5.3 Platform Adaptation

```ts
// src/lib/platform.ts
export type Layout = 'vertical' | 'horizontal'
export function detectLayout(): Layout   // uses Tauri os.platform()
// Returns 'horizontal' for darwin, 'vertical' for win32/linux
```

---

## 6. UI Design

### 6.1 Visual Style

- **Dark theme base** — near-black backgrounds (#111 / #1a1a1a)
- **Color-coded by backend `content_type`:**
  - `Text`: slate (#94a3b8)
  - `Html`: indigo (#6366f1) — shown as "Code/Rich Text" in UI labels
  - `Image`: amber (#f59e0b)
  - `Color`: the color value itself as a swatch
  - `Files`: neutral (#64748b)
- **Type filter labels** map to backend types: All / Text / Html / Image / Color / Files
- **Queue groups:** amber accent (#f59e0b), numbered sequence (①②③...)
- Typography: system-ui, tight information density

### 6.2 Vertical Layout (Windows)

- Fixed width (~420px), positioned near cursor on activation
- Search bar at top
- Type filter pill tabs below search
- Scrollable list; each item has a color-bar left accent
- Queue groups appear at list top, always expanded
- Keyboard navigation: arrow keys to move, ↵ to paste, ⌘/Ctrl+P to pin, ⌫ to delete
- Footer: keyboard hint bar (↵ Paste / ⌫ Delete / P Pin)

### 6.3 Horizontal Layout (macOS)

- Full screen width, fixed height (~200px), slides up from bottom
- Top bar: search input + type filter pills in one row
- Horizontal scrolling card row
- Queue group card: wider card, sub-items stacked vertically inside
- Image cards show thumbnail from `getImageUrl(id, thumbnail=true)`
- Keyboard navigation: left/right arrows, ↵ to paste

### 6.4 Settings Window (both platforms)

Separate window, sidebar navigation:

| Section | Settings |
|---------|---------|
| General | Launch at login, layout preference (Auto/Vertical/Horizontal), history retention days, max item count |
| Appearance | Theme (Dark / Light / System) |
| Shortcuts | Activation hotkey (editable), keep window open toggle |
| Storage | Clear unpinned now button |
| OCR | Enable toggle (disabled until backend ready), model URL, API key — scaffolded only |
| About | Version, open source link |

---

## 7. Data Flow

```
Clipboard change (OS)
  → Rust clipboard.rs (detect + debounce + deduplicate)
  → SQLite via persist.rs
  → Tauri event: clipboard://new-clip  →  clipStore.addItem()
      → queueStore.onItemAdded(item)   →  rolling 3s window check
          → if ≥2 items in window: create/extend QueueGroup
  → Tauri event: clipboard://image-pending  →  clipStore sets item loading=true
  → Tauri event: clipboard://image-ready    →  clipStore updates item with thumbnail
  → Tauri event: clipboard://image-error    →  clipStore sets item error=true
  → UI re-renders

Queue paste:
  User presses ↵ on QueueGroup
  → queueStore.pasteNext()
      → invoke paste_clip(item.id)     # writes to clipboard + simulates keypress
      → remove item from queue head
      → if queue empty: dissolve group
```

---

## 8. Required Backend Additions

Two minimal Rust additions (existing tests unaffected):

| Command | Signature | Purpose |
|---------|-----------|---------|
| `paste_clip` | `paste_clip(id: u32) -> Result<()>` | Write clip content to clipboard, then simulate Ctrl+V / Cmd+V via `enigo` |
| `get_cursor_position` | `get_cursor_position() -> Result<{x: i32, y: i32}>` | Return current mouse cursor screen coordinates for window positioning |

---

## 9. Out of Scope (this iteration)

- OCR backend command `ocr_image` (Settings panel scaffolded but non-functional)
- Cross-device sync
- Manual tags / folders
- Smart paste (context-aware suggestions)
- Sensitive content detection
- Quick actions (translate, format, etc.)
- iOS / Android

---

## 10. Files to Create / Modify

### New files
- `src/lib/platform.ts` — layout detection
- `src/store/queueStore.ts` — queue logic and sequential paste
- `src/store/settingsStore.ts` — settings with plugin-store persistence
- `src/components/ClipboardWindow.tsx` — main window shell
- `src/components/SearchBar.tsx`
- `src/components/TypeFilterBar.tsx`
- `src/components/vertical/ClipList.tsx`
- `src/components/vertical/ClipItem.tsx`
- `src/components/vertical/QueueGroup.tsx`
- `src/components/horizontal/ClipBoard.tsx`
- `src/components/horizontal/ClipCard.tsx`
- `src/components/horizontal/QueueGroupCard.tsx`
- `src/components/settings/SettingsWindow.tsx`
- `src/components/settings/SettingsSidebar.tsx`
- `src/components/settings/panels/GeneralPanel.tsx`
- `src/components/settings/panels/AppearancePanel.tsx`
- `src/components/settings/panels/ShortcutsPanel.tsx`
- `src/components/settings/panels/StoragePanel.tsx`
- `src/components/settings/panels/OcrPanel.tsx`
- `src/components/settings/panels/AboutPanel.tsx`

### Modified files
- `src/App.tsx` — add providers, conditional window render
- `src/store/clipStore.ts` — retain image state handling, remove UI logic
- `src/lib/tauri.ts` — add `paste_clip`, `get_cursor_position` bindings
- `src/components/DebugPage.tsx` — can be deleted once ClipboardWindow is complete
- `src-tauri/src/lib.rs` — add `paste_clip` and `get_cursor_position` commands
- `src-tauri/Cargo.toml` — add `enigo` dependency

### Unchanged
- `src-tauri/src/clipboard.rs`
- `src-tauri/src/persist.rs`
- `src-tauri/src/setting.rs`
- `src-tauri/migrations/`
