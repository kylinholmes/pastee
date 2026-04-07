// src/lib/typeColors.ts
// Single source of truth for per-type accent colors

export const TYPE_ACCENT_COLORS: Record<string, string> = {
  Text:   '#94a3b8',
  Html:   '#6366f1',
  Image:  '#f59e0b',
  Color:  '#ec4899',
  Files:  '#64748b',
  Link:   '#3b82f6',
  link:   '#3b82f6',
  Pinned: '#f97316',
  pinned: '#f97316',
}

export const TYPE_DISPLAY_LABELS: Record<string, string> = {
  Text:   '文本',
  Html:   '富文本',
  Image:  '图片',
  Color:  '颜色',
  Files:  '文件',
  Link:   '链接',
  link:   '链接',
  Pinned: '已固定',
  pinned: '已固定',
}
