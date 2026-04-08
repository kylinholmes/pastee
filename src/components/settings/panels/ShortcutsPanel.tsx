// src/components/settings/panels/ShortcutsPanel.tsx
import { useEffect, useState } from 'react'
import { platform } from '@tauri-apps/plugin-os'
import { useSettingsStore } from '../../../store/settingsStore'
import { tauriHotkeyToBadges } from '../../../lib/hotkey'
import { HotkeyRecorder } from '../HotkeyRecorder'

const BUILTIN_SHORTCUTS = [
  { keys: ['Ctrl+F', '?'], description: '搜索' },
  { keys: ['Ctrl+,'], description: '打开设置' },
  { keys: ['Esc'], description: '关闭窗口' },
]

const BUILTIN_SHORTCUTS_MAC = [
  { keys: ['⌘F', '?'], description: '搜索' },
  { keys: ['⌘,'], description: '打开设置' },
  { keys: ['Esc'], description: '关闭窗口' },
]

export function ShortcutsPanel() {
  const { activationHotkey } = useSettingsStore()
  const [isMac, setIsMac] = useState(false)
  const [recording, setRecording] = useState(false)

  useEffect(() => {
    setIsMac(platform() === 'macos')
  }, [])

  const badges = tauriHotkeyToBadges(activationHotkey, isMac)
  const builtins = isMac ? BUILTIN_SHORTCUTS_MAC : BUILTIN_SHORTCUTS

  return (
    <div className="flex flex-col gap-3 p-4">
      <h2 className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] mb-1">快捷键</h2>

      {/* 全局快捷键 */}
      <div className="flex items-center justify-between py-2.5 border-b border-[var(--border-subtle)]">
        <div>
          <p className="text-xs text-[var(--text-primary)]">唤起窗口</p>
          <p className="text-[10px] text-[var(--text-muted)] mt-0.5">全局快捷键</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex gap-1">
            {badges.map((badge, i) => (
              <kbd
                key={i}
                className="px-1.5 py-0.5 bg-[var(--bg-elevated)] border border-[var(--border)] rounded text-[10px] text-[var(--text-secondary)]"
              >
                {badge}
              </kbd>
            ))}
          </div>
          <button
            onClick={() => setRecording(true)}
            className="px-2 py-0.5 text-[10px] border border-[var(--border)] rounded text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:border-[var(--accent)] transition-colors"
          >
            编辑
          </button>
        </div>
      </div>

      {/* 内置快捷键（只读） */}
      <p className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] mt-2">应用内快捷键</p>
      {builtins.map(({ keys, description }) => (
        <div key={description} className="flex items-center justify-between py-1.5 border-b border-[var(--border-subtle)] last:border-0">
          <p className="text-xs text-[var(--text-secondary)]">{description}</p>
          <div className="flex gap-1">
            {keys.map((k, i) => (
              <span key={i} className="flex items-center gap-1">
                {i > 0 && <span className="text-[10px] text-[var(--text-muted)]">/</span>}
                <kbd className="px-1.5 py-0.5 bg-[var(--bg-elevated)] border border-[var(--border)] rounded text-[10px] text-[var(--text-secondary)]">
                  {k}
                </kbd>
              </span>
            ))}
          </div>
        </div>
      ))}

      {recording && <HotkeyRecorder onClose={() => setRecording(false)} />}
    </div>
  )
}
