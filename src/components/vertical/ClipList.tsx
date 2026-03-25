// src/components/vertical/ClipList.tsx
import { useState } from 'react'
import * as ScrollArea from '@radix-ui/react-scroll-area'
import { useClipStore } from '../../store/clipStore'
import { useQueueStore, selectVisibleGroups } from '../../store/queueStore'
import { ClipItem } from './ClipItem'
import { QueueGroup } from './QueueGroup'

export function ClipList() {
  const { displayList } = useClipStore()
  const visibleGroups = useQueueStore(selectVisibleGroups)
  const list = displayList()
  const [selectedId, setSelectedId] = useState<number | null>(null)

  const { groupForItem } = useQueueStore()
  const mainList = list.filter(item => {
    const group = groupForItem(item.id)
    return !group || group.itemIds.length < 2
  })

  return (
    <ScrollArea.Root className="flex-1 overflow-hidden">
      <ScrollArea.Viewport className="h-full w-full py-1">
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
      </ScrollArea.Viewport>
      <ScrollArea.Scrollbar
        orientation="vertical"
        className="flex w-1 touch-none select-none bg-transparent p-px"
      >
        <ScrollArea.Thumb className="relative flex-1 rounded-full bg-[var(--scrollbar-thumb)] hover:bg-[var(--scrollbar-thumb-hover)]" />
      </ScrollArea.Scrollbar>
    </ScrollArea.Root>
  )
}
