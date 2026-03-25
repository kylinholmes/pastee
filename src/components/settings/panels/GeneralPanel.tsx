import { invoke } from '@tauri-apps/api/core'
import { useSettingsStore } from '../../../store/settingsStore'

export function GeneralPanel() {
  const { layoutOverride, historyRetentionDays, maxItemCount, update } = useSettingsStore()

  return (
    <div className="flex flex-col gap-3 p-4">
      <h2 className="text-xs uppercase tracking-wider text-[var(--text-muted)] mb-1">通用</h2>

      <SettingRow label="布局偏好" description="覆盖自动平台检测">
        <select
          value={layoutOverride}
          onChange={async e => {
            await update('layoutOverride', e.target.value as any)
            invoke('apply_layout').catch(() => {})
          }}
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
