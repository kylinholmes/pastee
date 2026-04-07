import { useEffect, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { useSettingsStore } from '../../../store/settingsStore'
import { useClipStore } from '../../../store/clipStore'

const RETENTION_OPTIONS = [
  { label: '1 周', value: 7 },
  { label: '15 天', value: 15 },
  { label: '1 个月', value: 30 },
  { label: '3 个月', value: 90 },
  { label: '永不清理', value: 0 },
]

const MAX_COUNT_STEPS = [100, 200, 500, 1000, 0] // 0 = 无限
const MAX_COUNT_LABELS = ['100 条', '200 条', '500 条', '1000 条', '无限']

const TYPE_LABELS: Record<string, string> = {
  Text:   '文本',
  Html:   'HTML',
  Image:  '图片',
  Color:  '颜色',
  Files:  '文件',
  Pinned: '已固定',
}

function SettingRow({ label, description, children }: { label: string; description?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2.5 border-b border-[var(--border-subtle)] last:border-0">
      <div>
        <p className="text-xs text-[var(--text-primary)]">{label}</p>
        {description && <p className="text-[10px] text-[var(--text-muted)] mt-0.5">{description}</p>}
      </div>
      {children}
    </div>
  )
}

function SectionTitle({ label }: { label: string }) {
  return <h3 className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] mt-4 mb-1 first:mt-0">{label}</h3>
}

export function GeneralPanel() {
  const { layoutOverride, theme, historyRetentionDays, maxItemCount, keepWindowOpen, update } = useSettingsStore()
  const { fetchAllClips, fetchTotalCount, totalCount } = useClipStore()
  const [stats, setStats] = useState<{ label: string; count: number }[]>([])
  const [clearing, setClearing] = useState(false)

  useEffect(() => {
    fetchTotalCount()
    invoke<[string, number][]>('get_clip_stats').then(rows => {
      setStats(rows.map(([type, count]) => ({ label: TYPE_LABELS[type] ?? type, count })))
    }).catch(() => {})
  }, [])

  const maxCountIndex = MAX_COUNT_STEPS.indexOf(maxItemCount) !== -1
    ? MAX_COUNT_STEPS.indexOf(maxItemCount)
    : 2 // 默认 500

  const handleClear = async () => {
    setClearing(true)
    try {
      await invoke<number>('clear_unpinned_clips')
      await fetchAllClips()
      await fetchTotalCount()
      invoke<[string, number][]>('get_clip_stats').then(rows => {
        setStats(rows.map(([type, count]) => ({ label: TYPE_LABELS[type] ?? type, count })))
      }).catch(() => {})
    } finally {
      setClearing(false)
    }
  }

  return (
    <div className="flex flex-col p-4">
      <SectionTitle label="外观" />

      <SettingRow label="主题">
        <select
          value={theme}
          onChange={e => update('theme', e.target.value as any)}
          className="bg-[var(--bg-elevated)] border border-[var(--border)] rounded px-2 py-1 text-xs text-[var(--text-primary)] outline-none"
        >
          <option value="dark">深色</option>
          <option value="light">浅色</option>
          <option value="system">跟随系统</option>
        </select>
      </SettingRow>

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

      <SectionTitle label="行为" />

      <SettingRow label="保持窗口开启" description="失去焦点后不自动关闭">
        <button
          onClick={() => {
            const next = !keepWindowOpen
            update('keepWindowOpen', next)
            invoke('set_keep_window_open', { keep: next }).catch(() => {})
          }}
          className={[
            'w-8 h-4 rounded-full transition-colors flex items-center px-0.5',
            keepWindowOpen ? 'bg-[var(--accent)] justify-end' : 'bg-[var(--bg-elevated)] justify-start',
          ].join(' ')}
        >
          <span className="w-3 h-3 rounded-full bg-white" />
        </button>
      </SettingRow>

      <SectionTitle label="存储" />

      <SettingRow label="历史保留" description="超出后自动清理旧记录">
        <select
          value={historyRetentionDays}
          onChange={e => update('historyRetentionDays', Number(e.target.value))}
          className="bg-[var(--bg-elevated)] border border-[var(--border)] rounded px-2 py-1 text-xs text-[var(--text-primary)] outline-none"
        >
          {RETENTION_OPTIONS.map(o => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </SettingRow>

      <div className="py-2.5 border-b border-[var(--border-subtle)]">
        <div className="flex items-center justify-between mb-2">
          <div>
            <p className="text-xs text-[var(--text-primary)]">最大条数</p>
            <p className="text-[10px] text-[var(--text-muted)] mt-0.5">超出后删除最旧未固定记录</p>
          </div>
          <span className="text-xs text-[var(--text-primary)] font-medium">
            {MAX_COUNT_LABELS[maxCountIndex]}
          </span>
        </div>
        <input
          type="range"
          min={0}
          max={MAX_COUNT_STEPS.length - 1}
          step={1}
          value={maxCountIndex}
          onChange={e => update('maxItemCount', MAX_COUNT_STEPS[Number(e.target.value)])}
          className="w-full accent-[var(--accent)]"
        />
        <div className="flex justify-between mt-1">
          {MAX_COUNT_LABELS.map(l => (
            <span key={l} className="text-[9px] text-[var(--text-muted)]">{l}</span>
          ))}
        </div>
      </div>

      <div className="py-2.5">
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs text-[var(--text-primary)]">记录统计</p>
          <span className="text-[10px] text-[var(--text-muted)]">共 {totalCount} 条</span>
        </div>
        {stats.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-3">
            {stats.map(({ label, count }) => (
              <span key={label} className="px-2 py-0.5 rounded-full bg-[var(--bg-elevated)] text-[10px] text-[var(--text-secondary)]">
                {label} {count}
              </span>
            ))}
          </div>
        )}
        <button
          onClick={handleClear}
          disabled={clearing}
          className="px-3 py-1 text-xs text-red-400 border border-red-400/30 rounded hover:bg-red-400/10 transition-colors disabled:opacity-50"
        >
          {clearing ? '清理中...' : '删除全部（保留已固定）'}
        </button>
      </div>
    </div>
  )
}
