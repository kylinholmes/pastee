// src/store/queueStore.ts
import { create } from 'zustand'

const QUEUE_WINDOW_MS = 3000

export interface QueueGroup {
  id: string           // group identifier
  itemIds: number[]    // clip IDs in order
  createdAt: number
  lastAddedAt: number
}

interface QueueStore {
  groups: QueueGroup[]
  onItemAdded: (clipId: number, timestamp: number) => void
  consumeItem: (groupId: string) => void
  dissolveGroup: (groupId: string) => void
  groupForItem: (clipId: number) => QueueGroup | undefined
}

export const useQueueStore = create<QueueStore>((set, get) => ({
  groups: [],

  onItemAdded: (clipId, timestamp) => {
    const { groups } = get()
    const now = timestamp

    const activeGroup = groups.find(
      g => now - g.lastAddedAt <= QUEUE_WINDOW_MS
    )

    if (activeGroup) {
      set({
        groups: groups.map(g =>
          g.id === activeGroup.id
            ? { ...g, itemIds: [...g.itemIds, clipId], lastAddedAt: now }
            : g
        )
      })
    } else {
      const newGroup: QueueGroup = {
        id: `q-${now}-${clipId}`,
        itemIds: [clipId],
        createdAt: now,
        lastAddedAt: now,
      }
      set({ groups: [...groups, newGroup] })
    }

    setTimeout(() => {
      const { groups: current } = get()
      set({
        groups: current.filter(g => {
          const isExpired = Date.now() - g.lastAddedAt > QUEUE_WINDOW_MS
          const isSingle = g.itemIds.length === 1
          return !(isExpired && isSingle)
        })
      })
    }, QUEUE_WINDOW_MS + 100)
  },

  consumeItem: (groupId) => {
    const { groups } = get()
    const group = groups.find(g => g.id === groupId)
    if (!group) return

    if (group.itemIds.length <= 1) {
      set({ groups: groups.filter(g => g.id !== groupId) })
    } else {
      set({
        groups: groups.map(g =>
          g.id === groupId
            ? { ...g, itemIds: g.itemIds.slice(1) }
            : g
        )
      })
    }
  },

  dissolveGroup: (groupId) => {
    set({ groups: get().groups.filter(g => g.id !== groupId) })
  },

  groupForItem: (clipId) => {
    return get().groups.find(g => g.itemIds.includes(clipId))
  },
}))

export const selectVisibleGroups = (state: QueueStore) =>
  state.groups.filter(g => g.itemIds.length >= 2)
