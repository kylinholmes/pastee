// src/components/horizontal/QueueGroupCard.tsx
import { QueueGroup, useQueueStore } from '../../store/queueStore'
import { useClipStore } from '../../store/clipStore'

interface Props { group: QueueGroup }

export function QueueGroupCard({ group }: Props) {
  const { allClips } = useClipStore()
  const { dissolveGroup } = useQueueStore()
  const items = group.itemIds
    .map(id => allClips.find(c => c.id === id))
    .filter(Boolean) as NonNullable<typeof allClips[number]>[]

  if (items.length < 2) return null

  return (
    <div className="flex-shrink-0 w-48 flex flex-col rounded-xl border border-[var(--queue-border)] bg-[var(--queue-bg)] p-2.5">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[9px] font-semibold text-[var(--queue)]">⚡ 队列 · {items.length} 项</span>
        <button
          onClick={() => dissolveGroup(group.id)}
          className="text-[9px] text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
        >✕</button>
      </div>

      <div className="flex flex-col gap-1 flex-1">
        {items.map((item, index) => (
          <div key={item.id} className="flex items-center gap-1.5 bg-black/20 rounded px-2 py-1">
            <span className="text-[9px] font-bold text-[var(--queue)] flex-shrink-0">
              {['①','②','③','④','⑤','⑥','⑦','⑧','⑨'][index] ?? `${index+1}.`}
            </span>
            <p className="text-[9px] text-[var(--text-primary)] truncate">{item.preview}</p>
          </div>
        ))}
      </div>

      <div className="mt-2 pt-1.5 border-t border-[var(--queue-border)]">
        <span className="text-[8px] text-[var(--queue)] opacity-70">↵ 顺序粘贴</span>
      </div>
    </div>
  )
}
