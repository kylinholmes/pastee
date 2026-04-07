// src/components/TypeFilterBar.tsx
import { FilterValue, useClipStore } from '../store/clipStore'
import { TYPE_ACCENT_COLORS } from '../lib/typeColors'

const FILTERS: { label: string; value: FilterValue }[] = [
  { label: '全部', value: '' },
  { label: 'Text', value: 'Text' },
  { label: '富文本', value: 'Html' },
  { label: 'Image', value: 'Image' },
  { label: 'Color', value: 'Color' },
  { label: 'Files', value: 'Files' },
  { label: 'Link', value: 'link' },
  { label: 'Pinned', value: 'pinned' },
]

const TAG_COLORS = TYPE_ACCENT_COLORS

export function TypeFilterBarInline() {
  const { filterType, setFilterType } = useClipStore()

  return (
    <div className="flex gap-1 overflow-x-auto scrollbar-none flex-shrink-0">
      {FILTERS.map(({ label, value }) => {
        const active = filterType === value
        const color = value ? TAG_COLORS[value] : undefined
        return (
          <button
            key={value}
            onClick={() => setFilterType(value)}
            className="px-2 py-0.5 rounded-full text-[10px] font-medium whitespace-nowrap transition-all"
            style={{
              color: active ? '#fff' : (color ?? 'var(--text-primary)'),
              backgroundColor: active ? (color ?? 'var(--bg-elevated)') : 'transparent',
              border: `1px solid ${active ? (color ?? 'var(--border)') : (color ? color + '55' : 'var(--border-subtle)')}`,
            }}
          >
            {label}
          </button>
        )
      })}
    </div>
  )
}

export function TypeFilterBar() {
  const { filterType, setFilterType } = useClipStore()

  return (
    <div className="flex gap-2 px-3 pt-1.5 pb-2 overflow-x-auto scrollbar-none border-b border-[var(--border-subtle)]">
      {FILTERS.map(({ label, value }) => {
        const active = filterType === value
        const color = value ? TAG_COLORS[value] : undefined
        return (
          <button
            key={value}
            onClick={() => setFilterType(value)}
            className="px-2 py-0.5 rounded-full text-[10px] font-medium whitespace-nowrap transition-all"
            style={{
              color: active ? '#fff' : (color ?? 'var(--text-muted)'),
              backgroundColor: active ? (color ?? 'var(--bg-elevated)') : 'transparent',
              border: `1px solid ${active ? (color ?? 'var(--border)') : (color ? color + '55' : 'transparent')}`,
            }}
          >
            {label}
          </button>
        )
      })}
    </div>
  )
}
