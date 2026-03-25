# Pastee Frontend Rewrite Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the debug-quality single-page UI with a production-ready dual-platform clipboard manager UI (vertical list for Windows, horizontal cards for macOS), including clipboard queue detection, settings window, and the full new tech stack.

**Architecture:** Frontend-only rewrite on top of the stable Rust backend. New stores (`queueStore`, `settingsStore`) are added alongside the refactored `clipStore`. Platform layout is auto-detected via Tauri OS API and can be overridden in settings. `cmdk` drives search + keyboard navigation; `motion` handles animations; `@tauri-apps/plugin-store` persists settings.

**Tech Stack:** React 19, TypeScript, Tailwind CSS 4, Zustand 5, motion, cmdk, @radix-ui/react-dialog + tooltip + scroll-area, @tauri-apps/plugin-store, Lucide React, bun

---

## File Map

### Delete (old UI components no longer needed)
- `src/components/ui/` — all files (Base UI shadcn components, replaced by hand-written Tailwind)
- `src/components/example.tsx`
- `src/components/component-example.tsx`

### Keep & Modify
- `src/index.css` — add CSS custom properties (color tokens)
- `src/App.tsx` — add providers + conditional render
- `src/store/clipStore.ts` — remove `confirm()` dialogs, clean up console.logs, keep all logic
- `src/lib/tauri.ts` — add `clearUnpinnedClips`, `setKeepWindowOpen`, `toggleWindow` exports
- `src/components/DebugPage.tsx` — keep but rewrite with Tailwind + new store APIs (used for testing)

### New Files
```
src/
├── lib/
│   └── platform.ts              # detectLayout() → 'vertical' | 'horizontal'
├── store/
│   ├── queueStore.ts            # clipboard queue detection + state
│   └── settingsStore.ts         # settings with plugin-store persistence
├── components/
│   ├── ClipboardWindow.tsx      # main window shell, selects layout + inlines search bar
│   ├── SearchBar.tsx            # NOTE: inlined into ClipboardWindow — no separate file needed (single consumer)
│   ├── TypeFilterBar.tsx        # type filter pills
│   ├── vertical/
│   │   ├── ClipList.tsx         # vertical scrollable list
│   │   ├── ClipItem.tsx         # single list item
│   │   └── QueueGroup.tsx       # queue group (always expanded)
│   ├── horizontal/
│   │   ├── ClipBoard.tsx        # horizontal card row
│   │   ├── ClipCard.tsx         # single card
│   │   └── QueueGroupCard.tsx   # queue group card
│   └── settings/
│       ├── SettingsWindow.tsx   # settings window shell
│       ├── SettingsSidebar.tsx  # nav sidebar
│       └── panels/
│           ├── GeneralPanel.tsx
│           ├── AppearancePanel.tsx
│           ├── ShortcutsPanel.tsx
│           ├── StoragePanel.tsx
│           ├── OcrPanel.tsx
│           └── AboutPanel.tsx
```

---

## Chunk 1: Foundation — deps, tokens, platform, stores

### Task 1: Install dependencies and remove old ones

**Files:**
- Modify: `package.json`
- Modify: `bun.lock` (automatic)

- [ ] **Step 1: Install new deps**
```bash
cd /c/Users/kylin/pastee
bun add motion cmdk @radix-ui/react-dialog @radix-ui/react-tooltip @radix-ui/react-scroll-area @tauri-apps/plugin-store
```
Expected: packages added to `node_modules` and `bun.lock`

- [ ] **Step 2: Remove unused deps**
```bash
# Check what is actually installed first
grep -E "base-ui|class-variance|radix-ui/react-slot" package.json
# Then remove what is present
bun remove @base-ui-components/react class-variance-authority @radix-ui/react-slot
```
Note: keep `clsx` and `tailwind-merge` — still useful for cx() utility. If a package is not in package.json, bun remove will warn but not fail.

- [ ] **Step 3: Verify dev server starts**
```bash
bun run dev
```
Expected: Vite starts without errors. Browser shows existing DebugPage.

- [ ] **Step 4: Commit**
```bash
git add package.json bun.lock
git commit -m "chore: install motion, cmdk, radix-ui, plugin-store; remove unused deps"
```

---

### Task 2: CSS color tokens

**Files:**
- Modify: `src/index.css`

- [ ] **Step 1: Add CSS custom properties**

Replace `src/index.css` content with:
```css
@import "tailwindcss";

*, *::before, *::after {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

html, body {
  width: 100%;
  height: 100%;
  overflow: hidden;
}

#root {
  width: 100%;
  height: 100%;
}

:root {
  --bg-primary: #111111;
  --bg-secondary: #1a1a1a;
  --bg-elevated: #222222;
  --bg-hover: #252525;
  --border: #2a2a2a;
  --border-subtle: #1e1e1e;

  --text-primary: #e2e8f0;
  --text-secondary: #94a3b8;
  --text-muted: #475569;

  --type-text: #94a3b8;
  --type-html: #6366f1;
  --type-image: #f59e0b;
  --type-files: #64748b;
  --type-color-border: #525252;

  --queue: #f59e0b;
  --queue-bg: rgba(245, 158, 11, 0.08);
  --queue-border: rgba(245, 158, 11, 0.2);

  --accent: #6366f1;
  --accent-hover: #818cf8;

  --scrollbar-thumb: #2a2a2a;
  --scrollbar-thumb-hover: #3a3a3a;
}

/* Custom scrollbar */
::-webkit-scrollbar { width: 4px; height: 4px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: var(--scrollbar-thumb); border-radius: 2px; }
::-webkit-scrollbar-thumb:hover { background: var(--scrollbar-thumb-hover); }
```

- [ ] **Step 2: Verify app still loads**
```bash
bun run dev
```
Expected: DebugPage still renders correctly.

- [ ] **Step 3: Commit**
```bash
git add src/index.css
git commit -m "style: add CSS color token system"
```

---

### Task 3: Platform detection

**Files:**
- Create: `src/lib/platform.ts`

- [ ] **Step 1: Create platform.ts**
```typescript
// src/lib/platform.ts
import { platform } from '@tauri-apps/plugin-os'

export type Layout = 'vertical' | 'horizontal'

let _layout: Layout | null = null

export async function detectLayout(): Promise<Layout> {
  if (_layout) return _layout
  try {
    const os = await platform()
    _layout = os === 'macos' ? 'horizontal' : 'vertical'
  } catch {
    _layout = 'vertical'
  }
  return _layout
}

export function resetLayoutCache() {
  _layout = null
}
```

Note: `@tauri-apps/plugin-os` is a **separate Tauri plugin** — needs JS package + Rust registration.

- [ ] **Step 1b: Install plugin-os JS package**
```bash
bun add @tauri-apps/plugin-os
```

- [ ] **Step 1c: Add plugin-os to Rust Cargo.toml**

In `src-tauri/Cargo.toml` under `[dependencies]`, add:
```toml
tauri-plugin-os = "2"
```

- [ ] **Step 1d: Register plugin-os in lib.rs**

In `src-tauri/src/lib.rs`, add alongside the existing `.plugin(...)` calls in the builder chain:
```rust
.plugin(tauri_plugin_os::init())
```

- [ ] **Step 1e: Verify Rust builds**
```bash
bun run tauri build --debug 2>&1 | tail -10
```
Expected: compiles without errors.

- [ ] **Step 2: Verify TypeScript compiles**
```bash
bun run build 2>&1 | head -20
```
Expected: no TypeScript errors for this file.

- [ ] **Step 3: Commit**
```bash
git add src/lib/platform.ts
git commit -m "feat: add platform layout detection"
```

---

### Task 4: settingsStore

**Files:**
- Create: `src/store/settingsStore.ts`

- [ ] **Step 1: Create settingsStore**
```typescript
// src/store/settingsStore.ts
import { create } from 'zustand'
import { LazyStore } from '@tauri-apps/plugin-store'

const store = new LazyStore('settings.json')

export type LayoutOverride = 'auto' | 'vertical' | 'horizontal'
export type Theme = 'dark' | 'light' | 'system'

interface Settings {
  layoutOverride: LayoutOverride
  theme: Theme
  activationHotkey: string
  keepWindowOpen: boolean
  historyRetentionDays: number
  maxItemCount: number
  ocrEnabled: boolean
  ocrModelUrl: string
  ocrApiKey: string
}

const DEFAULTS: Settings = {
  layoutOverride: 'auto',
  theme: 'dark',
  activationHotkey: 'Ctrl+Shift+V',
  keepWindowOpen: false,
  historyRetentionDays: 30,
  maxItemCount: 500,
  ocrEnabled: false,
  ocrModelUrl: '',
  ocrApiKey: '',
}

interface SettingsStore extends Settings {
  loaded: boolean
  load: () => Promise<void>
  update: <K extends keyof Settings>(key: K, value: Settings[K]) => Promise<void>
}

export const useSettingsStore = create<SettingsStore>((set, get) => ({
  ...DEFAULTS,
  loaded: false,

  load: async () => {
    const entries = await Promise.all(
      (Object.keys(DEFAULTS) as (keyof Settings)[]).map(async (key) => {
        const val = await store.get<Settings[typeof key]>(key)
        return [key, val ?? DEFAULTS[key]] as const
      })
    )
    set({ ...Object.fromEntries(entries), loaded: true } as any)
  },

  update: async (key, value) => {
    set({ [key]: value } as any)
    await store.set(key, value)
    await store.save()
  },
}))
```

- [ ] **Step 2: Verify TypeScript compiles**
```bash
bun run build 2>&1 | head -20
```
Expected: no errors.

- [ ] **Step 3: Commit**
```bash
git add src/store/settingsStore.ts
git commit -m "feat: add settingsStore with plugin-store persistence"
```

---

### Task 5: queueStore

**Files:**
- Create: `src/store/queueStore.ts`

- [ ] **Step 1: Create queueStore**
```typescript
// src/store/queueStore.ts
import { create } from 'zustand'

const QUEUE_WINDOW_MS = 3000

export interface QueueGroup {
  id: string           // group identifier
  itemIds: number[]    // clip IDs in order
  createdAt: number
  lastAddedAt: number
}

interface QueueStore {
  groups: QueueGroup[]
  // Called by clipStore whenever a new clip arrives
  onItemAdded: (clipId: number, timestamp: number) => void
  // Consume the next item from a group (called after paste)
  consumeItem: (groupId: string) => void
  // Remove entire group
  dissolveGroup: (groupId: string) => void
  // Find which group (if any) an item belongs to
  groupForItem: (clipId: number) => QueueGroup | undefined
}

export const useQueueStore = create<QueueStore>((set, get) => ({
  groups: [],

  onItemAdded: (clipId, timestamp) => {
    const { groups } = get()
    const now = timestamp

    // Find a group whose last-added item is within the rolling window
    const activeGroup = groups.find(
      g => now - g.lastAddedAt <= QUEUE_WINDOW_MS
    )

    if (activeGroup) {
      // Extend existing group
      set({
        groups: groups.map(g =>
          g.id === activeGroup.id
            ? { ...g, itemIds: [...g.itemIds, clipId], lastAddedAt: now }
            : g
        )
      })
    } else {
      // Start a new potential group (single item — not a group yet)
      const newGroup: QueueGroup = {
        id: `q-${now}-${clipId}`,
        itemIds: [clipId],
        createdAt: now,
        lastAddedAt: now,
      }
      set({ groups: [...groups, newGroup] })
    }

    // Clean up groups that are single-item AND outside the window
    setTimeout(() => {
      const { groups: current } = get()
      set({
        groups: current.filter(g => {
          const isExpired = Date.now() - g.lastAddedAt > QUEUE_WINDOW_MS
          const isSingle = g.itemIds.length === 1
          return !(isExpired && isSingle)
        })
      })
    }, QUEUE_WINDOW_MS + 100)
  },

  consumeItem: (groupId) => {
    const { groups } = get()
    const group = groups.find(g => g.id === groupId)
    if (!group) return

    if (group.itemIds.length <= 1) {
      // Last item — dissolve group
      set({ groups: groups.filter(g => g.id !== groupId) })
    } else {
      set({
        groups: groups.map(g =>
          g.id === groupId
            ? { ...g, itemIds: g.itemIds.slice(1) }
            : g
        )
      })
    }
  },

  dissolveGroup: (groupId) => {
    set({ groups: get().groups.filter(g => g.id !== groupId) })
  },

  groupForItem: (clipId) => {
    return get().groups.find(g => g.itemIds.includes(clipId))
  },
}))

// Selector: only groups with ≥2 items are "real" queues shown in UI
export const selectVisibleGroups = (state: QueueStore) =>
  state.groups.filter(g => g.itemIds.length >= 2)
```

- [ ] **Step 2: Verify TypeScript compiles**
```bash
bun run build 2>&1 | head -20
```
Expected: no errors.

- [ ] **Step 3: Commit**
```bash
git add src/store/queueStore.ts
git commit -m "feat: add queueStore with rolling 3s window queue detection"
```

---

### Task 6: Refactor clipStore

**Files:**
- Modify: `src/store/clipStore.ts`

- [ ] **Step 1: Update clipStore**

Replace `src/store/clipStore.ts` with:
```typescript
// src/store/clipStore.ts
import { create } from 'zustand'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'

export type ClipType = 'Text' | 'Image' | 'Html' | 'Files' | 'Color'

export interface ClipItem {
  id: number
  content_type: ClipType
  preview: string
  created_at: number
  is_pinned: boolean
  tags: string[]
  loading?: boolean
  temp_id?: number
}

interface ClipStore {
  allClips: ClipItem[]
  searchResults: ClipItem[]
  searchQuery: string
  filterType: ClipType | ''
  limit: number
  offset: number
  thumbnailCache: Map<number, string>
  totalCount: number

  displayList: () => ClipItem[]
  setSearchQuery: (query: string) => void
  setFilterType: (type: ClipType | '') => void
  setOffset: (offset: number) => void
  fetchAllClips: () => Promise<void>
  fetchTotalCount: () => Promise<void>
  handleSearch: (query: string) => Promise<void>
  handleDelete: (id: number) => Promise<void>
  handlePin: (id: number) => Promise<void>
  initListener: (onNewClip?: (id: number, timestamp: number) => void) => Promise<() => void>
}

export const useClipStore = create<ClipStore>((set, get) => ({
  allClips: [],
  searchResults: [],
  searchQuery: '',
  filterType: '',
  limit: 50,
  offset: 0,
  thumbnailCache: new Map(),
  totalCount: 0,

  displayList: () => {
    const { searchQuery, searchResults, allClips, filterType } = get()
    let list = searchQuery.trim() ? searchResults : allClips
    if (filterType) {
      list = list.filter(item => item.content_type === filterType)
    }
    return list
  },

  setSearchQuery: (query) => {
    set({ searchQuery: query })
    get().handleSearch(query)
  },

  setFilterType: (type) => set({ filterType: type }),

  setOffset: (offset) => {
    set({ offset })
    get().fetchAllClips()
  },

  fetchAllClips: async () => {
    const { limit, offset } = get()
    const result = await invoke<ClipItem[]>('get_recent_clips', { limit, offset })
    set({ allClips: result })
  },

  fetchTotalCount: async () => {
    const count = await invoke<number>('get_total_count')
    set({ totalCount: count })
  },

  handleSearch: async (query: string) => {
    if (!query.trim()) {
      set({ searchResults: [] })
      return
    }
    const result = await invoke<ClipItem[]>('search_clips', { query })
    set({ searchResults: result })
  },

  handleDelete: async (id: number) => {
    await invoke('delete_clip', { id })
    await get().fetchAllClips()
    const { searchQuery } = get()
    if (searchQuery) await get().handleSearch(searchQuery)
    const count = await invoke<number>('get_total_count')
    set({ totalCount: count })
  },

  handlePin: async (id: number) => {
    await invoke('toggle_pin', { id })
    await get().fetchAllClips()
    const { searchQuery } = get()
    if (searchQuery) await get().handleSearch(searchQuery)
  },

  initListener: async (onNewClip) => {
    const unlistenNormal = await listen<{ type: string; preview: string }>('clipboard://new-clip', (_event) => {
      // NOTE: The backend new-clip payload does NOT include an id field for text/html/files.
      // Queue detection uses a sequence counter + timestamp, not clip id.
      // The actual clip id is retrieved after fetchAllClips() resolves.
      const now = Date.now()
      get().fetchAllClips().then(() => {
        // After fetch, the newest item is allClips[0] — pass its real id to queueStore
        const newest = get().allClips[0]
        if (newest) onNewClip?.(newest.id, now)
      })
      set(s => ({ totalCount: s.totalCount + 1 }))
      const { searchQuery } = get()
      if (searchQuery) get().handleSearch(searchQuery)
    })

    const unlistenImagePending = await listen<{ temp_id: number }>('clipboard://image-pending', (event) => {
      const { temp_id } = event.payload
      const placeholder: ClipItem = {
        id: 0,
        temp_id,
        content_type: 'Image',
        preview: '',
        created_at: Date.now() * 1000,
        is_pinned: false,
        tags: [],
        loading: true,
      }
      set(s => ({ allClips: [placeholder, ...s.allClips] }))
    })

    const unlistenImageReady = await listen<{ temp_id: number; id: number; thumbnail?: string }>('clipboard://image-ready', (event) => {
      const { temp_id, id, thumbnail } = event.payload
      const { thumbnailCache } = get()
      if (thumbnail) {
        thumbnailCache.set(id, `data:image/webp;base64,${thumbnail}`)
      }
      set(s => ({
        allClips: s.allClips.filter(item => item.temp_id !== temp_id),
        thumbnailCache: new Map(thumbnailCache),
        totalCount: s.totalCount + 1,
      }))
      get().fetchAllClips()
    })

    const unlistenImageError = await listen<{ temp_id: number }>('clipboard://image-error', (event) => {
      const { temp_id } = event.payload
      set(s => ({ allClips: s.allClips.filter(item => item.temp_id !== temp_id) }))
    })

    return () => {
      unlistenNormal()
      unlistenImagePending()
      unlistenImageReady()
      unlistenImageError()
    }
  },
}))
```

Key changes: removed `confirm()`, removed all `console.log/error`, increased default limit to 50, added `onNewClip` callback to `initListener` for queueStore integration, exported `ClipType`.

- [ ] **Step 2: Verify build**
```bash
bun run build 2>&1 | head -30
```
Expected: no errors.

- [ ] **Step 3: Commit**
```bash
git add src/store/clipStore.ts
git commit -m "refactor: clean up clipStore, add onNewClip callback for queue integration"
```

---

## Chunk 2: Vertical layout (Windows)

### Task 7: Shared TypeFilterBar

**Files:**
- Create: `src/components/TypeFilterBar.tsx`

- [ ] **Step 1: Create TypeFilterBar**
```tsx
// src/components/TypeFilterBar.tsx
import { ClipType, useClipStore } from '../store/clipStore'

const FILTERS: { label: string; value: ClipType | '' }[] = [
  { label: '全部', value: '' },
  { label: 'Text', value: 'Text' },
  { label: 'Html', value: 'Html' },
  { label: 'Image', value: 'Image' },
  { label: 'Color', value: 'Color' },
  { label: 'Files', value: 'Files' },
]

const TYPE_COLORS: Record<ClipType, string> = {
  Text: 'text-[#94a3b8]',
  Html: 'text-[#6366f1]',
  Image: 'text-[#f59e0b]',
  Color: 'text-[#94a3b8]',
  Files: 'text-[#64748b]',
}

export function TypeFilterBar() {
  const { filterType, setFilterType } = useClipStore()

  return (
    <div className="flex gap-1.5 px-3 py-2 overflow-x-auto scrollbar-none border-b border-[var(--border-subtle)]">
      {FILTERS.map(({ label, value }) => {
        const active = filterType === value
        const colorClass = value ? TYPE_COLORS[value] : 'text-[var(--text-primary)]'
        return (
          <button
            key={value}
            onClick={() => setFilterType(value)}
            className={[
              'px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-colors',
              active
                ? 'bg-[var(--bg-elevated)] text-[var(--text-primary)]'
                : `${colorClass} hover:bg-[var(--bg-elevated)]`,
            ].join(' ')}
          >
            {label}
          </button>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 2: Commit**
```bash
git add src/components/TypeFilterBar.tsx
git commit -m "feat: add TypeFilterBar component"
```

---

### Task 8: ClipItem (vertical)

**Files:**
- Create: `src/components/vertical/ClipItem.tsx`

- [ ] **Step 0: Create vertical directory**
```bash
mkdir -p /c/Users/kylin/pastee/src/components/vertical
```

- [ ] **Step 1: Create ClipItem**
```tsx
// src/components/vertical/ClipItem.tsx
import { ClipItem as ClipItemType, useClipStore } from '../../store/clipStore'

const TYPE_BAR_COLORS: Record<string, string> = {
  Text: 'bg-[#94a3b8]',
  Html: 'bg-[#6366f1]',
  Image: 'bg-[#f59e0b]',
  Color: 'bg-[#94a3b8]',
  Files: 'bg-[#64748b]',
}

const TYPE_LABELS: Record<string, string> = {
  Text: '文本',
  Html: 'Html',
  Image: '图片',
  Color: '颜色',
  Files: '文件',
}

interface Props {
  item: ClipItemType
  isSelected?: boolean
  onClick?: () => void
}

export function ClipItem({ item, isSelected, onClick }: Props) {
  const { handlePin, handleDelete, thumbnailCache } = useClipStore()
  const barColor = TYPE_BAR_COLORS[item.content_type] ?? 'bg-[var(--text-muted)]'
  const typeLabel = TYPE_LABELS[item.content_type] ?? item.content_type
  const timeStr = new Date(item.created_at / 1000).toLocaleTimeString('zh-CN', {
    hour: '2-digit', minute: '2-digit'
  })

  return (
    <div
      onClick={onClick}
      className={[
        'group flex items-start gap-2.5 px-3 py-2.5 mx-2 rounded-lg cursor-pointer transition-colors',
        isSelected ? 'bg-[var(--bg-elevated)]' : 'hover:bg-[var(--bg-hover)]',
      ].join(' ')}
    >
      {/* Color accent bar */}
      <div className={`w-0.5 h-full min-h-[28px] rounded-full flex-shrink-0 mt-0.5 ${barColor}`} />

      {/* Content */}
      <div className="flex-1 min-w-0">
        {item.loading ? (
          <div className="flex items-center gap-2 py-1">
            <span className="text-xs text-[var(--text-muted)] animate-pulse">处理中...</span>
          </div>
        ) : item.content_type === 'Color' ? (
          <div className="flex items-center gap-2">
            <div
              className="w-5 h-5 rounded-full flex-shrink-0 border border-[var(--type-color-border)]"
              style={{ backgroundColor: item.preview }}
            />
            <span className="text-sm text-[var(--text-primary)] truncate">{item.preview}</span>
          </div>
        ) : item.content_type === 'Image' ? (
          <div className="flex items-center gap-2">
            {thumbnailCache.get(item.id) ? (
              <img
                src={thumbnailCache.get(item.id)}
                alt="clip"
                className="h-10 w-16 object-cover rounded"
              />
            ) : (
              <div className="h-10 w-16 bg-[var(--bg-elevated)] rounded flex items-center justify-center">
                <span className="text-xs text-[var(--text-muted)]">图片</span>
              </div>
            )}
          </div>
        ) : (
          <p className="text-sm text-[var(--text-primary)] truncate leading-snug">{item.preview}</p>
        )}

        <div className="flex items-center gap-1.5 mt-1">
          <span className="text-[10px] text-[var(--text-muted)]">{typeLabel}</span>
          <span className="text-[10px] text-[var(--text-muted)]">·</span>
          <span className="text-[10px] text-[var(--text-muted)]">{timeStr}</span>
          {item.is_pinned && (
            <span className="text-[10px] text-[var(--accent)]">· 已固定</span>
          )}
        </div>
      </div>

      {/* Actions (show on hover/selected) */}
      <div className={[
        'flex items-center gap-1 flex-shrink-0 transition-opacity',
        isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100',
      ].join(' ')}>
        <button
          onClick={(e) => { e.stopPropagation(); handlePin(item.id) }}
          className="px-1.5 py-0.5 text-[10px] text-[var(--text-muted)] hover:text-[var(--text-primary)] rounded transition-colors"
          disabled={item.loading}
        >
          {item.is_pinned ? '取消' : '固定'}
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); handleDelete(item.id) }}
          className="px-1.5 py-0.5 text-[10px] text-red-400 hover:text-red-300 rounded transition-colors"
          disabled={item.loading}
        >
          删除
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**
```bash
git add src/components/vertical/ClipItem.tsx
git commit -m "feat: add ClipItem component for vertical layout"
```

---

### Task 9: QueueGroup (vertical)

**Files:**
- Create: `src/components/vertical/QueueGroup.tsx`

- [ ] **Step 1: Create QueueGroup**
```tsx
// src/components/vertical/QueueGroup.tsx
import { QueueGroup as QueueGroupType, useQueueStore } from '../../store/queueStore'
import { useClipStore } from '../../store/clipStore'

interface Props {
  group: QueueGroupType
}

export function QueueGroup({ group }: Props) {
  const { allClips } = useClipStore()
  const { dissolveGroup } = useQueueStore()
  const items = group.itemIds
    .map(id => allClips.find(c => c.id === id))
    .filter(Boolean) as NonNullable<typeof allClips[number]>[]

  if (items.length < 2) return null

  return (
    <div className="mx-2 mb-1 rounded-lg border border-[var(--queue-border)] bg-[var(--queue-bg)]">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2">
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] font-semibold text-[var(--queue)]">⚡ 队列 · {items.length} 项</span>
        </div>
        <button
          onClick={() => dissolveGroup(group.id)}
          className="text-[10px] text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors"
        >
          解散
        </button>
      </div>

      {/* Items */}
      <div className="flex flex-col gap-1 px-2 pb-2">
        {items.map((item, index) => (
          <div
            key={item.id}
            className="flex items-center gap-2 bg-[var(--bg-secondary)] rounded px-2.5 py-1.5"
          >
            <span className="text-[10px] font-bold text-[var(--queue)] flex-shrink-0 w-4">
              {['①','②','③','④','⑤','⑥','⑦','⑧','⑨'][index] ?? `${index+1}.`}
            </span>
            <p className="text-xs text-[var(--text-primary)] truncate flex-1">{item.preview}</p>
          </div>
        ))}
      </div>

      {/* Footer hint */}
      <div className="border-t border-[var(--queue-border)] px-3 py-1.5">
        <span className="text-[10px] text-[var(--queue)] opacity-70">↵ 顺序粘贴</span>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**
```bash
git add src/components/vertical/QueueGroup.tsx
git commit -m "feat: add QueueGroup component for vertical layout"
```

---

### Task 10: ClipList (vertical)

**Files:**
- Create: `src/components/vertical/ClipList.tsx`

- [ ] **Step 1: Create ClipList**
```tsx
// src/components/vertical/ClipList.tsx
import { useState } from 'react'
import * as ScrollArea from '@radix-ui/react-scroll-area'
import { useClipStore } from '../../store/clipStore'
import { useQueueStore, selectVisibleGroups } from '../../store/queueStore'
import { ClipItem } from './ClipItem'
import { QueueGroup } from './QueueGroup'

export function ClipList() {
  const { displayList } = useClipStore()
  const visibleGroups = useQueueStore(selectVisibleGroups)
  const list = displayList()
  const [selectedId, setSelectedId] = useState<number | null>(null)

  // Items that belong to a queue group should not be shown again in main list
  const { groupForItem } = useQueueStore()
  const mainList = list.filter(item => {
    const group = groupForItem(item.id)
    return !group || group.itemIds.length < 2
  })

  return (
    <ScrollArea.Root className="flex-1 overflow-hidden">
      <ScrollArea.Viewport className="h-full w-full py-1">
        {/* Queue groups at top */}
        {visibleGroups.map(group => (
          <QueueGroup key={group.id} group={group} />
        ))}

        {/* Regular items */}
        {mainList.length === 0 ? (
          <div className="px-4 py-8 text-center">
            <p className="text-sm text-[var(--text-muted)]">暂无内容</p>
          </div>
        ) : (
          mainList.map(item => (
            <ClipItem
              key={item.id}
              item={item}
              isSelected={selectedId === item.id}
              onClick={() => setSelectedId(item.id === selectedId ? null : item.id)}
            />
          ))
        )}
      </ScrollArea.Viewport>
      <ScrollArea.Scrollbar
        orientation="vertical"
        className="flex w-1 touch-none select-none bg-transparent p-px"
      >
        <ScrollArea.Thumb className="relative flex-1 rounded-full bg-[var(--scrollbar-thumb)] hover:bg-[var(--scrollbar-thumb-hover)]" />
      </ScrollArea.Scrollbar>
    </ScrollArea.Root>
  )
}
```

- [ ] **Step 2: Commit**
```bash
git add src/components/vertical/ClipList.tsx
git commit -m "feat: add ClipList component for vertical layout"
```

---

## Chunk 3: Horizontal layout (macOS) + ClipboardWindow

### Task 11: ClipCard (horizontal)

**Files:**
- Create: `src/components/horizontal/ClipCard.tsx`

- [ ] **Step 0: Create horizontal directory**
```bash
mkdir -p /c/Users/kylin/pastee/src/components/horizontal
```

- [ ] **Step 1: Create ClipCard**
```tsx
// src/components/horizontal/ClipCard.tsx
import { ClipItem, useClipStore } from '../../store/clipStore'

const TYPE_BORDER_COLORS: Record<string, string> = {
  Text: 'border-[rgba(148,163,184,0.2)]',
  Html: 'border-[rgba(99,102,241,0.25)]',
  Image: 'border-[rgba(245,158,11,0.2)]',
  Color: 'border-[rgba(82,82,82,0.4)]',
  Files: 'border-[rgba(100,116,139,0.2)]',
}

const TYPE_LABEL_COLORS: Record<string, string> = {
  Text: 'text-[#94a3b8]',
  Html: 'text-[#818cf8]',
  Image: 'text-[#f59e0b]',
  Color: 'text-[#94a3b8]',
  Files: 'text-[#64748b]',
}

const TYPE_LABELS: Record<string, string> = {
  Text: '文本', Html: 'Html', Image: '图片', Color: '颜色', Files: '文件',
}

interface Props {
  item: ClipItem
  isSelected?: boolean
  onClick?: () => void
}

export function ClipCard({ item, isSelected, onClick }: Props) {
  const { handlePin, handleDelete, thumbnailCache } = useClipStore()
  const borderColor = TYPE_BORDER_COLORS[item.content_type] ?? 'border-[var(--border)]'
  const labelColor = TYPE_LABEL_COLORS[item.content_type] ?? 'text-[var(--text-muted)]'
  const timeStr = new Date(item.created_at / 1000).toLocaleTimeString('zh-CN', {
    hour: '2-digit', minute: '2-digit'
  })

  return (
    <div
      onClick={onClick}
      className={[
        'group flex-shrink-0 w-36 flex flex-col rounded-xl border bg-[var(--bg-secondary)] p-2.5 cursor-pointer transition-all',
        borderColor,
        isSelected ? 'border-[var(--accent)] ring-1 ring-[var(--accent)] ring-opacity-40' : 'hover:border-opacity-60',
      ].join(' ')}
    >
      <span className={`text-[9px] font-semibold mb-1.5 ${labelColor}`}>
        {TYPE_LABELS[item.content_type] ?? item.content_type}
      </span>

      <div className="flex-1 min-h-0">
        {item.loading ? (
          <p className="text-[10px] text-[var(--text-muted)] animate-pulse">处理中...</p>
        ) : item.content_type === 'Color' ? (
          <div className="flex items-center gap-1.5">
            <div
              className="w-6 h-6 rounded-full border border-[var(--type-color-border)]"
              style={{ backgroundColor: item.preview }}
            />
            <span className="text-[10px] text-[var(--text-secondary)] truncate">{item.preview}</span>
          </div>
        ) : item.content_type === 'Image' ? (
          thumbnailCache.get(item.id) ? (
            <img src={thumbnailCache.get(item.id)} alt="clip" className="w-full h-16 object-cover rounded" />
          ) : (
            <div className="w-full h-16 bg-[var(--bg-elevated)] rounded flex items-center justify-center">
              <span className="text-xs text-[var(--text-muted)]">🖼</span>
            </div>
          )
        ) : (
          <p className="text-[10px] text-[var(--text-primary)] line-clamp-4 leading-relaxed">{item.preview}</p>
        )}
      </div>

      <div className="flex items-center justify-between mt-1.5 pt-1.5 border-t border-[var(--border-subtle)]">
        <span className="text-[8px] text-[var(--text-muted)]">{timeStr}</span>
        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={e => { e.stopPropagation(); handlePin(item.id) }}
            className="text-[8px] text-[var(--text-muted)] hover:text-[var(--text-primary)]"
          >{item.is_pinned ? '取消' : '固定'}</button>
          <button
            onClick={e => { e.stopPropagation(); handleDelete(item.id) }}
            className="text-[8px] text-red-400 hover:text-red-300"
          >✕</button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**
```bash
git add src/components/horizontal/ClipCard.tsx
git commit -m "feat: add ClipCard component for horizontal layout"
```

---

### Task 12: QueueGroupCard (horizontal)

**Files:**
- Create: `src/components/horizontal/QueueGroupCard.tsx`

- [ ] **Step 1: Create QueueGroupCard**
```tsx
// src/components/horizontal/QueueGroupCard.tsx
import { QueueGroup, useQueueStore } from '../../store/queueStore'
import { useClipStore } from '../../store/clipStore'

interface Props { group: QueueGroup }

export function QueueGroupCard({ group }: Props) {
  const { allClips } = useClipStore()
  const { dissolveGroup } = useQueueStore()
  const items = group.itemIds
    .map(id => allClips.find(c => c.id === id))
    .filter(Boolean) as NonNullable<typeof allClips[number]>[]

  if (items.length < 2) return null

  return (
    <div className="flex-shrink-0 w-48 flex flex-col rounded-xl border border-[var(--queue-border)] bg-[var(--queue-bg)] p-2.5">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[9px] font-semibold text-[var(--queue)]">⚡ 队列 · {items.length} 项</span>
        <button
          onClick={() => dissolveGroup(group.id)}
          className="text-[9px] text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
        >✕</button>
      </div>

      <div className="flex flex-col gap-1 flex-1">
        {items.map((item, index) => (
          <div key={item.id} className="flex items-center gap-1.5 bg-black/20 rounded px-2 py-1">
            <span className="text-[9px] font-bold text-[var(--queue)] flex-shrink-0">
              {['①','②','③','④','⑤','⑥','⑦','⑧','⑨'][index] ?? `${index+1}.`}
            </span>
            <p className="text-[9px] text-[var(--text-primary)] truncate">{item.preview}</p>
          </div>
        ))}
      </div>

      <div className="mt-2 pt-1.5 border-t border-[var(--queue-border)]">
        <span className="text-[8px] text-[var(--queue)] opacity-70">↵ 顺序粘贴</span>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**
```bash
git add src/components/horizontal/QueueGroupCard.tsx
git commit -m "feat: add QueueGroupCard component for horizontal layout"
```

---

### Task 13: ClipBoard (horizontal layout)

**Files:**
- Create: `src/components/horizontal/ClipBoard.tsx`

- [ ] **Step 1: Create ClipBoard**
```tsx
// src/components/horizontal/ClipBoard.tsx
import { useState } from 'react'
import * as ScrollArea from '@radix-ui/react-scroll-area'
import { useClipStore } from '../../store/clipStore'
import { useQueueStore, selectVisibleGroups } from '../../store/queueStore'
import { ClipCard } from './ClipCard'
import { QueueGroupCard } from './QueueGroupCard'

export function ClipBoard() {
  const { displayList } = useClipStore()
  const visibleGroups = useQueueStore(selectVisibleGroups)
  const { groupForItem } = useQueueStore()
  const list = displayList()
  const [selectedId, setSelectedId] = useState<number | null>(null)

  const mainList = list.filter(item => {
    // Items belonging to a queue group (≥2 members) are shown inside the
    // QueueGroupCard, not in the main card row. Single-item "groups" still
    // within the 3s window are shown normally — they haven't formed a queue yet.
    const group = groupForItem(item.id)
    return !group || group.itemIds.length < 2
  })

  return (
    <ScrollArea.Root className="flex-1 overflow-hidden">
      <ScrollArea.Viewport className="h-full w-full">
        <div className="flex items-stretch gap-2 px-3 py-3 h-full">
          {visibleGroups.map(group => (
            <QueueGroupCard key={group.id} group={group} />
          ))}
          {mainList.map(item => (
            <ClipCard
              key={item.id}
              item={item}
              isSelected={selectedId === item.id}
              onClick={() => setSelectedId(item.id === selectedId ? null : item.id)}
            />
          ))}
          {mainList.length === 0 && visibleGroups.length === 0 && (
            <div className="flex items-center justify-center w-full">
              <p className="text-sm text-[var(--text-muted)]">暂无内容</p>
            </div>
          )}
        </div>
      </ScrollArea.Viewport>
      <ScrollArea.Scrollbar
        orientation="horizontal"
        className="flex h-1 touch-none select-none flex-col bg-transparent p-px"
      >
        <ScrollArea.Thumb className="relative flex-1 rounded-full bg-[var(--scrollbar-thumb)]" />
      </ScrollArea.Scrollbar>
    </ScrollArea.Root>
  )
}
```

- [ ] **Step 2: Commit**
```bash
git add src/components/horizontal/ClipBoard.tsx
git commit -m "feat: add ClipBoard component for horizontal layout"
```

---

### Task 14: ClipboardWindow shell

**Files:**
- Create: `src/components/ClipboardWindow.tsx`

- [ ] **Step 1: Create ClipboardWindow**

Note on window close: `ClipboardWindow` wraps content in `AnimatePresence` for future use (e.g., in-window layout transitions). The actual window is hidden/shown by Tauri's OS-level `toggle_window` call, not by unmounting the React tree. The `visible` state is always `true` — exit animation is reserved for future routing.

```tsx
// src/components/ClipboardWindow.tsx
import { useEffect, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { AnimatePresence, motion } from 'motion/react'
import { Command } from 'cmdk'
import { useClipStore } from '../store/clipStore'
import { useQueueStore } from '../store/queueStore'
import { useSettingsStore } from '../store/settingsStore'
import { detectLayout, Layout } from '../lib/platform'
import { TypeFilterBar } from './TypeFilterBar'
import { ClipList } from './vertical/ClipList'
import { ClipBoard } from './horizontal/ClipBoard'

interface Props { onOpenSettings: () => void }

export function ClipboardWindow({ onOpenSettings }: Props) {
  const { fetchAllClips, fetchTotalCount, initListener, setSearchQuery, searchQuery, totalCount } = useClipStore()
  const { onItemAdded } = useQueueStore()
  const { layoutOverride, loaded: settingsLoaded } = useSettingsStore()
  const [layout, setLayout] = useState<Layout>('vertical')

  // Resolve layout: user override takes precedence over OS detection
  useEffect(() => {
    if (!settingsLoaded) return
    if (layoutOverride !== 'auto') {
      setLayout(layoutOverride as Layout)
    } else {
      detectLayout().then(setLayout)
    }
  }, [layoutOverride, settingsLoaded])

  // Init data + listeners
  useEffect(() => {
    fetchAllClips()
    fetchTotalCount()
    const cleanup = initListener((id, timestamp) => {
      onItemAdded(id, timestamp)
    })
    return () => { cleanup.then(fn => fn()) }
  }, [])

  // Escape closes window via Tauri
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') invoke('toggle_window').catch(() => {})
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  const isHorizontal = layout === 'horizontal'

  return (
    <AnimatePresence>
      <motion.div
        className={[
          'flex flex-col bg-[var(--bg-primary)] overflow-hidden',
          isHorizontal ? 'w-screen h-[220px]' : 'w-full h-screen',
        ].join(' ')}
        initial={isHorizontal ? { y: '100%', opacity: 0 } : { opacity: 0, scale: 0.97 }}
        animate={isHorizontal ? { y: 0, opacity: 1 } : { opacity: 1, scale: 1 }}
        transition={isHorizontal
          ? { type: 'spring', damping: 30, stiffness: 300 }
          : { duration: 0.12 }
        }
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
                  onClick={onOpenSettings}
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
    </AnimatePresence>
  )
}
```

- [ ] **Step 2: Commit**
```bash
git add src/components/ClipboardWindow.tsx
git commit -m "feat: add ClipboardWindow shell with dual-layout support and motion animations"
```

---

## Chunk 4: Settings window + App wiring + DebugPage cleanup

### Task 15: Settings panels

**Files:**
- Create: `src/components/settings/SettingsWindow.tsx`
- Create: `src/components/settings/SettingsSidebar.tsx`
- Create: `src/components/settings/panels/GeneralPanel.tsx`
- Create: `src/components/settings/panels/AppearancePanel.tsx`
- Create: `src/components/settings/panels/ShortcutsPanel.tsx`
- Create: `src/components/settings/panels/StoragePanel.tsx`
- Create: `src/components/settings/panels/OcrPanel.tsx`
- Create: `src/components/settings/panels/AboutPanel.tsx`

- [ ] **Step 1: Create SettingsSidebar**
```tsx
// src/components/settings/SettingsSidebar.tsx
export type SettingsSection = 'general' | 'appearance' | 'shortcuts' | 'storage' | 'ocr' | 'about'

const NAV_ITEMS: { id: SettingsSection; label: string }[] = [
  { id: 'general',    label: '通用' },
  { id: 'appearance', label: '外观' },
  { id: 'shortcuts',  label: '快捷键' },
  { id: 'storage',    label: '存储' },
  { id: 'ocr',        label: 'OCR' },
  { id: 'about',      label: '关于' },
]

interface Props {
  active: SettingsSection
  onChange: (s: SettingsSection) => void
}

export function SettingsSidebar({ active, onChange }: Props) {
  return (
    <nav className="w-28 bg-[var(--bg-secondary)] border-r border-[var(--border)] flex flex-col gap-0.5 p-2 flex-shrink-0">
      {NAV_ITEMS.map(({ id, label }) => (
        <button
          key={id}
          onClick={() => onChange(id)}
          className={[
            'text-left px-3 py-2 rounded-md text-xs transition-colors',
            active === id
              ? 'bg-[var(--bg-elevated)] text-[var(--text-primary)]'
              : 'text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)]',
          ].join(' ')}
        >
          {label}
        </button>
      ))}
    </nav>
  )
}
```

- [ ] **Step 2: Create GeneralPanel**
```tsx
// src/components/settings/panels/GeneralPanel.tsx
import { useSettingsStore } from '../../../store/settingsStore'

// Note: "Launch at login" requires @tauri-apps/plugin-autostart (not in scope for this
// iteration). The setting row is omitted here and can be added when that plugin is integrated.

export function GeneralPanel() {
  const { layoutOverride, historyRetentionDays, maxItemCount, update } = useSettingsStore()

  return (
    <div className="flex flex-col gap-3 p-4">
      <h2 className="text-xs uppercase tracking-wider text-[var(--text-muted)] mb-1">通用</h2>

      <SettingRow label="布局偏好" description="覆盖自动平台检测">
        <select
          value={layoutOverride}
          onChange={e => update('layoutOverride', e.target.value as any)}
          className="bg-[var(--bg-elevated)] border border-[var(--border)] rounded px-2 py-1 text-xs text-[var(--text-primary)] outline-none"
        >
          <option value="auto">自动</option>
          <option value="vertical">竖向 (Windows)</option>
          <option value="horizontal">横向 (macOS)</option>
        </select>
      </SettingRow>

      <SettingRow label="历史保留天数" description="超出后自动清理旧记录">
        <input
          type="number"
          min={1} max={365}
          value={historyRetentionDays}
          onChange={e => update('historyRetentionDays', Number(e.target.value))}
          className="w-16 bg-[var(--bg-elevated)] border border-[var(--border)] rounded px-2 py-1 text-xs text-[var(--text-primary)] outline-none"
        />
      </SettingRow>

      <SettingRow label="最大条数" description="超出后删除最旧未固定记录">
        <input
          type="number"
          min={50} max={5000}
          value={maxItemCount}
          onChange={e => update('maxItemCount', Number(e.target.value))}
          className="w-20 bg-[var(--bg-elevated)] border border-[var(--border)] rounded px-2 py-1 text-xs text-[var(--text-primary)] outline-none"
        />
      </SettingRow>
    </div>
  )
}

function SettingRow({ label, description, children }: { label: string; description?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2 border-b border-[var(--border-subtle)] last:border-0">
      <div>
        <p className="text-xs text-[var(--text-primary)]">{label}</p>
        {description && <p className="text-[10px] text-[var(--text-muted)] mt-0.5">{description}</p>}
      </div>
      {children}
    </div>
  )
}
```

- [ ] **Step 3: Create remaining panels (AppearancePanel, ShortcutsPanel, StoragePanel, OcrPanel, AboutPanel)**
```tsx
// src/components/settings/panels/AppearancePanel.tsx
import { useSettingsStore } from '../../../store/settingsStore'
export function AppearancePanel() {
  const { theme, update } = useSettingsStore()
  return (
    <div className="flex flex-col gap-3 p-4">
      <h2 className="text-xs uppercase tracking-wider text-[var(--text-muted)] mb-1">外观</h2>
      <div className="flex items-center justify-between py-2">
        <p className="text-xs text-[var(--text-primary)]">主题</p>
        <select
          value={theme}
          onChange={e => update('theme', e.target.value as any)}
          className="bg-[var(--bg-elevated)] border border-[var(--border)] rounded px-2 py-1 text-xs text-[var(--text-primary)] outline-none"
        >
          <option value="dark">深色</option>
          <option value="light">浅色</option>
          <option value="system">跟随系统</option>
        </select>
      </div>
    </div>
  )
}
```

```tsx
// src/components/settings/panels/ShortcutsPanel.tsx
// NOTE: Hotkey editing (KeyRecorder component) is deferred — requires the hotkey conflict
// detection flow (register_hotkey + polling) which needs additional Rust commands not
// implemented in this iteration. The panel displays the current hotkey as read-only.
import { useSettingsStore } from '../../../store/settingsStore'
export function ShortcutsPanel() {
  const { activationHotkey, keepWindowOpen, update } = useSettingsStore()
  return (
    <div className="flex flex-col gap-3 p-4">
      <h2 className="text-xs uppercase tracking-wider text-[var(--text-muted)] mb-1">快捷键</h2>
      <div className="flex items-center justify-between py-2 border-b border-[var(--border-subtle)]">
        <div>
          <p className="text-xs text-[var(--text-primary)]">唤起窗口</p>
          <p className="text-[10px] text-[var(--text-muted)] mt-0.5">全局快捷键</p>
        </div>
        <div className="flex gap-1">
          {activationHotkey.split('+').map(k => (
            <kbd key={k} className="px-1.5 py-0.5 bg-[var(--bg-elevated)] border border-[var(--border)] rounded text-[10px] text-[var(--text-secondary)]">{k}</kbd>
          ))}
        </div>
      </div>
      <div className="flex items-center justify-between py-2">
        <p className="text-xs text-[var(--text-primary)]">保持窗口开启</p>
        <button
          onClick={() => update('keepWindowOpen', !keepWindowOpen)}
          className={[
            'w-8 h-4 rounded-full transition-colors relative',
            keepWindowOpen ? 'bg-[var(--accent)]' : 'bg-[var(--bg-elevated)]',
          ].join(' ')}
        >
          <span className={[
            'absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform',
            keepWindowOpen ? 'translate-x-4' : 'translate-x-0.5',
          ].join(' ')} />
        </button>
      </div>
    </div>
  )
}
```

```tsx
// src/components/settings/panels/StoragePanel.tsx
import { invoke } from '@tauri-apps/api/core'
import { useClipStore } from '../../../store/clipStore'
export function StoragePanel() {
  const { fetchAllClips, fetchTotalCount, totalCount } = useClipStore()
  const handleClear = async () => {
    await invoke<number>('clear_unpinned_clips')
    await fetchAllClips()
    await fetchTotalCount()
  }
  return (
    <div className="flex flex-col gap-3 p-4">
      <h2 className="text-xs uppercase tracking-wider text-[var(--text-muted)] mb-1">存储</h2>
      <div className="flex items-center justify-between py-2">
        <div>
          <p className="text-xs text-[var(--text-primary)]">清理未固定记录</p>
          <p className="text-[10px] text-[var(--text-muted)] mt-0.5">当前共 {totalCount} 条</p>
        </div>
        <button
          onClick={handleClear}
          className="px-3 py-1 text-xs text-red-400 border border-red-400/30 rounded hover:bg-red-400/10 transition-colors"
        >
          立即清理
        </button>
      </div>
    </div>
  )
}
```

```tsx
// src/components/settings/panels/OcrPanel.tsx
import { useSettingsStore } from '../../../store/settingsStore'
export function OcrPanel() {
  const { ocrEnabled, ocrModelUrl, ocrApiKey, update } = useSettingsStore()
  return (
    <div className="flex flex-col gap-3 p-4">
      <h2 className="text-xs uppercase tracking-wider text-[var(--text-muted)] mb-1">OCR</h2>
      <p className="text-[10px] text-[var(--text-muted)] mb-2">OCR 后端支持尚未实现，设置将在下个版本生效。</p>
      {/* Fields scaffolded but non-functional until backend is ready */}
      <div className="flex flex-col gap-2 opacity-50 pointer-events-none">
        <div className="flex items-center justify-between py-2 border-b border-[var(--border-subtle)]">
          <p className="text-xs text-[var(--text-primary)]">启用 OCR</p>
          <span className="text-[10px] text-[var(--text-muted)]">即将推出</span>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[10px] text-[var(--text-muted)]">模型接口 URL</label>
          <input
            value={ocrModelUrl}
            onChange={e => update('ocrModelUrl', e.target.value)}
            placeholder="https://api.example.com/ocr"
            className="bg-[var(--bg-elevated)] border border-[var(--border)] rounded px-2 py-1 text-xs text-[var(--text-primary)] outline-none"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[10px] text-[var(--text-muted)]">API Key</label>
          <input
            type="password"
            value={ocrApiKey}
            onChange={e => update('ocrApiKey', e.target.value)}
            placeholder="sk-..."
            className="bg-[var(--bg-elevated)] border border-[var(--border)] rounded px-2 py-1 text-xs text-[var(--text-primary)] outline-none"
          />
        </div>
      </div>
    </div>
  )
}
```

```tsx
// src/components/settings/panels/AboutPanel.tsx
// Version is read from Tauri's app metadata to avoid hardcoding.
import { getVersion } from '@tauri-apps/api/app'
import { useEffect, useState } from 'react'
export function AboutPanel() {
  const [version, setVersion] = useState('...')
  useEffect(() => { getVersion().then(setVersion) }, [])
  return (
    <div className="flex flex-col gap-3 p-4">
      <h2 className="text-xs uppercase tracking-wider text-[var(--text-muted)] mb-1">关于</h2>
      <div className="py-2">
        <p className="text-xs text-[var(--text-primary)]">Pastee</p>
        <p className="text-[10px] text-[var(--text-muted)] mt-1">版本 {version}</p>
        <p className="text-[10px] text-[var(--text-muted)] mt-0.5">本地优先的剪贴板管理器</p>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Create SettingsWindow**
```tsx
// src/components/settings/SettingsWindow.tsx
import { useState } from 'react'
import { SettingsSidebar, SettingsSection } from './SettingsSidebar'
import { GeneralPanel } from './panels/GeneralPanel'
import { AppearancePanel } from './panels/AppearancePanel'
import { ShortcutsPanel } from './panels/ShortcutsPanel'
import { StoragePanel } from './panels/StoragePanel'
import { OcrPanel } from './panels/OcrPanel'
import { AboutPanel } from './panels/AboutPanel'

const PANELS: Record<SettingsSection, React.ComponentType> = {
  general: GeneralPanel,
  appearance: AppearancePanel,
  shortcuts: ShortcutsPanel,
  storage: StoragePanel,
  ocr: OcrPanel,
  about: AboutPanel,
}

interface Props {
  onClose: () => void
}

export function SettingsWindow({ onClose }: Props) {
  const [section, setSection] = useState<SettingsSection>('general')
  const Panel = PANELS[section]

  return (
    <div className="flex flex-col w-full h-screen bg-[var(--bg-primary)]">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)]">
        <span className="text-sm font-medium text-[var(--text-primary)]">设置</span>
        <button
          onClick={onClose}
          className="text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
        >
          ✕
        </button>
      </div>

      {/* Body */}
      <div className="flex flex-1 min-h-0">
        <SettingsSidebar active={section} onChange={setSection} />
        <div className="flex-1 overflow-y-auto">
          <Panel />
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 5: Commit**
```bash
git add src/components/settings/
git commit -m "feat: add SettingsWindow with all panels (General, Appearance, Shortcuts, Storage, OCR, About)"
```

---

### Task 16: Wire up App.tsx

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: Clear App.css**

`App.css` currently contains Base UI / tw-animate-css theme tokens that will conflict with the new token system. Replace its entire content:
```css
/* App.css — cleared; all tokens are in index.css */
```

- [ ] **Step 2: Update App.tsx**
```tsx
// src/App.tsx
import { useEffect, useState } from 'react'
import { useSettingsStore } from './store/settingsStore'
import { ClipboardWindow } from './components/ClipboardWindow'
import { SettingsWindow } from './components/settings/SettingsWindow'
import './App.css'

export default function App() {
  const { load } = useSettingsStore()
  const [showSettings, setShowSettings] = useState(false)

  useEffect(() => { load() }, [])

  if (showSettings) {
    return <SettingsWindow onClose={() => setShowSettings(false)} />
  }

  return <ClipboardWindow onOpenSettings={() => setShowSettings(true)} />
}
```

Note on settings routing: settings open by replacing the `ClipboardWindow` render in the same Tauri window. The spec prefers a separate Tauri window but the same-window approach is simpler for this iteration and avoids multi-window Tauri configuration. This can be upgraded to a separate window later.

- [ ] **Step 3: Verify dev build**
```bash
bun run dev
```
Expected: new ClipboardWindow renders. Settings button in footer opens SettingsWindow. No console errors.

- [ ] **Step 4: Add theme activation**

In `App.tsx`, add a `useEffect` that applies the theme class to `<html>`:
```tsx
import { useSettingsStore } from './store/settingsStore'

// Inside App():
const { theme } = useSettingsStore()
useEffect(() => {
  const root = document.documentElement
  root.classList.remove('theme-light', 'theme-dark')
  if (theme === 'light') root.classList.add('theme-light')
  else if (theme === 'dark') root.classList.add('theme-dark')
  // 'system' — rely on @media prefers-color-scheme (no class needed)
}, [theme])
```

Then in `index.css`, add light theme overrides under `.theme-light`:
```css
.theme-light {
  --bg-primary: #f5f5f7;
  --bg-secondary: #ffffff;
  --bg-elevated: #e8e8ea;
  --bg-hover: #ececee;
  --border: #d1d1d6;
  --border-subtle: #e5e5e7;
  --text-primary: #1d1d1f;
  --text-secondary: #6e6e73;
  --text-muted: #aeaeb2;
}
```
The dark tokens in `:root` serve as the default (and `.theme-dark` is identical to `:root`, so no override needed).

- [ ] **Step 5: Commit**
```bash
git add src/App.tsx src/App.css src/index.css
git commit -m "feat: wire up App with ClipboardWindow, SettingsWindow, theme activation; clear App.css"
```

---

### Task 17: Clean up old UI files + improve DebugPage

**Files:**
- Delete: `src/components/ui/` (all files)
- Delete: `src/components/example.tsx`
- Delete: `src/components/component-example.tsx`
- Modify: `src/components/DebugPage.tsx`

- [ ] **Step 1: Delete old UI files**
```bash
rm -rf /c/Users/kylin/pastee/src/components/ui
rm /c/Users/kylin/pastee/src/components/example.tsx
rm /c/Users/kylin/pastee/src/components/component-example.tsx
```

- [ ] **Step 2: Rewrite DebugPage with Tailwind**

Replace `src/components/DebugPage.tsx` with a clean Tailwind version that uses the new stores. Key improvements:
- Remove all inline styles → Tailwind classes
- Remove `confirm()` calls → use `window.confirm` only as last resort or just act
- Use `useClipStore` + `useQueueStore`
- Keep all debug features visible: type filter, pagination, pin, delete, clear unpinned, keep-window toggle, sync indicator

```tsx
// src/components/DebugPage.tsx
// Used for development testing — not shown in production UI
import { useEffect, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { useClipStore } from '../store/clipStore'
import { useQueueStore, selectVisibleGroups } from '../store/queueStore'

const TYPES = ['Text', 'Html', 'Color', 'Image', 'Files'] as const

export default function DebugPage() {
  const {
    searchQuery, filterType, offset, limit, totalCount,
    displayList, setSearchQuery, setFilterType, setOffset,
    fetchAllClips, fetchTotalCount, handleDelete, handlePin,
    initListener, thumbnailCache,
  } = useClipStore()
  const { onItemAdded } = useQueueStore()
  const visibleGroups = useQueueStore(selectVisibleGroups)
  const [keepWindowOpen, setKeepWindowOpen] = useState(false)
  const list = displayList()
  const hasLoadingImages = list.some(item => item.loading)

  useEffect(() => {
    fetchAllClips()
    fetchTotalCount()
  }, [])

  useEffect(() => {
    const cleanup = initListener((id, ts) => onItemAdded(id, ts))
    return () => { cleanup.then(fn => fn()) }
  }, [])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') invoke('toggle_window').catch(() => {})
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  const handleToggleKeepOpen = async (val: boolean) => {
    setKeepWindowOpen(val)
    await invoke('set_keep_window_open', { keep: val })
  }

  const handleClearUnpinned = async () => {
    const deleted = await invoke<number>('clear_unpinned_clips')
    await fetchAllClips()
    await fetchTotalCount()
    console.info(`Cleared ${deleted} unpinned clips`)
  }

  return (
    <div className="flex flex-col h-screen bg-[#1a1a1a] text-[#e2e8f0] text-sm font-mono">
      {/* Search + controls */}
      <div className="flex items-center gap-2 p-2 border-b border-[#2a2a2a]">
        <input
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          placeholder="搜索..."
          className="flex-1 bg-[#111] border border-[#333] rounded px-2 py-1 text-xs text-[#e2e8f0] outline-none placeholder:text-[#475569]"
        />
        <button onClick={handleClearUnpinned} className="px-2 py-1 text-xs bg-red-900/40 text-red-400 border border-red-400/30 rounded">清空</button>
        <label className="flex items-center gap-1 text-xs text-[#94a3b8] cursor-pointer">
          <input type="checkbox" checked={keepWindowOpen} onChange={e => handleToggleKeepOpen(e.target.checked)} />
          锁定
        </label>
      </div>

      {/* Type filter */}
      <div className="flex gap-1 px-2 py-1.5 border-b border-[#2a2a2a] overflow-x-auto">
        {['', ...TYPES].map(t => (
          <button key={t} onClick={() => setFilterType(t as any)}
            className={`px-2 py-0.5 text-xs rounded ${filterType === t ? 'bg-[#6366f1] text-white' : 'text-[#94a3b8] hover:bg-[#222]'}`}>
            {t || '全部'}
          </button>
        ))}
      </div>

      {/* Queue groups debug */}
      {visibleGroups.length > 0 && (
        <div className="px-2 py-1 border-b border-[#2a2a2a] bg-amber-900/20">
          <p className="text-[10px] text-amber-400">队列组: {visibleGroups.length} 个</p>
          {visibleGroups.map(g => (
            <p key={g.id} className="text-[9px] text-amber-300/70">  {g.id}: [{g.itemIds.join(', ')}]</p>
          ))}
        </div>
      )}

      {/* List */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {list.length === 0 ? (
          <p className="text-[#475569] text-xs py-4 text-center">暂无数据</p>
        ) : list.map(item => (
          <div key={item.id} className={`border rounded p-2 text-xs ${item.is_pinned ? 'border-amber-400/40 bg-amber-900/10' : 'border-[#2a2a2a] bg-[#111]'}`}>
            <div className="flex justify-between items-start mb-1">
              <div className="flex items-center gap-2">
                <span className="text-[#475569]">#{item.id}</span>
                <span className="text-[#6366f1]">{item.content_type}</span>
                {item.is_pinned && <span className="text-amber-400 text-[10px]">📌</span>}
                {item.loading && <span className="text-[#475569] animate-pulse">⏳</span>}
              </div>
              <span className="text-[#475569] text-[10px]">{new Date(item.created_at / 1000).toLocaleString()}</span>
            </div>
            {item.content_type === 'Image' && thumbnailCache.get(item.id) ? (
              <img src={thumbnailCache.get(item.id)} alt="" className="h-12 w-20 object-cover rounded mb-1" />
            ) : item.content_type === 'Color' ? (
              <div className="flex items-center gap-2 mb-1">
                <div className="w-5 h-5 rounded-full border border-[#333]" style={{ backgroundColor: item.preview }} />
                <span className="text-[#94a3b8]">{item.preview}</span>
              </div>
            ) : (
              <p className="text-[#94a3b8] truncate mb-1">{item.preview}</p>
            )}
            <div className="flex gap-1">
              <button onClick={() => handlePin(item.id)} className="px-1.5 py-0.5 text-[10px] border border-[#333] rounded text-[#94a3b8] hover:text-white">
                {item.is_pinned ? '取消' : '固定'}
              </button>
              <button onClick={() => handleDelete(item.id)} className="px-1.5 py-0.5 text-[10px] bg-red-900/30 text-red-400 rounded">删除</button>
            </div>
          </div>
        ))}
      </div>

      {/* Status bar */}
      <div className="flex justify-between items-center px-2 py-1 border-t border-[#2a2a2a] bg-[#111] text-[10px] text-[#475569]">
        <span>Esc关闭 | Ctrl+Shift+V打开</span>
        <div className="flex items-center gap-2">
          {!searchQuery && (
            <div className="flex gap-1">
              <button onClick={() => setOffset(Math.max(0, offset - limit))} disabled={offset === 0} className="px-1 disabled:opacity-30">◀</button>
              <span>{offset}/{totalCount}</span>
              <button onClick={() => setOffset(offset + limit)} className="px-1">▶</button>
            </div>
          )}
          <div className="flex items-center gap-1">
            <div className={`w-2 h-2 rounded-full ${hasLoadingImages ? 'bg-amber-400' : 'bg-green-400'}`} />
            <span>{totalCount} 条</span>
          </div>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Verify build compiles**
```bash
bun run build 2>&1 | head -30
```
Expected: no errors.

- [ ] **Step 4: Stage deletions and changed files explicitly**
```bash
git rm -r src/components/ui/
git rm src/components/example.tsx src/components/component-example.tsx
git add src/components/DebugPage.tsx
git commit -m "chore: remove old Base UI components; rewrite DebugPage with Tailwind + new stores"
```

Note on `tauri.ts`: The spec lists `paste_clip` and `get_cursor_position` as future IPC bindings in `src/lib/tauri.ts`. These are **not added in this iteration** — they require Rust backend additions. When the backend commands are implemented, add the corresponding frontend bindings to `tauri.ts` at that time.

---

### Task 18: Verify full Tauri dev build

- [ ] **Step 1: Check Tauri dev runs**
```bash
bun run tauri dev
```
Expected: app launches, ClipboardWindow renders on correct platform layout, clipboard events work, search works, queue groups appear when multiple items copied rapidly.

- [ ] **Step 2: Check DebugPage (optional)**

To switch App.tsx to render DebugPage for testing:
```tsx
// src/App.tsx — temporary, for testing only
import DebugPage from './components/DebugPage'
export default function App() { return <DebugPage /> }
```

- [ ] **Step 3: Final commit**
```bash
git add src/ package.json bun.lock
git commit -m "feat: Pastee frontend rewrite complete — dual layout, queue, settings"
```

---

## Summary

| Chunk | Tasks | What gets built |
|-------|-------|----------------|
| 1 | 1–6 | Deps, tokens, platform detection, settingsStore, queueStore, clipStore refactor |
| 2 | 7–10 | TypeFilterBar, ClipItem, QueueGroup, ClipList (vertical) |
| 3 | 11–14 | ClipCard, QueueGroupCard, ClipBoard, ClipboardWindow (horizontal + shell) |
| 4 | 15–18 | Settings window + all panels, App wiring, DebugPage rewrite, cleanup |
