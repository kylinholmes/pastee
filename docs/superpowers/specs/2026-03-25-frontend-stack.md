# Pastee Frontend Tech Stack

**Date:** 2026-03-25
**Status:** Approved

---

## Core

| 库 | 版本 | 用途 |
|---|---|---|
| React | 19 | UI 框架 |
| TypeScript | 5.8+ | 类型安全 |
| Vite | 7 | 构建工具 |
| Tailwind CSS | 4 | 样式 |
| Zustand | 5 | 状态管理 |
| Lucide React | latest | 图标 |

## UI 组件策略

**不用 Shadcn/ui 或 Base UI 作为组件库。**

这个 app 的 UI 特殊性（极窄弹窗、纯深色、高密度信息）决定了任何预设样式的组件库都需要全面覆写，反而是包袱。

策略：
- **样式** — 纯 Tailwind CSS 手写
- **无障碍/交互逻辑** — 按需引入 Radix UI 原语（只用行为，不用样式）

## Radix UI 原语（按需）

| 包 | 用途 |
|---|---|
| `@radix-ui/react-dialog` | 设置窗口 overlay、无障碍焦点管理 |
| `@radix-ui/react-tooltip` | hover 预览长文本内容 |
| `@radix-ui/react-scroll-area` | 竖向列表 + 横向卡片滚动（替代原生丑陋滚动条） |

## 动效

| 包 | 用途 |
|---|---|
| `motion` | 窗口滑入动画（macOS 底部滑入）、卡片过渡、队列项消费动画、fade in/out |

## 交互

| 包 | 用途 |
|---|---|
| `cmdk` | 搜索框 + 键盘导航（专为 command palette 设计，↵/方向键/过滤全包） |
| `react-hotkeys-hook` | 前端快捷键绑定（↵ 粘贴、⌫ 删除、方向键导航、Esc 关闭） |

## Tauri 插件

| 包 | 用途 |
|---|---|
| `@tauri-apps/plugin-store` | settingsStore 持久化，写入 app data 目录 JSON 文件 |

---

## 完整依赖清单

```bash
# 新增（bun add）
bun add motion
bun add cmdk
bun add @radix-ui/react-dialog @radix-ui/react-tooltip @radix-ui/react-scroll-area
bun add react-hotkeys-hook
bun add @tauri-apps/plugin-store

# 移除（已有但不再使用）
bun remove @base-ui-components/react
```

---

## 使用规范

### Tailwind 样式约定

```ts
// 颜色 token（在 tailwind.config 或 CSS 变量中定义）
--color-bg-primary: #111111
--color-bg-secondary: #1a1a1a
--color-bg-elevated: #222222
--color-border: #2a2a2a
--color-text-primary: #e2e8f0
--color-text-secondary: #94a3b8
--color-text-muted: #475569

// 内容类型颜色
--color-type-text: #94a3b8    // Text
--color-type-html: #6366f1    // Html (Code/Rich Text)
--color-type-image: #f59e0b   // Image
--color-type-color: dynamic   // swatch
--color-type-files: #64748b   // Files
--color-queue: #f59e0b        // Queue group accent
```

### motion 使用规范

```ts
// macOS 横向布局：窗口从底部滑入
initial: { y: '100%', opacity: 0 }
animate: { y: 0, opacity: 1 }
transition: { type: 'spring', damping: 30, stiffness: 300 }

// Windows 竖向布局：fade in
initial: { opacity: 0, scale: 0.97 }
animate: { opacity: 1, scale: 1 }
transition: { duration: 0.12 }

// 队列项消费：向左滑出
exit: { x: -20, opacity: 0 }
transition: { duration: 0.15 }
```

### cmdk 使用规范

`cmdk` 的 `Command` 组件直接承担 `SearchBar` + `ClipList`/`ClipBoard` 的角色：
- `Command.Input` → SearchBar
- `Command.List` → 列表容器（内置虚拟化和过滤）
- `Command.Item` → ClipItem / ClipCard
- `Command.Group` → QueueGroup / 类型分组

键盘导航由 cmdk 内置处理，无需额外代码。

### react-hotkeys-hook 使用规范

```ts
// 全局快捷键（窗口级别）
useHotkeys('enter', handlePaste)
useHotkeys('backspace', handleDelete)
useHotkeys('mod+p', handlePin)
useHotkeys('escape', handleClose)
useHotkeys('arrowup, arrowdown', handleNavigate)
```
