// src/components/horizontal/ClipBoard.tsx
import { useState, useMemo, useRef, useEffect } from 'react'
import { useClipStore } from '../../store/clipStore'
import { useQueueStore } from '../../store/queueStore'
import { ClipCard } from './ClipCard'
import { QueueGroupCard } from './QueueGroupCard'

export function ClipBoard() {
  const { allClips, searchResults, searchQuery, filterType, fetchMoreClips, hasMore } = useClipStore()
  const groups = useQueueStore(s => s.groups)
  const groupForItem = useQueueStore(s => s.groupForItem)
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const sentinelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = sentinelRef.current
    if (!el) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          fetchMoreClips()
        }
      },
      { threshold: 0 }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [fetchMoreClips])

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
    <div className="flex-1 overflow-x-auto">
      <div className="flex items-start gap-2 px-3 py-3 h-full">
        {visibleGroups.map(group => (
          <QueueGroupCard key={group.id} group={group} />
        ))}
        {mainList.map(item => (
          <ClipCard
            key={item.id}
            item={item}
            isSelected={selectedId === item.id}
            onClick={() => setSelectedId(item.id === selectedId ? null : item.id)}
          />
        ))}
        {mainList.length === 0 && visibleGroups.length === 0 && (
          <div className="flex items-center justify-center w-full">
            <p className="text-sm text-[var(--text-muted)]">暂无内容</p>
          </div>
        )}
        {/* Sentinel for infinite scroll */}
        {hasMore && !searchQuery.trim() && (
          <div ref={sentinelRef} className="w-4 flex-shrink-0" />
        )}
      </div>
    </div>
  )
}
