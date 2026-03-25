// src/components/horizontal/ClipCard.tsx
import { useState, useEffect } from 'react'
import { ClipItem, useClipStore } from '../../store/clipStore'
import { invoke } from '@tauri-apps/api/core'
import { File } from 'lucide-react'

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

function getExt(filename: string): string {
  return filename.split('.').pop()?.toLowerCase() ?? ''
}

function FileIcon({ filename, size = 24 }: { filename: string; size?: number }) {
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

interface Props {
  item: ClipItem
  isSelected?: boolean
  onClick?: () => void
}

export function ClipCard({ item, isSelected, onClick }: Props) {
  const { handlePin, handleDelete, thumbnailCache } = useClipStore()
  const isLink = item.tags?.includes('link')
  const borderColor = isLink
    ? 'border-[rgba(59,130,246,0.3)]'
    : (TYPE_BORDER_COLORS[item.content_type] ?? 'border-[var(--border)]')
  const labelColor = isLink ? 'text-[#3b82f6]' : (TYPE_LABEL_COLORS[item.content_type] ?? 'text-[var(--text-muted)]')
  const timeStr = new Date(item.created_at / 1000).toLocaleTimeString('zh-CN', {
    hour: '2-digit', minute: '2-digit'
  })

  const handlePaste = async () => {
    if (item.loading) return
    try {
      await invoke('paste_clip', { id: item.id })
      await invoke('toggle_window')
    } catch (e) {
      console.error('Paste failed:', e)
    }
  }

  const isImage = item.content_type === 'Image'
  const isFiles = item.content_type === 'Files'
  const cardWidth = isImage || isFiles || isLink ? 'w-52' : 'w-44'

  return (
    <div
      onClick={() => { onClick?.(); handlePaste() }}
      className={[
        `group flex-shrink-0 ${cardWidth} h-[200px] flex flex-col rounded-xl border bg-[var(--bg-secondary)] p-3 cursor-pointer transition-all`,
        borderColor,
        isSelected ? 'border-[var(--accent)] ring-1 ring-[var(--accent)] ring-opacity-40' : 'hover:border-opacity-60',
      ].join(' ')}
    >
      <span className={`text-[9px] font-semibold mb-1.5 ${labelColor}`}>
        {isLink ? 'Link' : (TYPE_LABELS[item.content_type] ?? item.content_type)}
      </span>

      <div className="flex-1 min-h-0 overflow-hidden">
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
        ) : isImage ? (
          thumbnailCache.get(item.id) ? (
            <img src={thumbnailCache.get(item.id)} alt="clip" className="w-full h-36 object-cover rounded" />
          ) : (
            <div className="w-full h-36 bg-[var(--bg-elevated)] rounded flex items-center justify-center">
              <span className="text-xs text-[var(--text-muted)]">🖼</span>
            </div>
          )
        ) : isFiles ? (() => {
          const multiMatch = item.preview.match(/^(\d+) 个文件: (.+)$/)
          const names = multiMatch ? multiMatch[2].split(', ') : [item.preview]
          const MAX_STACK = 3
          const shown = names.slice(0, MAX_STACK)
          const extra = names.length - MAX_STACK
          const total = shown.length
          return (
            <div className="flex flex-col items-center justify-center flex-1 gap-1.5">
              <div className="relative" style={{ width: 40 + (total - 1) * 6, height: 40 + (total - 1) * 4 }}>
                {shown.slice().reverse().map((name, ri) => {
                  const i = total - 1 - ri
                  return (
                    <div
                      key={i}
                      className="absolute rounded shadow-sm"
                      style={{
                        left: i * 6,
                        top: (total - 1 - i) * 4,
                        zIndex: i,
                        opacity: 1 - (total - 1 - i) * 0.25,
                      }}
                    >
                      <FileIcon filename={name} size={40} />
                    </div>
                  )
                })}
              </div>
              <div className="flex flex-col items-center gap-0.5 w-full">
                <span className="text-[8px] text-[var(--text-secondary)] text-center leading-tight px-1 truncate w-full">
                  {names.length === 1 ? names[0] : `${names.length} 个文件`}
                </span>
                {names.length > 1 && (
                  <span className="text-[7px] text-[var(--text-muted)] text-center truncate w-full px-1">
                    {shown.map(n => n.split('/').pop()).join(', ')}
                    {extra > 0 && ` +${extra}`}
                  </span>
                )}
              </div>
            </div>
          )
        })() : isLink ? (
          <LinkCardContent item={item} />
        ) : (
          <p className="text-[10px] text-[var(--text-primary)] line-clamp-6 leading-relaxed">{item.preview}</p>
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

function LinkCardContent({ item }: { item: ClipItem }) {
  const { link_title, link_domain, link_og_image, link_favicon, preview } = item
  const domain = link_domain || preview.replace(/^https?:\/\//, '').split('/')[0]

  return (
    <div className="flex flex-col h-full gap-1 overflow-hidden">
      {link_og_image ? (
        <div className="relative flex-1 rounded overflow-hidden bg-[var(--bg-elevated)]">
          <img src={link_og_image} alt="" className="w-full h-full object-cover" />
          {link_favicon && (
            <img src={link_favicon} alt="" className="absolute top-1 right-1 w-4 h-4 rounded object-contain bg-white/80 p-px" />
          )}
        </div>
      ) : (
        <div className="relative flex-1 rounded bg-[var(--bg-elevated)] flex items-center justify-center">
          <span className="text-xl">🔗</span>
          {link_favicon && (
            <img src={link_favicon} alt="" className="absolute top-1 right-1 w-4 h-4 rounded object-contain bg-white/80 p-px" />
          )}
        </div>
      )}
      <div className="flex-shrink-0">
        {link_title && (
          <p className="text-[9px] text-[var(--text-primary)] font-medium leading-tight line-clamp-2">{link_title}</p>
        )}
        <p className="text-[8px] text-[#3b82f6] truncate">{domain}</p>
      </div>
    </div>
  )
}
