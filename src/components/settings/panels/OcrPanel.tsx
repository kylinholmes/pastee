import { useSettingsStore } from '../../../store/settingsStore'

export function OcrPanel() {
  const { ocrModelUrl, ocrApiKey, update } = useSettingsStore()
  return (
    <div className="flex flex-col gap-3 p-4">
      <h2 className="text-xs uppercase tracking-wider text-[var(--text-muted)] mb-1">OCR</h2>
      <p className="text-[10px] text-[var(--text-muted)] mb-2">OCR 后端支持尚未实现，设置将在下个版本生效。</p>
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
