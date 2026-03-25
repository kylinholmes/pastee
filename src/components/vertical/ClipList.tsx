// src/components/vertical/ClipList.tsx
import { useState, useMemo } from 'react'
import { useClipStore } from '../../store/clipStore'
import { useQueueStore } from '../../store/queueStore'
import { ClipItem } from './ClipItem'
import { QueueGroup } from './QueueGroup'

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

  return (
    <div className="flex-1 overflow-y-auto py-1">
      {/* Queue groups at top */}
      {visibleGroups.map(group => (
        <QueueGroup key={group.id} group={group} />
      ))}

      {/* Regular items */}
      {mainList.length === 0 ? (
        <div className="px-4 py-8 text-center">
          <p className="text-sm text-[var(--text-muted)]">暂无内容</p>
        </div>
      ) : (
        mainList.map(item => (
          <ClipItem
            key={item.id}
            item={item}
            isSelected={selectedId === item.id}
            onClick={() => setSelectedId(item.id === selectedId ? null : item.id)}
          />
        ))
      )}
    </div>
  )
}
