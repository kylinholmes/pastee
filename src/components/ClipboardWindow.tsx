// src/components/ClipboardWindow.tsx
import { useEffect, useRef, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow'
import { motion, AnimatePresence } from 'motion/react'
import { Command } from 'cmdk'
import { useClipStore } from '../store/clipStore'
import { useQueueStore } from '../store/queueStore'
import { useSettingsStore } from '../store/settingsStore'
import { detectLayout, Layout } from '../lib/platform'
import { TypeFilterBar } from './TypeFilterBar'
import { TypeFilterBarInline } from './TypeFilterBar'
import { ClipList } from './vertical/ClipList'
import { ClipBoard } from './horizontal/ClipBoard'
import { hideWindow } from '../lib/tauri'

interface Props {}

export function ClipboardWindow({}: Props) {
  const { fetchAllClips, fetchTotalCount, initListener, setSearchQuery, searchQuery, totalCount } = useClipStore()
  const { onItemAdded } = useQueueStore()
  const { layoutOverride, loaded: settingsLoaded, load: loadSettings } = useSettingsStore()
  const [layout, setLayout] = useState<Layout>('vertical')

  // Resolve layout: user override takes precedence over OS detection
  useEffect(() => {
    if (!settingsLoaded) return
    if (layoutOverride !== 'auto') {
      setLayout(layoutOverride as Layout)
    } else {
      detectLayout().then(setLayout)
    }
  }, [layoutOverride, settingsLoaded])

  // Reload settings when changed from settings window
  useEffect(() => {
    const unlisten = listen('settings://changed', () => loadSettings())
    return () => { unlisten.then(fn => fn()) }
  }, [])

  // Init data + listeners
  useEffect(() => {
    fetchAllClips()
    fetchTotalCount()
    const cleanup = initListener((id, timestamp) => {
      onItemAdded(id, timestamp)
    })
    return () => { cleanup.then(fn => fn()) }
  }, [])

  const [shown, setShown] = useState(false)
  const closeReason = useRef<'hide'>('hide')

  useEffect(() => {
    const appWindow = getCurrentWebviewWindow()
    const unlisten = appWindow.onFocusChanged(({ payload: focused }) => {
      if (focused) setShown(true)
    })
    return () => { unlisten.then(fn => fn()) }
  }, [])

  // Escape closes window via animation then hide
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        closeReason.current = 'hide'
        setShown(false)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  const isHorizontal = layout === 'horizontal'

  return (
    <AnimatePresence onExitComplete={hideWindow}>
      {shown && (
        <motion.div
          className={[
            'flex flex-col bg-[var(--bg-primary)] overflow-hidden',
            isHorizontal ? 'w-screen h-[480px]' : 'w-full h-screen',
          ].join(' ')}
          initial={{ y: 40, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 40, opacity: 0, transition: { duration: 0.18, ease: 'easeIn' } }}
          transition={{ type: 'spring', damping: 28, stiffness: 260 }}
        >
          <Command className="flex flex-col h-full" shouldFilter={false}>
            {/* Search bar — horizontal: inline with type filter + settings */}
            <div className={[
              'flex items-center gap-2 px-3 border-b border-[var(--border-subtle)]',
              isHorizontal ? 'py-2' : 'py-2.5',
            ].join(' ')}>
              <span className="text-[var(--text-muted)] text-sm flex-shrink-0">⌕</span>
              <Command.Input
                value={searchQuery}
                onValueChange={setSearchQuery}
                placeholder="搜索剪贴板..."
                className="flex-1 bg-transparent text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none"
              />
              <span className="text-[10px] text-[var(--text-muted)] flex-shrink-0">{totalCount} 条</span>
              {isHorizontal && <TypeFilterBarInline />}
              {isHorizontal && (
                <button
                  onClick={() => invoke('open_settings_window')}
                  className="text-[10px] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors flex-shrink-0 ml-1"
                >
                  设置
                </button>
              )}
            </div>

            {/* Type filter — vertical only */}
            {!isHorizontal && <TypeFilterBar />}

            {/* Content */}
            <Command.List className={[
              'flex flex-1 min-h-0',
              isHorizontal ? 'flex-row' : 'flex-col',
            ].join(' ')}>
              {isHorizontal ? <ClipBoard /> : <ClipList />}
            </Command.List>

            {/* Footer */}
            {!isHorizontal && (
              <div className="flex items-center justify-between px-3 py-1.5 border-t border-[var(--border-subtle)]">
                <div className="flex gap-3">
                  <span className="text-[10px] text-[var(--text-muted)]">↵ 粘贴</span>
                  <span className="text-[10px] text-[var(--text-muted)]">P 固定</span>
                  <span className="text-[10px] text-[var(--text-muted)]">⌫ 删除</span>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => invoke('open_settings_window')}
                    className="text-[10px] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
                  >
                    设置
                  </button>
                  <span className="text-[10px] text-[var(--text-muted)]">Esc 关闭</span>
                </div>
              </div>
            )}
          </Command>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
