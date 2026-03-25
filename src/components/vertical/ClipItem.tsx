// src/components/vertical/ClipItem.tsx
import { ClipItem as ClipItemType, useClipStore } from '../../store/clipStore'

const TYPE_BAR_COLORS: Record<string, string> = {
  Text: 'bg-[#94a3b8]',
  Html: 'bg-[#6366f1]',
  Image: 'bg-[#f59e0b]',
  Color: 'bg-[#94a3b8]',
  Files: 'bg-[#64748b]',
}

const TYPE_LABELS: Record<string, string> = {
  Text: '文本',
  Html: 'Html',
  Image: '图片',
  Color: '颜色',
  Files: '文件',
}

interface Props {
  item: ClipItemType
  isSelected?: boolean
  onClick?: () => void
}

export function ClipItem({ item, isSelected, onClick }: Props) {
  const { handlePin, handleDelete, thumbnailCache } = useClipStore()
  const barColor = TYPE_BAR_COLORS[item.content_type] ?? 'bg-[var(--text-muted)]'
  const typeLabel = TYPE_LABELS[item.content_type] ?? item.content_type
  const timeStr = new Date(item.created_at / 1000).toLocaleTimeString('zh-CN', {
    hour: '2-digit', minute: '2-digit'
  })

  return (
    <div
      onClick={onClick}
      className={[
        'group flex items-start gap-2.5 px-3 py-2.5 mx-2 rounded-lg cursor-pointer transition-colors',
        isSelected ? 'bg-[var(--bg-elevated)]' : 'hover:bg-[var(--bg-hover)]',
      ].join(' ')}
    >
      {/* Color accent bar */}
      <div className={`w-0.5 h-full min-h-[28px] rounded-full flex-shrink-0 mt-0.5 ${barColor}`} />

      {/* Content */}
      <div className="flex-1 min-w-0">
        {item.loading ? (
          <div className="flex items-center gap-2 py-1">
            <span className="text-xs text-[var(--text-muted)] animate-pulse">处理中...</span>
          </div>
        ) : item.content_type === 'Color' ? (
          <div className="flex items-center gap-2">
            <div
              className="w-5 h-5 rounded-full flex-shrink-0 border border-[var(--type-color-border)]"
              style={{ backgroundColor: item.preview }}
            />
            <span className="text-sm text-[var(--text-primary)] truncate">{item.preview}</span>
          </div>
        ) : item.content_type === 'Image' ? (
          <div className="flex items-center gap-2">
            {thumbnailCache.get(item.id) ? (
              <img
                src={thumbnailCache.get(item.id)}
                alt="clip"
                className="h-10 w-16 object-cover rounded"
              />
            ) : (
              <div className="h-10 w-16 bg-[var(--bg-elevated)] rounded flex items-center justify-center">
                <span className="text-xs text-[var(--text-muted)]">图片</span>
              </div>
            )}
          </div>
        ) : (
          <p className="text-sm text-[var(--text-primary)] truncate leading-snug">{item.preview}</p>
        )}

        <div className="flex items-center gap-1.5 mt-1">
          <span className="text-[10px] text-[var(--text-muted)]">{typeLabel}</span>
          <span className="text-[10px] text-[var(--text-muted)]">·</span>
          <span className="text-[10px] text-[var(--text-muted)]">{timeStr}</span>
          {item.is_pinned && (
            <span className="text-[10px] text-[var(--accent)]">· 已固定</span>
          )}
        </div>
      </div>

      {/* Actions (show on hover/selected) */}
      <div className={[
        'flex items-center gap-1 flex-shrink-0 transition-opacity',
        isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100',
      ].join(' ')}>
        <button
          onClick={(e) => { e.stopPropagation(); handlePin(item.id) }}
          className="px-1.5 py-0.5 text-[10px] text-[var(--text-muted)] hover:text-[var(--text-primary)] rounded transition-colors"
          disabled={item.loading}
        >
          {item.is_pinned ? '取消' : '固定'}
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); handleDelete(item.id) }}
          className="px-1.5 py-0.5 text-[10px] text-red-400 hover:text-red-300 rounded transition-colors"
          disabled={item.loading}
        >
          删除
        </button>
      </div>
    </div>
  )
}
