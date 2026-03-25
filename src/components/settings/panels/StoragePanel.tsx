import { invoke } from '@tauri-apps/api/core'
import { useClipStore } from '../../../store/clipStore'

export function StoragePanel() {
  const { fetchAllClips, fetchTotalCount, totalCount } = useClipStore()
  const handleClear = async () => {
    await invoke<number>('clear_unpinned_clips')
    await fetchAllClips()
    await fetchTotalCount()
  }
  return (
    <div className="flex flex-col gap-3 p-4">
      <h2 className="text-xs uppercase tracking-wider text-[var(--text-muted)] mb-1">存储</h2>
      <div className="flex items-center justify-between py-2">
        <div>
          <p className="text-xs text-[var(--text-primary)]">清理未固定记录</p>
          <p className="text-[10px] text-[var(--text-muted)] mt-0.5">当前共 {totalCount} 条</p>
        </div>
        <button
          onClick={handleClear}
          className="px-3 py-1 text-xs text-red-400 border border-red-400/30 rounded hover:bg-red-400/10 transition-colors"
        >
          立即清理
        </button>
      </div>
    </div>
  )
}
