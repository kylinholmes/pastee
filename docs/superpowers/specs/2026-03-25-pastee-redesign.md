# Pastee Redesign — Design Spec

**Date:** 2026-03-25
**Status:** Approved
**Scope:** Full frontend rewrite + feature additions; Rust backend unchanged

---

## 1. Background

Pastee is a local-first, privacy-first clipboard manager built with Tauri + Rust + React. The current UI is a debug-quality single page (`DebugPage.tsx`). This spec covers a full frontend redesign with new features, while keeping the stable Rust backend intact.

**Design philosophy: Zero friction. Natural as breathing.**
When users need it, it's there. When they don't, it's invisible. Never make the user do extra work.

---

## 2. Target Users

General users — developers, designers, knowledge workers. All content types are first-class citizens.

---

## 3. Features

### 3.1 Core (existing, being redesigned)

- Real-time clipboard monitoring: text, HTML, images, files, colors
- Auto-categorization by type (no manual tagging)
- Full-text search with CJK support
- Pin / delete items
- Global hotkey activation (Ctrl+Shift+V / Cmd+Shift+V)
- System tray integration
- Auto-hide on blur

### 3.2 New: Clipboard Queue

When the user copies multiple items in quick succession (within a 3-second window, ≥2 items), they are automatically grouped into a **queue**. Pressing ↵ on the queue pastes items in order, one per paste action (consuming the queue).

- Detection: frontend `queueStore`, time-window based
- No manual activation — it just happens
- Queue groups are always expanded (never collapsed)
- Visual: amber accent color, numbered items (①②③...)

### 3.3 New: OCR (optional)

- Toggle in Settings → OCR
- Pluggable external model via HTTP (URL + API Key)
- When enabled: image clipboard items are OCR'd and their text becomes searchable
- Implemented as a new Rust IPC command `ocr_image(id)` (future backend addition)

---

## 4. Window Behavior

| Mode | Trigger | Position | Animation |
|------|---------|----------|-----------|
| Vertical (Windows default) | Hotkey or near-cursor popup | Follows cursor | Fade in |
| Horizontal (macOS default) | Hotkey | Full screen width, bottom of screen | Slide up from bottom |

- Near-cursor popup: appears beside active input field when clipboard content is available
- Settings allow manual override of auto-detected layout

---

## 5. Frontend Architecture

**Strategy:** Rewrite frontend only. Backend (Rust) is stable with 53 passing tests.

### 5.1 Component Tree

```
App
├── PlatformProvider          # Detects OS, provides layout context
├── SettingsProvider          # Global settings context
└── Router
    ├── ClipboardWindow        # Main popup window
    │   ├── SearchBar
    │   ├── TypeFilterBar      # All / Text / Code / Link / Image / Color / File
    │   ├── ClipList           # Vertical layout (Windows)
    │   │   ├── QueueGroup     # Always expanded, ↵ pastes in order
    │   │   └── ClipItem
    │   └── ClipBoard          # Horizontal layout (macOS)
    │       ├── QueueGroupCard
    │       └── ClipCard
    └── SettingsWindow         # Separate settings window
        ├── SettingsSidebar
        └── SettingsPanel
```

### 5.2 Store Responsibilities

| Store | Responsibility |
|-------|---------------|
| `clipStore` | Clipboard data, search, pagination, real-time events |
| `queueStore` | Queue detection (3s window, ≥2 items), queue state, sequential paste |
| `settingsStore` | Layout preference, hotkeys, OCR config, history retention |

### 5.3 Platform Adaptation

```ts
// src/lib/platform.ts
export type Layout = 'vertical' | 'horizontal'
export function detectLayout(): Layout   // reads Tauri OS info

// settingsStore.layoutOverride can override auto-detection
```

---

## 6. UI Design

### 6.1 Visual Style

- **Dark theme base** — near-black backgrounds (#111 / #1a1a1a)
- **Color-coded content types:**
  - Code: indigo (#6366f1)
  - Links: cyan (#22d3ee)
  - Images: amber (#f59e0b)
  - Text: slate (#94a3b8)
  - Colors: swatch preview
  - Files: neutral
- **Queue groups:** amber accent (#f59e0b), numbered sequence
- Typography: system-ui, tight information density

### 6.2 Vertical Layout (Windows)

- Fixed width (~420px), follows cursor position
- Search bar at top
- Type filter pill tabs below search
- Scrollable list with color-bar left accent per item
- Queue groups rendered inline as expandable sub-list (always shown)
- Footer: keyboard hint bar (↵ Paste, ⌘P Pin, ⌫ Delete)

### 6.3 Horizontal Layout (macOS)

- Full screen width, fixed height (~200px)
- Slides up from bottom of screen
- Search + type filter in a single top bar
- Horizontal scrolling card row
- Queue group card: wider, shows all items stacked inside
- Cards sized by content type (image cards show thumbnail)

### 6.4 Settings Window (both platforms)

Sidebar navigation layout:

| Section | Settings |
|---------|---------|
| General | Launch at login, layout preference (Auto/Vertical/Horizontal), history retention days |
| Appearance | Theme (Dark / Light / System) |
| Shortcuts | Activation hotkey, cursor-popup trigger |
| Storage | Max item count, clear unpinned now |
| OCR | Enable toggle, model URL, API key |
| About | Version, open source link |

---

## 7. Data Flow

```
Clipboard change (OS)
  → Rust clipboard.rs (detect + debounce + deduplicate)
  → SQLite via persist.rs
  → Tauri event: clipboard://new-clip
  → clipStore (frontend)
      → if items within 3s window ≥2 → queueStore groups them
  → UI re-renders
```

---

## 8. Out of Scope (this iteration)

- Cross-device sync
- Manual tags / folders
- Smart paste (context-aware suggestions)
- Sensitive content detection
- Quick actions (translate, format, etc.)
- iOS / Android

---

## 9. Files to Create / Modify

### New files
- `src/lib/platform.ts` — layout detection
- `src/store/queueStore.ts` — queue logic
- `src/store/settingsStore.ts` — settings
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
- `src/App.tsx` — add providers and router
- `src/store/clipStore.ts` — refactor, remove UI logic
- `src/components/DebugPage.tsx` — replace with ClipboardWindow

### Unchanged
- All `src-tauri/` Rust backend files
- `src/lib/tauri.ts` — IPC interface (may add OCR command later)
