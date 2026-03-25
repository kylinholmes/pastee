// src/components/horizontal/ClipBoard.tsx
import { useState } from 'react'
import * as ScrollArea from '@radix-ui/react-scroll-area'
import { useClipStore } from '../../store/clipStore'
import { useQueueStore, selectVisibleGroups } from '../../store/queueStore'
import { ClipCard } from './ClipCard'
import { QueueGroupCard } from './QueueGroupCard'

export function ClipBoard() {
  const { displayList } = useClipStore()
  const visibleGroups = useQueueStore(selectVisibleGroups)
  const { groupForItem } = useQueueStore()
  const list = displayList()
  const [selectedId, setSelectedId] = useState<number | null>(null)

  const mainList = list.filter(item => {
    const group = groupForItem(item.id)
    return !group || group.itemIds.length < 2
  })

  return (
    <ScrollArea.Root className="flex-1 overflow-hidden">
      <ScrollArea.Viewport className="h-full w-full">
        <div className="flex items-stretch gap-2 px-3 py-3 h-full">
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
        </div>
      </ScrollArea.Viewport>
      <ScrollArea.Scrollbar
        orientation="horizontal"
        className="flex h-1 touch-none select-none flex-col bg-transparent p-px"
      >
        <ScrollArea.Thumb className="relative flex-1 rounded-full bg-[var(--scrollbar-thumb)]" />
      </ScrollArea.Scrollbar>
    </ScrollArea.Root>
  )
}
