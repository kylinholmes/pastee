// src/components/settings/panels/ShortcutsPanel.tsx
import { useEffect, useState } from 'react'
import { platform } from '@tauri-apps/plugin-os'
import { invoke } from '@tauri-apps/api/core'
import { useSettingsStore } from '../../../store/settingsStore'
import { tauriHotkeyToBadges } from '../../../lib/hotkey'
import { HotkeyRecorder } from '../HotkeyRecorder'

export function ShortcutsPanel() {
  const { activationHotkey, keepWindowOpen, update } = useSettingsStore()
  const [isMac, setIsMac] = useState(false)
  const [recording, setRecording] = useState(false)

  useEffect(() => {
    setIsMac(platform() === 'macos')
  }, [])

  const badges = tauriHotkeyToBadges(activationHotkey, isMac)

  return (
    <div className="flex flex-col gap-3 p-4">
      <h2 className="text-xs uppercase tracking-wider text-[var(--text-muted)] mb-1">快捷键</h2>

      <div className="flex items-center justify-between py-2 border-b border-[var(--border-subtle)]">
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

      <div className="flex items-center justify-between py-2">
        <p className="text-xs text-[var(--text-primary)]">保持窗口开启</p>
        <button
          onClick={() => {
            const next = !keepWindowOpen
            update('keepWindowOpen', next)
            invoke('set_keep_window_open', { keep: next }).catch(() => {})
          }}
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

      {recording && <HotkeyRecorder onClose={() => setRecording(false)} />}
    </div>
  )
}
