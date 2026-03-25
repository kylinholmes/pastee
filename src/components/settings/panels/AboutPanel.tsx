import { getVersion } from '@tauri-apps/api/app'
import { useEffect, useState } from 'react'

export function AboutPanel() {
  const [version, setVersion] = useState('...')
  useEffect(() => { getVersion().then(setVersion) }, [])
  return (
    <div className="flex flex-col gap-3 p-4">
      <h2 className="text-xs uppercase tracking-wider text-[var(--text-muted)] mb-1">关于</h2>
      <div className="py-2">
        <p className="text-xs text-[var(--text-primary)]">Pastee</p>
        <p className="text-[10px] text-[var(--text-muted)] mt-1">版本 {version}</p>
        <p className="text-[10px] text-[var(--text-muted)] mt-0.5">本地优先的剪贴板管理器</p>
      </div>
    </div>
  )
}
