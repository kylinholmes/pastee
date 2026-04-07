# macOS 辅助功能权限处理

## 问题说明

在 macOS 上，全局快捷键功能需要应用获得"辅助功能"（Accessibility）权限。如果用户未授予该权限，快捷键注册会失败。

## 解决方案架构

### 后端实现 (Rust/Tauri)

在 `src-tauri/src/lib.rs` 中，快捷键注册的完整流程：

```rust
// 1. 注册快捷键（通常成功）
match app.global_shortcut().register(shortcut) {
    Ok(_) => {
        println!("✅ 快捷键已注册: {}", shortcut);
        
        // 2. 添加快捷键回调（需要辅助功能权限，通常失败）
        if let Err(e) = app.global_shortcut().on_shortcut(shortcut, callback) {
            eprintln!("⚠️ 快捷键回调注册失败: {}", e);
            
            // 3. 自动打开辅助功能设置
            if cfg!(target_os = "macos") {
                // 3秒延迟，给用户时间看到日志信息
                thread::sleep(std::time::Duration::from_secs(3));
                
                // 打开 macOS 系统设置
                std::process::Command::new("open")
                    .arg("x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility")
                    .spawn()?;
            }
        }
    }
    Err(e) => {
        eprintln!("⚠️ 快捷键注册失败: {}", e);
    }
}
```

### 新增命令

添加了 `open_accessibility_settings` 命令，允许前端在任何时刻手动打开设置：

```rust
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
```

### 前端实现 (React/TypeScript)

在 `src/lib/tauri.ts` 中导出命令：

```typescript
export const openAccessibilitySettings = (): Promise<void> => {
    return invoke("open_accessibility_settings");
};
```

在 `src/components/DebugPage.tsx` 中显示帮助信息：

```tsx
<div style={{
  marginBottom: "12px",
  padding: "10px",
  backgroundColor: "#f0f7ff",
  border: "1px solid #91caff",
  borderRadius: "4px",
}}>
  <span>⌨️ 快捷键: Cmd + J (macOS) / Ctrl + Alt + V (Windows)</span>
  <button onClick={() => setShowHotKeyHelp(!showHotKeyHelp)}>
    显示/隐藏帮助
  </button>
  
  {showHotKeyHelp && (
    <div>
      <p>❓ 快捷键不工作？</p>
      <p>在 macOS 上，快捷键功能需要辅助功能权限。</p>
      <ol>
        <li>点击下方「打开辅助功能设置」</li>
        <li>在列表中找到 pastee（或添加它）</li>
        <li>打开 pastee 右侧的开关 ✓</li>
        <li>重新启动 pastee 应用</li>
      </ol>
      <button onClick={handleOpenAccessibilitySettings}>
        🔧 打开辅助功能设置
      </button>
    </div>
  )}
</div>
```

## 用户工作流

### 场景 1：首次启动应用

1. 用户启动 pastee
2. Rust 后端尝试注册快捷键回调
3. 失败：macOS 提示需要权限
4. **后端自动打开**系统设置 → 隐私与安全 → 辅助功能
5. 用户看到 pastee 要求添加到列表
6. 用户点击 `+` 按钮添加 pastee
7. 后端继续运行，用户重启应用
8. 快捷键开始工作

### 场景 2：用户从 Debug 页面手动打开

1. 用户在 Debug Page 看到快捷键信息框
2. 点击「显示帮助」按钮展开帮助信息
3. 点击「🔧 打开辅助功能设置」按钮
4. 系统设置打开
5. 按照步骤 5-7 继续

### 场景 3：Windows / Linux

- `open_accessibility_settings` 在非 macOS 系统上返回错误
- 快捷键在这些系统上直接正常工作
- 前端应检查平台并相应地显示/隐藏帮助

## 技术细节

### macOS 系统 URL

- **全局系统设置**：`open -a 'System Preferences'`
- **直接打开辅助功能**：`x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility`
- **替代方式**：`open -a 'System Settings'` (Big Sur+)

### 权限检查

目前实现是**被动检查**：
- 应用尝试使用快捷键功能
- 如果失败，自动提示用户授予权限

后续可考虑**主动检查**：
- 启动时检查权限状态
- 如果未授予，显示提示但不强制
- 使用 `Security` 框架检查权限（需要额外依赖）

### 时间延迟

代码中添加 3 秒延迟的原因：
```rust
thread::sleep(std::time::Duration::from_secs(3));
```

这给用户时间阅读控制台信息，了解正在发生的事情，提升用户体验。

## 测试方法

### 验证自动打开

1. 在 macOS 中移除 pastee 的辅助功能权限：
   - 系统设置 → 隐私与安全 → 辅助功能
   - 找到 pastee 并删除

2. 重新启动 pastee：
   ```bash
   cd /Users/kylin/pastey
   npm run tauri dev
   ```

3. 观察控制台输出：
   ```
   ⚠️ 快捷键回调注册失败: Unable to register hotkey: RegisterEventHotKey failed for KeyJ
   ❌ macOS 辅助功能权限问题
   ✅ 解决方案:
   1️⃣  打开 "系统设置" → "隐私与安全" → "辅助功能"
   2️⃣  将 pastee 添加到列表中（如果还没有）
   3️⃣  确保 pastee 旁边的开关是打开的 ✓
   4️⃣  重新启动 pastee
   💡 提示: 将在 3 秒后自动打开辅助功能设置...
   ✅ 已打开辅助功能设置
   ```

4. 系统设置应该自动打开，展示辅助功能页面

5. 在列表中找到并启用 pastee

6. 重启应用，快捷键应该可以工作

### 验证手动打开

1. 在 Debug Page 中点击「显示帮助」按钮
2. 点击「🔧 打开辅助功能设置」按钮
3. 系统设置应该打开

## 未来改进

1. **权限预检查**：启动时主动检查权限，而不是等到快捷键失败
2. **权限提示窗口**：显示原生的系统权限提示对话框
3. **自动重新加载**：检测权限变化后自动重新注册快捷键
4. **多快捷键回退**：如果首选快捷键因为权限或冲突失败，尝试备选快捷键
5. **权限状态指示器**：在 UI 中显示当前权限状态

## 相关文件

- 后端逻辑：[src-tauri/src/lib.rs](src-tauri/src/lib.rs#L177-L230)
- 前端命令绑定：[src/lib/tauri.ts](src/lib/tauri.ts#L48-L51)
- 前端 UI：[src/components/DebugPage.tsx](src/components/DebugPage.tsx#L120-L175)

## 参考

- [Tauri Global Shortcut Plugin](https://tauri.app/plugins/global-shortcut/)
- [macOS Accessibility Framework](https://developer.apple.com/accessibility/macos/)
- [System Preferences URL Schemes](https://support.apple.com/en-us/HT204895)
