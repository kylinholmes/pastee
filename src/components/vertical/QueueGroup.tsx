// src/components/vertical/QueueGroup.tsx
import { QueueGroup as QueueGroupType, useQueueStore } from '../../store/queueStore'
import { useClipStore } from '../../store/clipStore'

interface Props {
  group: QueueGroupType
}

export function QueueGroup({ group }: Props) {
  const { allClips } = useClipStore()
  const { dissolveGroup } = useQueueStore()
  const items = group.itemIds
    .map(id => allClips.find(c => c.id === id))
    .filter(Boolean) as NonNullable<typeof allClips[number]>[]

  if (items.length < 2) return null

  return (
    <div className="mx-2 mb-1 rounded-lg border border-[var(--queue-border)] bg-[var(--queue-bg)]">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2">
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] font-semibold text-[var(--queue)]">⚡ 队列 · {items.length} 项</span>
        </div>
        <button
          onClick={() => dissolveGroup(group.id)}
          className="text-[10px] text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors"
        >
          解散
        </button>
      </div>

      {/* Items */}
      <div className="flex flex-col gap-1 px-2 pb-2">
        {items.map((item, index) => (
          <div
            key={item.id}
            className="flex items-center gap-2 bg-[var(--bg-secondary)] rounded px-2.5 py-1.5"
          >
            <span className="text-[10px] font-bold text-[var(--queue)] flex-shrink-0 w-4">
              {['①','②','③','④','⑤','⑥','⑦','⑧','⑨'][index] ?? `${index+1}.`}
            </span>
            <p className="text-xs text-[var(--text-primary)] truncate flex-1">{item.preview}</p>
          </div>
        ))}
      </div>

      {/* Footer hint */}
      <div className="border-t border-[var(--queue-border)] px-3 py-1.5">
        <span className="text-[10px] text-[var(--queue)] opacity-70">↵ 顺序粘贴</span>
      </div>
    </div>
  )
}
