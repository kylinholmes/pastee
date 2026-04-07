// src/lib/hotkey.ts

/** Convert a KeyboardEvent into a Tauri-compatible hotkey string.
 *  e.g. Ctrl+Shift+V  →  "CommandOrControl+Shift+V"
 *  Returns null if only modifier keys are pressed (no main key yet).
 */
export function eventToTauriHotkey(e: KeyboardEvent): string | null {
  const modifiers: string[] = []
  if (e.metaKey || e.ctrlKey) modifiers.push('CommandOrControl')
  if (e.altKey) modifiers.push('Alt')
  if (e.shiftKey) modifiers.push('Shift')

  const MODIFIER_KEYS = new Set(['Control', 'Meta', 'Alt', 'Shift'])
  if (MODIFIER_KEYS.has(e.key)) return null // only modifiers pressed, not ready

  const key = normalizeKey(e.key)
  return [...modifiers, key].join('+')
}

/** Convert a Tauri hotkey string to a human-readable display string,
 *  adapting for macOS vs Windows/Linux.
 *  e.g. "CommandOrControl+Shift+V" on macOS → "⌘ Cmd + ⇧ Shift + V"
 *       "CommandOrControl+Shift+V" on Win   → "Ctrl + ⇧ Shift + V"
 */
export function tauriHotkeyToDisplay(hotkey: string, isMac: boolean): string {
  return hotkey
    .split('+')
    .map(part => {
      switch (part) {
        case 'CommandOrControl': return isMac ? '⌘ Cmd' : 'Ctrl'
        case 'Alt':              return isMac ? '⌥ Option' : 'Alt'
        case 'Shift':            return '⇧ Shift'
        case 'Super':            return isMac ? '⌘ Cmd' : 'Win'
        default:                 return part.toUpperCase()
      }
    })
    .join(' + ')
}

/** Split a Tauri hotkey string into individual badge tokens for display.
 *  e.g. "CommandOrControl+Shift+V" on macOS → ["⌘ Cmd", "⇧ Shift", "V"]
 */
export function tauriHotkeyToBadges(hotkey: string, isMac: boolean): string[] {
  return hotkey.split('+').map(part => {
    switch (part) {
      case 'CommandOrControl': return isMac ? '⌘ Cmd' : 'Ctrl'
      case 'Alt':              return isMac ? '⌥ Option' : 'Alt'
      case 'Shift':            return '⇧ Shift'
      case 'Super':            return isMac ? '⌘ Cmd' : 'Win'
      default:                 return part.toUpperCase()
    }
  })
}

function normalizeKey(key: string): string {
  const MAP: Record<string, string> = {
    ' ': 'Space',
    'ArrowUp': 'Up',
    'ArrowDown': 'Down',
    'ArrowLeft': 'Left',
    'ArrowRight': 'Right',
    'Escape': 'Escape',
    'Enter': 'Return',
    'Backspace': 'Backspace',
    'Delete': 'Delete',
    'Tab': 'Tab',
  }
  return MAP[key] ?? (key.length === 1 ? key.toUpperCase() : key)
}
