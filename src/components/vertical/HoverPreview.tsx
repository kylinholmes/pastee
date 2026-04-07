// src/components/vertical/HoverPreview.tsx
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { invoke } from '@tauri-apps/api/core'
import { getImageUrl } from '../../lib/tauri'
import { ClipItem } from '../../store/clipStore'

interface Props {
  item: ClipItem
  anchorY: number  // pageY of the hovered item's midpoint
}

export function HoverPreview({ item, anchorY }: Props) {
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [fullText, setFullText] = useState<string | null>(null)

  useEffect(() => {
    if (item.content_type === 'Image') {
      getImageUrl(item.id, false)
        .then(url => setImageUrl(url))
        .catch(() => {})
    } else if (item.content_type === 'Text' || item.content_type === 'Html') {
      invoke<{ type: string; data?: string; text?: string }>('get_clip_content', { id: item.id })
        .then(res => setFullText(res.data ?? res.text ?? null))
        .catch(() => {})
    }
  }, [item.id, item.content_type])

  // Position: fixed to right of the list, vertically centered on the item
  const isImage = item.content_type === 'Image'
  const PANEL_WIDTH = isImage ? 480 : 280
  const PANEL_MAX_HEIGHT = isImage ? 600 : 360
  const RIGHT_OFFSET = 16
  const viewportH = window.innerHeight

  // clamp so panel doesn't overflow viewport
  const top = Math.min(
    Math.max(8, anchorY - PANEL_MAX_HEIGHT / 2),
    viewportH - PANEL_MAX_HEIGHT - 8
  )

  const content = (() => {
    switch (item.content_type) {
      case 'Image':
        return imageUrl ? (
          <img src={imageUrl} alt="preview" className="w-full h-auto rounded object-contain max-h-[560px]" />
        ) : (
          <div className="flex items-center justify-center h-24 text-xs text-[var(--text-muted)]">加载中…</div>
        )

      case 'Color':
        return (
          <div className="flex flex-col items-center gap-3 py-4">
            <div
              className="w-20 h-20 rounded-full border border-[var(--border)]"
              style={{ backgroundColor: item.preview }}
            />
            <span className="text-sm font-mono text-[var(--text-primary)]">{item.preview}</span>
          </div>
        )

      case 'Text':
      case 'Html':
        return (
          <p className="text-xs text-[var(--text-primary)] whitespace-pre-wrap break-words leading-relaxed">
            {fullText ?? item.preview}
          </p>
        )

      case 'Files': {
        const names = item.preview.match(/^(\d+) 个文件: (.+)$/)
          ? item.preview.match(/^(\d+) 个文件: (.+)$/)![2].split(', ')
          : [item.preview]
        return (
          <div className="flex flex-col gap-1">
            {names.map((name, i) => (
              <span key={i} className="text-xs text-[var(--text-primary)] truncate">{name}</span>
            ))}
          </div>
        )
      }

      default:
        // Link
        return (
          <div className="flex flex-col gap-2">
            {item.link_favicon && (
              <div className="flex items-center gap-2">
                <img src={item.link_favicon} alt="" className="w-4 h-4 rounded-sm flex-shrink-0" />
                <span className="text-[11px] text-[var(--text-muted)] truncate">{item.link_domain}</span>
              </div>
            )}
            {item.link_title && (
              <p className="text-xs font-medium text-[var(--text-primary)] leading-snug">{item.link_title}</p>
            )}
            <p className="text-[11px] text-[var(--text-muted)] break-all leading-relaxed">{item.preview}</p>
          </div>
        )
    }
  })()

  return createPortal(
    <div
      className="fixed z-50 rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] shadow-2xl overflow-y-auto p-3 pointer-events-none"
      style={{
        width: PANEL_WIDTH,
        maxHeight: PANEL_MAX_HEIGHT,
        top,
        right: RIGHT_OFFSET,
      }}
    >
      {content}
    </div>,
    document.body
  )
}
