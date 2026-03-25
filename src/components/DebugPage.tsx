// Used for development testing — not shown in production UI
import { useEffect, useState, useMemo } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { useClipStore } from '../store/clipStore'
import { useQueueStore } from '../store/queueStore'

const TYPES = ['Text', 'Html', 'Color', 'Image', 'Files'] as const

export default function DebugPage() {
  const {
    allClips, searchResults,
    searchQuery, filterType, offset, limit, totalCount,
    setSearchQuery, setFilterType, setOffset,
    fetchAllClips, fetchTotalCount, handleDelete, handlePin,
    initListener, thumbnailCache,
  } = useClipStore()
  const { onItemAdded } = useQueueStore()
  const groups = useQueueStore(s => s.groups)
  const [keepWindowOpen, setKeepWindowOpen] = useState(false)

  const list = useMemo(() => {
    let base = searchQuery.trim() ? searchResults : allClips
    if (filterType) base = base.filter(item => item.content_type === filterType)
    return base
  }, [allClips, searchResults, searchQuery, filterType])

  const visibleGroups = useMemo(() =>
    groups.filter(g => g.itemIds.length >= 2),
    [groups]
  )

  const hasLoadingImages = list.some(item => item.loading)

  useEffect(() => {
    fetchAllClips()
    fetchTotalCount()
  }, [])

  useEffect(() => {
    const cleanup = initListener((id, ts) => onItemAdded(id, ts))
    return () => { cleanup.then(fn => fn()) }
  }, [])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') invoke('toggle_window').catch(() => {})
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  const handleToggleKeepOpen = async (val: boolean) => {
    setKeepWindowOpen(val)
    await invoke('set_keep_window_open', { keep: val })
  }

  const handleClearUnpinned = async () => {
    const deleted = await invoke<number>('clear_unpinned_clips')
    await fetchAllClips()
    await fetchTotalCount()
    console.info(`Cleared ${deleted} unpinned clips`)
  }

  return (
    <div className="flex flex-col h-screen bg-[#1a1a1a] text-[#e2e8f0] text-sm font-mono">
      {/* Search + controls */}
      <div className="flex items-center gap-2 p-2 border-b border-[#2a2a2a]">
        <input
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          placeholder="搜索..."
          className="flex-1 bg-[#111] border border-[#333] rounded px-2 py-1 text-xs text-[#e2e8f0] outline-none placeholder:text-[#475569]"
        />
        <button onClick={handleClearUnpinned} className="px-2 py-1 text-xs bg-red-900/40 text-red-400 border border-red-400/30 rounded">清空</button>
        <label className="flex items-center gap-1 text-xs text-[#94a3b8] cursor-pointer">
          <input type="checkbox" checked={keepWindowOpen} onChange={e => handleToggleKeepOpen(e.target.checked)} />
          锁定
        </label>
      </div>

      {/* Type filter */}
      <div className="flex gap-1 px-2 py-1.5 border-b border-[#2a2a2a] overflow-x-auto">
        {['', ...TYPES].map(t => (
          <button key={t} onClick={() => setFilterType(t as any)}
            className={`px-2 py-0.5 text-xs rounded ${filterType === t ? 'bg-[#6366f1] text-white' : 'text-[#94a3b8] hover:bg-[#222]'}`}>
            {t || '全部'}
          </button>
        ))}
      </div>

      {/* Queue groups debug */}
      {visibleGroups.length > 0 && (
        <div className="px-2 py-1 border-b border-[#2a2a2a] bg-amber-900/20">
          <p className="text-[10px] text-amber-400">队列组: {visibleGroups.length} 个</p>
          {visibleGroups.map(g => (
            <p key={g.id} className="text-[9px] text-amber-300/70">  {g.id}: [{g.itemIds.join(', ')}]</p>
          ))}
        </div>
      )}

      {/* List */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {list.length === 0 ? (
          <p className="text-[#475569] text-xs py-4 text-center">暂无数据</p>
        ) : list.map(item => (
          <div key={item.id} className={`border rounded p-2 text-xs ${item.is_pinned ? 'border-amber-400/40 bg-amber-900/10' : 'border-[#2a2a2a] bg-[#111]'}`}>
            <div className="flex justify-between items-start mb-1">
              <div className="flex items-center gap-2">
                <span className="text-[#475569]">#{item.id}</span>
                <span className="text-[#6366f1]">{item.content_type}</span>
                {item.is_pinned && <span className="text-amber-400 text-[10px]">📌</span>}
                {item.loading && <span className="text-[#475569] animate-pulse">⏳</span>}
              </div>
              <span className="text-[#475569] text-[10px]">{new Date(item.created_at / 1000).toLocaleString()}</span>
            </div>
            {item.content_type === 'Image' && thumbnailCache.get(item.id) ? (
              <img src={thumbnailCache.get(item.id)} alt="" className="h-12 w-20 object-cover rounded mb-1" />
            ) : item.content_type === 'Color' ? (
              <div className="flex items-center gap-2 mb-1">
                <div className="w-5 h-5 rounded-full border border-[#333]" style={{ backgroundColor: item.preview }} />
                <span className="text-[#94a3b8]">{item.preview}</span>
              </div>
            ) : (
              <p className="text-[#94a3b8] truncate mb-1">{item.preview}</p>
            )}
            <div className="flex gap-1">
              <button onClick={() => handlePin(item.id)} className="px-1.5 py-0.5 text-[10px] border border-[#333] rounded text-[#94a3b8] hover:text-white">
                {item.is_pinned ? '取消' : '固定'}
              </button>
              <button onClick={() => handleDelete(item.id)} className="px-1.5 py-0.5 text-[10px] bg-red-900/30 text-red-400 rounded">删除</button>
            </div>
          </div>
        ))}
      </div>

      {/* Status bar */}
      <div className="flex justify-between items-center px-2 py-1 border-t border-[#2a2a2a] bg-[#111] text-[10px] text-[#475569]">
        <span>Esc关闭 | Ctrl+Shift+V打开</span>
        <div className="flex items-center gap-2">
          {!searchQuery && (
            <div className="flex gap-1">
              <button onClick={() => setOffset(Math.max(0, offset - limit))} disabled={offset === 0} className="px-1 disabled:opacity-30">◀</button>
              <span>{offset}/{totalCount}</span>
              <button onClick={() => setOffset(offset + limit)} className="px-1">▶</button>
            </div>
          )}
          <div className="flex items-center gap-1">
            <div className={`w-2 h-2 rounded-full ${hasLoadingImages ? 'bg-amber-400' : 'bg-green-400'}`} />
            <span>{totalCount} 条</span>
          </div>
        </div>
      </div>
    </div>
  )
}
