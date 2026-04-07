// src/components/vertical/ClipItem.tsx
import { useState, useEffect, useRef } from 'react'
import { ClipItem as ClipItemType, useClipStore } from '../../store/clipStore'
import { invoke } from '@tauri-apps/api/core'
import {
  File, FileText, Code, ImageIcon, Palette, Link as LinkIcon,
  Pin, PinOff, Trash2,
} from 'lucide-react'
import { TYPE_ACCENT_COLORS } from '../../lib/typeColors'
import { HoverPreview } from './HoverPreview'

// Global icon cache: ext -> data:image/png;base64,...
const iconCache = new Map<string, string>()

async function loadFileIcon(ext: string): Promise<string | null> {
  if (!ext) return null
  const cached = iconCache.get(ext)
  if (cached) return cached
  try {
    const b64 = await invoke<string | null>('get_file_icon', { extension: ext })
    if (b64) {
      const url = `data:image/png;base64,${b64}`
      iconCache.set(ext, url)
      return url
    }
  } catch {}
  return null
}

function parseFileNames(preview: string): string[] {
  const multiMatch = preview.match(/^(\d+) 个文件: (.+)$/)
  if (multiMatch) return multiMatch[2].split(', ')
  return [preview]
}

function getExt(filename: string): string {
  return filename.split('.').pop()?.toLowerCase() ?? ''
}

function FileIconComponent({ filename, size = 32 }: { filename: string; size?: number }) {
  const ext = getExt(filename)
  const [src, setSrc] = useState<string | null>(iconCache.get(ext) ?? null)

  useEffect(() => {
    if (!src && ext) {
      loadFileIcon(ext).then(url => { if (url) setSrc(url) })
    }
  }, [ext, src])

  if (src) {
    return <img src={src} alt={ext} style={{ width: size, height: size }} className="flex-shrink-0 object-contain" />
  }
  return <File size={size} className="flex-shrink-0 text-[var(--text-muted)]" />
}

function FilePreview({ preview }: { preview: string }) {
  const names = parseFileNames(preview)

  return (
    <div className="flex gap-3 py-0.5 overflow-x-auto">
      {names.map((name, i) => (
        <div key={i} className="flex flex-col items-center gap-0.5 w-14 flex-shrink-0">
          <FileIconComponent filename={name} size={40} />
          <span className="text-[9px] text-[var(--text-muted)] truncate w-full text-center leading-tight">{name}</span>
        </div>
      ))}
    </div>
  )
}

/** Relative time: 2m, 15m, 1h, 2h, 1d etc. */
function relativeTime(microsTs: number): string {
  const ms = microsTs / 1000
  const diff = Date.now() - ms
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'now'
  if (mins < 60) return `${mins}m`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h`
  const days = Math.floor(hours / 24)
  return `${days}d`
}

/** Type-specific line icon */
function TypeIcon({ type, className, color }: { type: string; className?: string; color?: string }) {
  const props = { size: 16, className: className, style: { color: color } }
  switch (type) {
    case 'Text': return <FileText {...props} />
    case 'Html': return <Code {...props} />
    case 'Image': return <ImageIcon {...props} />
    case 'Color': return <Palette {...props} />
    case 'Files': return <File {...props} />
    default: return <LinkIcon {...props} />
  }
}

const TAG_COLORS = TYPE_ACCENT_COLORS

function accentColor(item: ClipItemType): string {
  if (item.is_pinned) return TAG_COLORS.Pinned
  if (item.tags?.includes('link')) return TAG_COLORS.Link
  return TAG_COLORS[item.content_type] ?? '#94a3b8'
}


interface Props {
  item: ClipItemType
  isSelected?: boolean
  onClick?: () => void
}

export function ClipItem({ item, isSelected, onClick }: Props) {
  const { handlePin, handleDelete, thumbnailCache } = useClipStore()
  const isLink = item.tags?.includes('link')
  const iconType = isLink ? 'Link' : item.content_type
  const timeStr = relativeTime(item.created_at)

  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [previewAnchorY, setPreviewAnchorY] = useState<number | null>(null)

  function handleMouseEnter(e: React.MouseEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect()
    const midY = rect.top + rect.height / 2
    hoverTimer.current = setTimeout(() => setPreviewAnchorY(midY), 1000)
  }

  function handleMouseLeave() {
    if (hoverTimer.current) clearTimeout(hoverTimer.current)
    setPreviewAnchorY(null)
  }

  // Source metadata
  const source = item.source ?? ''
  const metaParts: string[] = []
  if (source) metaParts.push(source)
  if (isLink && item.link_domain) metaParts.push(item.link_domain)
  if (item.content_type === 'Color') metaParts.push('Color Value')

  const handlePaste = async () => {
    if (item.loading) return
    try {
      await invoke('paste_clip', { id: item.id })
      await invoke('toggle_window')
    } catch (e) {
      console.error('Paste failed:', e)
    }
  }

  return (
    <>
    <div
      onClick={() => { onClick?.(); handlePaste() }}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      className={[
        'group flex items-center gap-2.5 px-3 py-2 cursor-pointer transition-colors relative',
        isSelected ? 'bg-[var(--bg-elevated)]' : 'hover:bg-[var(--bg-hover)]',
      ].join(' ')}
    >
      {/* Type accent bar */}
      <div className="absolute left-0.5 top-3 bottom-3 w-[3px]" style={{ backgroundColor: accentColor(item) }} />

      {/* Type icon */}
      <div
        className="flex-shrink-0 w-8 h-8 rounded flex items-center justify-center"
        style={{ backgroundColor: accentColor(item) + '22' }}
      >
        {item.content_type === 'Color' ? (
          <div
            className="w-5 h-5 rounded-full border border-[var(--type-color-border)]"
            style={{ backgroundColor: item.preview }}
          />
        ) : isLink && item.link_favicon ? (
          <img src={item.link_favicon} alt="" className="w-4 h-4 rounded-sm" />
        ) : (
          <TypeIcon type={iconType} color={accentColor(item)} />
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        {item.loading ? (
          <span className="text-xs text-[var(--text-muted)] animate-pulse">处理中...</span>
        ) : item.content_type === 'Color' ? (
          <span className="text-sm text-[var(--text-primary)] truncate block">{item.preview}</span>
        ) : item.content_type === 'Image' ? (
          thumbnailCache.get(item.id) ? (
            <div className="flex items-center gap-2">
              <img
                src={thumbnailCache.get(item.id)}
                alt="clip"
                className="h-16 max-w-[180px] object-cover rounded"
              />
            </div>
          ) : (
            <span className="text-xs text-[var(--text-muted)]">图片</span>
          )
        ) : item.content_type === 'Files' ? (
          <FilePreview preview={item.preview} />
        ) : isLink ? (
          <p className="text-sm text-[var(--text-primary)] truncate leading-snug">
            {item.link_title || item.preview}
          </p>
        ) : (
          <p className="text-sm text-[var(--text-primary)] truncate leading-snug">{item.preview}</p>
        )}

        {/* Metadata line */}
        {(metaParts.length > 0 || item.is_pinned) && (
          <p className="flex items-center gap-1 text-[11px] text-[var(--text-muted)] truncate mt-0.5">
            {item.is_pinned && <Pin size={9} className="flex-shrink-0 text-[var(--accent)]" />}
            {metaParts.join(' · ')}
          </p>
        )}
      </div>

      {/* Timestamp */}
      <span className="text-[11px] text-[var(--text-muted)] flex-shrink-0 self-start mt-0.5">
        {timeStr}
      </span>

      {/* Actions (show on hover) */}
      <div className={[
        'flex items-center gap-0.5 flex-shrink-0 transition-opacity absolute right-2 top-1/2 -translate-y-1/2',
        'bg-[var(--bg-elevated)] rounded px-1 py-0.5',
        isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100',
      ].join(' ')}>
        <button
          onClick={(e) => { e.stopPropagation(); handlePin(item.id) }}
          className="p-1 text-[var(--text-muted)] hover:text-[var(--text-primary)] rounded transition-colors"
          disabled={item.loading}
          title={item.is_pinned ? '取消固定' : '固定'}
        >
          {item.is_pinned ? <PinOff size={12} /> : <Pin size={12} />}
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); handleDelete(item.id) }}
          className="p-1 text-[var(--text-muted)] hover:text-red-400 rounded transition-colors"
          disabled={item.loading}
          title="删除"
        >
          <Trash2 size={12} />
        </button>
      </div>
    </div>
    {previewAnchorY !== null && (
      <HoverPreview item={item} anchorY={previewAnchorY} />
    )}
    </>
  )
}
