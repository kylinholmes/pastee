// src/store/settingsStore.ts
import { create } from 'zustand'
import { LazyStore } from '@tauri-apps/plugin-store'

const store = new LazyStore('settings.json')

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
  activationHotkey: 'Ctrl+Shift+V',
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
    const entries = await Promise.all(
      (Object.keys(DEFAULTS) as (keyof Settings)[]).map(async (key) => {
        const val = await store.get<Settings[typeof key]>(key)
        return [key, val ?? DEFAULTS[key]] as const
      })
    )
    set({ ...Object.fromEntries(entries), loaded: true } as any)
  },

  update: async (key, value) => {
    set({ [key]: value } as any)
    await store.set(key, value)
    await store.save()
  },
}))
