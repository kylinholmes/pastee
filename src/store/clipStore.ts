// src/store/clipStore.ts
import { create } from 'zustand'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'

export type ClipType = 'Text' | 'Image' | 'Html' | 'Files' | 'Color'
export type FilterValue = ClipType | 'link' | ''

export interface ClipItem {
  id: number
  content_type: ClipType
  preview: string
  created_at: number
  is_pinned: boolean
  tags: string[]
  source?: string
  link_title?: string
  link_domain?: string
  link_og_image?: string
  link_favicon?: string
  loading?: boolean
  temp_id?: number
}

interface ClipStore {
  allClips: ClipItem[]
  searchResults: ClipItem[]
  searchQuery: string
  filterType: FilterValue
  limit: number
  offset: number
  thumbnailCache: Map<number, string>
  totalCount: number

  setSearchQuery: (query: string) => void
  setFilterType: (type: FilterValue) => void
  setOffset: (offset: number) => void
  fetchAllClips: () => Promise<void>
  fetchTotalCount: () => Promise<void>
  handleSearch: (query: string) => Promise<void>
  handleDelete: (id: number) => Promise<void>
  handlePin: (id: number) => Promise<void>
  initListener: (onNewClip?: (id: number, timestamp: number) => void) => Promise<() => void>
}

export const useClipStore = create<ClipStore>((set, get) => ({
  allClips: [],
  searchResults: [],
  searchQuery: '',
  filterType: '',
  limit: 50,
  offset: 0,
  thumbnailCache: new Map(),
  totalCount: 0,

  setSearchQuery: (query) => {
    set({ searchQuery: query })
    get().handleSearch(query)
  },

  setFilterType: (type) => set({ filterType: type }),

  setOffset: (offset) => {
    set({ offset })
    get().fetchAllClips()
  },

  fetchAllClips: async () => {
    const { limit, offset, thumbnailCache } = get()
    const result = await invoke<ClipItem[]>('get_recent_clips', { limit, offset })
    set({ allClips: result })

    // Load thumbnails for Image items not yet cached
    const imageItems = result.filter(item => item.content_type === 'Image' && !thumbnailCache.has(item.id))
    if (imageItems.length > 0) {
      const cache = new Map(get().thumbnailCache)
      await Promise.all(imageItems.map(async (item) => {
        try {
          const b64 = await invoke<string | null>('get_thumbnail', { id: item.id })
          if (b64) cache.set(item.id, `data:image/webp;base64,${b64}`)
        } catch {}
      }))
      set({ thumbnailCache: cache })
    }
  },

  fetchTotalCount: async () => {
    const count = await invoke<number>('get_total_count')
    set({ totalCount: count })
  },

  handleSearch: async (query: string) => {
    if (!query.trim()) {
      set({ searchResults: [] })
      return
    }
    const result = await invoke<ClipItem[]>('search_clips', { query })
    set({ searchResults: result })
  },

  handleDelete: async (id: number) => {
    await invoke('delete_clip', { id })
    await get().fetchAllClips()
    const { searchQuery } = get()
    if (searchQuery) await get().handleSearch(searchQuery)
    const count = await invoke<number>('get_total_count')
    set({ totalCount: count })
  },

  handlePin: async (id: number) => {
    await invoke('toggle_pin', { id })
    await get().fetchAllClips()
    const { searchQuery } = get()
    if (searchQuery) await get().handleSearch(searchQuery)
  },

  initListener: async (onNewClip) => {
    const unlistenNormal = await listen<{ type: string; preview: string }>('clipboard://new-clip', (_event) => {
      const now = Date.now()
      get().fetchAllClips().then(() => {
        const newest = get().allClips[0]
        if (newest) onNewClip?.(newest.id, now)
      })
      set(s => ({ totalCount: s.totalCount + 1 }))
      const { searchQuery } = get()
      if (searchQuery) get().handleSearch(searchQuery)
    })

    const unlistenImagePending = await listen<{ temp_id: number }>('clipboard://image-pending', (event) => {
      const { temp_id } = event.payload
      const placeholder: ClipItem = {
        id: 0,
        temp_id,
        content_type: 'Image',
        preview: '',
        created_at: Date.now() * 1000,
        is_pinned: false,
        tags: [],
        loading: true,
      }
      set(s => ({ allClips: [placeholder, ...s.allClips] }))
    })

    const unlistenImageReady = await listen<{ temp_id: number; id: number; thumbnail?: string }>('clipboard://image-ready', (event) => {
      const { temp_id, id, thumbnail } = event.payload
      const { thumbnailCache } = get()
      if (thumbnail) {
        thumbnailCache.set(id, `data:image/webp;base64,${thumbnail}`)
      }
      set(s => ({
        allClips: s.allClips.filter(item => item.temp_id !== temp_id),
        thumbnailCache: new Map(thumbnailCache),
        totalCount: s.totalCount + 1,
      }))
      get().fetchAllClips()
    })

    const unlistenImageError = await listen<{ temp_id: number }>('clipboard://image-error', (event) => {
      const { temp_id } = event.payload
      set(s => ({ allClips: s.allClips.filter(item => item.temp_id !== temp_id) }))
    })

    const unlistenLinkMeta = await listen<{ id: number }>('clipboard://link-meta-ready', () => {
      get().fetchAllClips()
    })

    return () => {
      unlistenNormal()
      unlistenImagePending()
      unlistenImageReady()
      unlistenImageError()
      unlistenLinkMeta()
    }
  },
}))

