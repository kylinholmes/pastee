// src/components/TypeFilterBar.tsx
import { FilterValue, useClipStore } from '../store/clipStore'

const FILTERS: { label: string; value: FilterValue }[] = [
  { label: '全部', value: '' },
  { label: 'Text', value: 'Text' },
  { label: 'Html', value: 'Html' },
  { label: 'Image', value: 'Image' },
  { label: 'Color', value: 'Color' },
  { label: 'Files', value: 'Files' },
  { label: 'Link', value: 'link' },
]

const TYPE_COLORS: Record<string, string> = {
  Text: 'text-[#94a3b8]',
  Html: 'text-[#6366f1]',
  Image: 'text-[#f59e0b]',
  Color: 'text-[#94a3b8]',
  Files: 'text-[#64748b]',
  link: 'text-[#3b82f6]',
}

export function TypeFilterBarInline() {
  const { filterType, setFilterType } = useClipStore()

  return (
    <div className="flex gap-1 overflow-x-auto scrollbar-none flex-shrink-0">
      {FILTERS.map(({ label, value }) => {
        const active = filterType === value
        const colorClass = value ? TYPE_COLORS[value] : 'text-[var(--text-primary)]'
        return (
          <button
            key={value}
            onClick={() => setFilterType(value)}
            className={[
              'px-2 py-0.5 rounded-full text-[10px] font-medium whitespace-nowrap transition-colors',
              active
                ? 'bg-[var(--bg-elevated)] text-[var(--text-primary)]'
                : `${colorClass} hover:bg-[var(--bg-elevated)]`,
            ].join(' ')}
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
    <div className="flex gap-1.5 px-3 py-2 overflow-x-auto scrollbar-none border-b border-[var(--border-subtle)]">
      {FILTERS.map(({ label, value }) => {
        const active = filterType === value
        const colorClass = value ? TYPE_COLORS[value] : 'text-[var(--text-primary)]'
        return (
          <button
            key={value}
            onClick={() => setFilterType(value)}
            className={[
              'px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-colors',
              active
                ? 'bg-[var(--bg-elevated)] text-[var(--text-primary)]'
                : `${colorClass} hover:bg-[var(--bg-elevated)]`,
            ].join(' ')}
          >
            {label}
          </button>
        )
      })}
    </div>
  )
}
