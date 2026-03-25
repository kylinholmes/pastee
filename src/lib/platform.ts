// src/lib/platform.ts
import { platform } from '@tauri-apps/plugin-os'

export type Layout = 'vertical' | 'horizontal'

let _layout: Layout | null = null

export async function detectLayout(): Promise<Layout> {
  if (_layout) return _layout
  try {
    const os = await platform()
    _layout = os === 'macos' ? 'horizontal' : 'vertical'
  } catch {
    _layout = 'vertical'
  }
  return _layout
}

export function resetLayoutCache() {
  _layout = null
}
