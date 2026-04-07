// src/components/settings/HotkeyRecorder.tsx
import { useEffect, useRef, useState } from 'react'
import { platform } from '@tauri-apps/plugin-os'
import { eventToTauriHotkey, tauriHotkeyToBadges } from '../../lib/hotkey'
import { invoke } from '@tauri-apps/api/core'
import { useSettingsStore } from '../../store/settingsStore'

type RecordState = 'recording' | 'previewing'

interface Props {
  onClose: () => void
}

export function HotkeyRecorder({ onClose }: Props) {
  const { activationHotkey, update } = useSettingsStore()
  const [isMac, setIsMac] = useState(false)
  const [state, setState] = useState<RecordState>('recording')
  const [pending, setPending] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const overlayRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setIsMac(platform() === 'macos')
  }, [])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      e.preventDefault()
      e.stopPropagation()

      if (e.key === 'Escape') {
        onClose()
        return
      }

      const hotkey = eventToTauriHotkey(e)
      if (hotkey === null) return // only modifiers, keep waiting

      setPending(hotkey)
      setState('previewing')
      setError(null)
    }

    window.addEventListener('keydown', handler, { capture: true })
    return () => window.removeEventListener('keydown', handler, { capture: true })
  }, [onClose])

  async function handleConfirm() {
    if (!pending) return
    try {
      await invoke('update_hotkey', { hotkey: pending })
      await update('activationHotkey', pending)
      onClose()
    } catch (e: unknown) {
      setError(typeof e === 'string' ? e : '该快捷键已被其他程序占用，请重新录制')
      setState('recording')
      setPending(null)
    }
  }

  const displayBadges = pending
    ? tauriHotkeyToBadges(pending, isMac)
    : tauriHotkeyToBadges(activationHotkey, isMac)

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={e => { if (e.target === overlayRef.current) onClose() }}
    >
      <div className="bg-[var(--bg-base)] border border-[var(--border)] rounded-lg p-5 w-72 flex flex-col gap-4 shadow-xl">
        <h3 className="text-sm font-medium text-[var(--text-primary)]">录制快捷键</h3>

        <div
          className={[
            'h-16 flex items-center justify-center rounded-md border-2 border-dashed transition-colors',
            state === 'recording'
              ? 'border-[var(--accent)] bg-[var(--accent)]/5'
              : 'border-[var(--border)] bg-[var(--bg-elevated)]',
          ].join(' ')}
        >
          {state === 'recording' && !pending ? (
            <p className="text-xs text-[var(--text-muted)]">请按下组合键…</p>
          ) : (
            <div className="flex gap-1 flex-wrap justify-center">
              {displayBadges.map((badge, i) => (
                <kbd
                  key={i}
                  className="px-2 py-1 bg-[var(--bg-base)] border border-[var(--border)] rounded text-xs text-[var(--text-primary)]"
                >
                  {badge}
                </kbd>
              ))}
            </div>
          )}
        </div>

        {error && (
          <p className="text-[10px] text-red-400">{error}</p>
        )}

        {state === 'recording' && (
          <p className="text-[10px] text-[var(--text-muted)] text-center">
            按 Escape 取消
          </p>
        )}

        <div className="flex gap-2 justify-end">
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
          >
            取消
          </button>
          {state === 'previewing' && (
            <button
              onClick={handleConfirm}
              className="px-3 py-1.5 text-xs bg-[var(--accent)] text-white rounded hover:opacity-90 transition-opacity"
            >
              确认
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
