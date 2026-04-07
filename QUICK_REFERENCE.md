# 快速参考卡片 - macOS 辅助功能权限处理

## 问题是什么？

macOS 上的全局快捷键需要"辅助功能"权限。没有权限时：
```
快捷键注册本身成功 ✅ 
回调注册失败 ❌ (RegisterEventHotKey failed for KeyJ)
```

## 解决方案是什么？

实现了**三层防御**：

### 1️⃣ 后端自动处理 (Rust)
```rust
// 检测到权限问题时：
1. 打印清晰的解决方案步骤
2. 等待 3 秒（让用户有时间读信息）
3. 自动打开系统设置 → 隐私与安全 → 辅助功能
```

### 2️⃣ 前端帮助信息 (React)
```tsx
在 Debug Page 显示：
- 快捷键信息框
- 「显示帮助」按钮（展开故障排除步骤）
- 「打开辅助功能设置」按钮（手动打开）
```

### 3️⃣ 命令行指导
```
✅ 解决方案:
1️⃣  打开 "系统设置" → "隐私与安全" → "辅助功能"
2️⃣  将 pastee 添加到列表中（如果还没有）
3️⃣  确保 pastee 旁边的开关是打开的 ✓
4️⃣  重新启动 pastee
```

## 核心代码

### macOS 系统 URL
```
x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility
```

### Rust 命令
```rust
#[tauri::command]
fn open_accessibility_settings() -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg("x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility")
            .spawn()?;
        Ok(())
    }
    #[cfg(not(target_os = "macos"))]
    {
        Err("macOS only".to_string())
    }
}
```

### TypeScript 调用
```typescript
import { invoke } from "@tauri-apps/api/core";

const openAccessibilitySettings = () => {
    return invoke("open_accessibility_settings");
};
```

## 文件清单

| 文件 | 改动 |
|------|------|
| `src-tauri/src/lib.rs` | 添加命令 + 智能错误处理 |
| `src/lib/tauri.ts` | 导出新命令 |
| `src/components/DebugPage.tsx` | 添加帮助 UI |
| `HOTKEY_ACCESSIBILITY.md` | 📖 详细技术文档 |
| `IMPLEMENTATION_SUMMARY.md` | 📋 完整实现总结 |

## 测试状态

✅ **所有 53 个测试通过**
- Schema Tests: 6 ✓
- Database Tests: 11 ✓
- Color Tests: 11 ✓
- Chinese Search: 10 ✓
- IPC Tests: 9 ✓
- API Tests: 6 ✓

## 用户体验

### 场景 1：首次启动（快捷键权限缺失）
```
启动 pastee
    ↓
自动检测到权限问题
    ↓
打印清晰说明（3秒）
    ↓
🎯 自动打开系统设置
    ↓
用户添加权限 + 重启
    ↓
✅ 快捷键工作！
```

### 场景 2：从 Debug 页面手动操作
```
点击「显示帮助」
    ↓
看到清晰的步骤
    ↓
点击「打开辅助功能设置」
    ↓
系统设置打开
    ↓
用户添加权限 + 重启
    ↓
✅ 快捷键工作！
```

## 关键特性清单

- ✅ 自动检测权限问题（被动检测）
- ✅ 自动打开系统设置（无需用户操作）
- ✅ 清晰的错误信息（控制台 + 前端）
- ✅ 时间延迟（给用户阅读时间）
- ✅ 跨平台支持（其他系统自动跳过）
- ✅ 手动打开按钮（备选方案）
- ✅ 前端帮助页面（完整的故障排除指南）

## 命令行输出示例

```
🔑 尝试注册快捷键: Cmd+J
✅ 快捷键已注册: Cmd+J
⚠️ 快捷键回调注册失败: Unable to register hotkey: RegisterEventHotKey failed for KeyJ

❌ macOS 辅助功能权限问题
──────────────────────────────────────────
快捷键功能需要辅助功能权限。

✅ 解决方案:
1️⃣  打开 "系统设置" → "隐私与安全" → "辅助功能"
2️⃣  将 pastee 添加到列表中（如果还没有）
3️⃣  确保 pastee 旁边的开关是打开的 ✓
4️⃣  重新启动 pastee

💡 提示: 将在 3 秒后自动打开辅助功能设置...

✅ 已打开辅助功能设置
```

## 验证方法

### 1. 移除权限（测试自动流程）
```bash
# 在 macOS 系统设置中手动删除 pastee 的权限
# 系统设置 → 隐私与安全 → 辅助功能 → 删除 pastee
```

### 2. 重启应用观察效果
```bash
cd /Users/kylin/pastey
npm run tauri dev
# 观察控制台输出和自动打开的系统设置
```

### 3. 验证手动按钮
```
1. 打开 Debug Page
2. 点击「显示帮助」
3. 点击「🔧 打开辅助功能设置」
4. 系统设置应该打开
```

## 快速链接

- 📖 [详细文档](./HOTKEY_ACCESSIBILITY.md)
- 📋 [完整总结](./IMPLEMENTATION_SUMMARY.md)
- 💻 [后端代码](./src-tauri/src/lib.rs)
- 🎨 [前端代码](./src/components/DebugPage.tsx)

---

**类型**：特性实现
**状态**：✅ 完成并测试
**测试覆盖**：53/53 通过
**最后更新**：2026-01-13
