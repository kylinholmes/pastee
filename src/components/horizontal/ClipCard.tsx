// src/components/horizontal/ClipCard.tsx
import { ClipItem, useClipStore } from '../../store/clipStore'

const TYPE_BORDER_COLORS: Record<string, string> = {
  Text: 'border-[rgba(148,163,184,0.2)]',
  Html: 'border-[rgba(99,102,241,0.25)]',
  Image: 'border-[rgba(245,158,11,0.2)]',
  Color: 'border-[rgba(82,82,82,0.4)]',
  Files: 'border-[rgba(100,116,139,0.2)]',
}

const TYPE_LABEL_COLORS: Record<string, string> = {
  Text: 'text-[#94a3b8]',
  Html: 'text-[#818cf8]',
  Image: 'text-[#f59e0b]',
  Color: 'text-[#94a3b8]',
  Files: 'text-[#64748b]',
}

const TYPE_LABELS: Record<string, string> = {
  Text: '文本', Html: 'Html', Image: '图片', Color: '颜色', Files: '文件',
}

interface Props {
  item: ClipItem
  isSelected?: boolean
  onClick?: () => void
}

export function ClipCard({ item, isSelected, onClick }: Props) {
  const { handlePin, handleDelete, thumbnailCache } = useClipStore()
  const borderColor = TYPE_BORDER_COLORS[item.content_type] ?? 'border-[var(--border)]'
  const labelColor = TYPE_LABEL_COLORS[item.content_type] ?? 'text-[var(--text-muted)]'
  const timeStr = new Date(item.created_at / 1000).toLocaleTimeString('zh-CN', {
    hour: '2-digit', minute: '2-digit'
  })

  return (
    <div
      onClick={onClick}
      className={[
        'group flex-shrink-0 w-36 flex flex-col rounded-xl border bg-[var(--bg-secondary)] p-2.5 cursor-pointer transition-all',
        borderColor,
        isSelected ? 'border-[var(--accent)] ring-1 ring-[var(--accent)] ring-opacity-40' : 'hover:border-opacity-60',
      ].join(' ')}
    >
      <span className={`text-[9px] font-semibold mb-1.5 ${labelColor}`}>
        {TYPE_LABELS[item.content_type] ?? item.content_type}
      </span>

      <div className="flex-1 min-h-0">
        {item.loading ? (
          <p className="text-[10px] text-[var(--text-muted)] animate-pulse">处理中...</p>
        ) : item.content_type === 'Color' ? (
          <div className="flex items-center gap-1.5">
            <div
              className="w-6 h-6 rounded-full border border-[var(--type-color-border)]"
              style={{ backgroundColor: item.preview }}
            />
            <span className="text-[10px] text-[var(--text-secondary)] truncate">{item.preview}</span>
          </div>
        ) : item.content_type === 'Image' ? (
          thumbnailCache.get(item.id) ? (
            <img src={thumbnailCache.get(item.id)} alt="clip" className="w-full h-16 object-cover rounded" />
          ) : (
            <div className="w-full h-16 bg-[var(--bg-elevated)] rounded flex items-center justify-center">
              <span className="text-xs text-[var(--text-muted)]">🖼</span>
            </div>
          )
        ) : (
          <p className="text-[10px] text-[var(--text-primary)] line-clamp-4 leading-relaxed">{item.preview}</p>
        )}
      </div>

      <div className="flex items-center justify-between mt-1.5 pt-1.5 border-t border-[var(--border-subtle)]">
        <span className="text-[8px] text-[var(--text-muted)]">{timeStr}</span>
        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={e => { e.stopPropagation(); handlePin(item.id) }}
            className="text-[8px] text-[var(--text-muted)] hover:text-[var(--text-primary)]"
          >{item.is_pinned ? '取消' : '固定'}</button>
          <button
            onClick={e => { e.stopPropagation(); handleDelete(item.id) }}
            className="text-[8px] text-red-400 hover:text-red-300"
          >✕</button>
        </div>
      </div>
    </div>
  )
}
