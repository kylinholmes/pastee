// src/components/vertical/ClipList.tsx
import { useState, useMemo } from 'react'
import { useClipStore, ClipItem as ClipItemType } from '../../store/clipStore'
import { useQueueStore } from '../../store/queueStore'
import { ClipItem } from './ClipItem'
import { QueueGroup } from './QueueGroup'
import { Calendar } from 'lucide-react'

function SectionHeader({ icon, label }: { icon?: React.ReactNode; label: string }) {
  return (
    <div className="flex items-center gap-1.5 px-3 pt-3 pb-1">
      {icon}
      <span className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wider">{label}</span>
    </div>
  )
}

function dayKey(microsTs: number): string {
  const d = new Date(microsTs / 1000)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function dayLabel(key: string): string {
  const today = dayKey(Date.now() * 1000)
  if (key === today) return 'Today'
  const yesterday = dayKey((Date.now() - 86400000) * 1000)
  if (key === yesterday) return 'Yesterday'
  return key
}

function groupByDay(items: ClipItemType[]): { label: string; items: ClipItemType[] }[] {
  const map = new Map<string, ClipItemType[]>()
  for (const item of items) {
    const key = dayKey(item.created_at)
    if (!map.has(key)) map.set(key, [])
    map.get(key)!.push(item)
  }
  return Array.from(map.entries()).map(([key, items]) => ({ label: dayLabel(key), items }))
}

export function ClipList() {
  const { allClips, searchResults, searchQuery, filterType } = useClipStore()
  const groups = useQueueStore(s => s.groups)
  const groupForItem = useQueueStore(s => s.groupForItem)
  const [selectedId, setSelectedId] = useState<number | null>(null)

  const list = useMemo(() => {
    let base = searchQuery.trim() ? searchResults : allClips
    if (filterType) {
      if (filterType === 'link') {
        base = base.filter(item => item.tags?.includes('link'))
      } else if (filterType === 'pinned') {
        base = base.filter(item => item.is_pinned)
      } else {
        base = base.filter(item => item.content_type === filterType)
      }
    }
    return base
  }, [allClips, searchResults, searchQuery, filterType])

  const visibleGroups = useMemo(() =>
    groups.filter(g => g.itemIds.length >= 2),
    [groups]
  )

  const mainList = useMemo(() =>
    list.filter(item => {
      const group = groupForItem(item.id)
      return !group || group.itemIds.length < 2
    }),
    [list, groupForItem]
  )

  const dayGroups = useMemo(() => groupByDay(mainList), [mainList])

  return (
    <div className="flex-1 overflow-y-auto">
      {/* Queue groups at top */}
      {visibleGroups.map(group => (
        <QueueGroup key={group.id} group={group} />
      ))}

      {/* All items grouped by day */}
      {dayGroups.map(({ label, items }) => (
        <div key={label}>
          <SectionHeader icon={<Calendar size={12} className="text-[var(--text-muted)]" />} label={label} />
          {items.map(item => (
            <ClipItem
              key={item.id}
              item={item}
              isSelected={selectedId === item.id}
              onClick={() => setSelectedId(item.id === selectedId ? null : item.id)}
            />
          ))}
        </div>
      ))}

      {/* Empty state */}
      {mainList.length === 0 && visibleGroups.length === 0 && (
        <div className="px-4 py-8 text-center">
          <p className="text-sm text-[var(--text-muted)]">暂无内容</p>
        </div>
      )}
    </div>
  )
}
