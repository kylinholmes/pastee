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

**不引入 `react-hotkeys-hook`。** 窗口内快捷键（Esc/⌫/⌘P）通过 cmdk 的 `onKeyDown` 回调处理，无需额外库。

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
bun add @tauri-apps/plugin-store

# 移除（已有但不再使用）
bun remove @base-ui-components/react
```

---

## 使用规范

### Tailwind 样式约定

```css
/* 颜色 token（CSS 变量，在 index.css 中定义） */
--color-bg-primary: #111111;
--color-bg-secondary: #1a1a1a;
--color-bg-elevated: #222222;
--color-border: #2a2a2a;
--color-text-primary: #e2e8f0;
--color-text-secondary: #94a3b8;
--color-text-muted: #475569;

/* 内容类型颜色 */
--color-type-text: #94a3b8;    /* Text */
--color-type-html: #6366f1;    /* Html (Code/Rich Text) */
--color-type-image: #f59e0b;   /* Image */
--color-type-files: #64748b;   /* Files */
--color-queue: #f59e0b;        /* Queue group accent */
/* Color 类型：直接用 clip 的颜色值作为 swatch */
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

键盘导航（方向键、↵）由 cmdk 内置处理。其余窗口内快捷键通过 `Command` 的 `onKeyDown` 处理：

```ts
<Command onKeyDown={(e) => {
  if (e.key === 'Escape') handleClose()
  if (e.key === 'Backspace' && !searchValue) handleDelete()
  if ((e.metaKey || e.ctrlKey) && e.key === 'p') handlePin()
}}>
```

---

## 全局快捷键设计

### 两层分离

| 层 | 负责方 | 可自定义 |
|---|---|---|
| 系统级唤起快捷键 | Rust `global-shortcut` 插件 | ✅ 用户可改 |
| 窗口内操作快捷键 | cmdk `onKeyDown` | ❌ 固定，不开放自定义 |

窗口内快捷键固定设计：改了反而反直觉，不开放。

### 全局快捷键冲突处理

**原则：不 hack 系统保留键。** Win+V（Windows 内置剪贴板）、Cmd+Space（Spotlight）等系统级注册键不尝试覆盖，设置页提示用户回避。

**冲突检测流程：**

用户在设置页录制新快捷键 → 前端捕获 `keydown` 组合 → 调用 Rust `register_hotkey(keys)` 尝试注册：

```
注册成功 → 保存到 settingsStore → 持久化
注册失败 → 回滚到旧快捷键 → 设置页显示 "该快捷键已被占用，请换一个"
```

**冲突恢复（A + C 方案）：**

- **主动通知（A）：** 快捷键被其他程序抢占时（app 启动或重新注册失败），托盘图标变为警告色 + 发送系统通知："快捷键 Ctrl+Shift+V 已失效，请在设置里更换"
- **静默轮询重试（C）：** 后台每 30 秒尝试重新注册当前快捷键。若某次成功（冲突 app 已关闭），自动恢复，托盘图标恢复正常，无需用户介入

**轮询实现：** Rust 侧 `tokio::time::interval` 定时任务，注册成功后取消轮询，通过 Tauri 事件 `hotkey://restored` 通知前端更新托盘状态。

### 快捷键录制组件（Settings → Shortcuts）

```ts
// KeyRecorder 组件行为
onKeyDown: 捕获组合键（modifier + key）
显示：Ctrl + Shift + V 样式的 kbd 标签
确认：调用 register_hotkey，等待结果
失败：inline 错误提示 + 恢复旧值
```
