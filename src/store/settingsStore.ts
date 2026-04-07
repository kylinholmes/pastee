// src/store/settingsStore.ts
import { create } from 'zustand'
import { invoke } from '@tauri-apps/api/core'

export type LayoutOverride = 'auto' | 'vertical' | 'horizontal'
export type Theme = 'dark' | 'light' | 'system'

interface Settings {
  layoutOverride: LayoutOverride
  theme: Theme
  activationHotkey: string
  keepWindowOpen: boolean
  historyRetentionDays: number
  maxItemCount: number
  ocrEnabled: boolean
  ocrModelUrl: string
  ocrApiKey: string
}

const DEFAULTS: Settings = {
  layoutOverride: 'auto',
  theme: 'dark',
  activationHotkey: 'CommandOrControl+Shift+V',
  keepWindowOpen: false,
  historyRetentionDays: 30,
  maxItemCount: 500,
  ocrEnabled: false,
  ocrModelUrl: '',
  ocrApiKey: '',
}

interface SettingsStore extends Settings {
  loaded: boolean
  load: () => Promise<void>
  update: <K extends keyof Settings>(key: K, value: Settings[K]) => Promise<void>
}

export const useSettingsStore = create<SettingsStore>((set, get) => ({
  ...DEFAULTS,
  loaded: false,

  load: async () => {
    try {
      const saved = await invoke<Record<string, unknown>>('get_settings')
      const merged = (Object.fromEntries(
        (Object.keys(DEFAULTS) as (keyof Settings)[]).map(key => [
          key,
          saved[key] !== undefined ? saved[key] : DEFAULTS[key],
        ])
      ) as unknown) as Settings
      set({ ...merged, loaded: true })
      invoke('set_keep_window_open', { keep: merged.keepWindowOpen }).catch(() => {})
    } catch (e) {
      console.warn('Settings load failed, using defaults:', e)
      set({ loaded: true })
    }
  },

  update: async (key, value) => {
    set({ [key]: value } as any)
    try {
      const current = get()
      const toSave: Partial<Settings> = {}
      for (const k of Object.keys(DEFAULTS) as (keyof Settings)[]) {
        toSave[k] = current[k] as any
      }
      toSave[key] = value
      await invoke('save_settings', { settings: toSave })
    } catch (e) {
      console.warn('Settings save failed:', e)
    }
  },
}))
