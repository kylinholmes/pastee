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
