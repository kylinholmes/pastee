import { useState } from 'react'
import { SettingsSidebar, SettingsSection } from './SettingsSidebar'
import { GeneralPanel } from './panels/GeneralPanel'
import { ShortcutsPanel } from './panels/ShortcutsPanel'
import { OcrPanel } from './panels/OcrPanel'
import { AboutPanel } from './panels/AboutPanel'

const PANELS: Record<SettingsSection, React.ComponentType> = {
  general:   GeneralPanel,
  shortcuts: ShortcutsPanel,
  ocr:       OcrPanel,
  about:     AboutPanel,
}

interface Props {
  onClose: () => void
}

export function SettingsWindow({ onClose }: Props) {
  const [section, setSection] = useState<SettingsSection>('general')
  const Panel = PANELS[section]

  return (
    <div className="flex flex-col w-full h-screen bg-[var(--bg-primary)]">
      <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)]">
        <span className="text-sm font-medium text-[var(--text-primary)]">设置</span>
        <button
          onClick={onClose}
          className="text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
        >
          ✕
        </button>
      </div>
      <div className="flex flex-1 min-h-0">
        <SettingsSidebar active={section} onChange={setSection} />
        <div className="flex-1 overflow-y-auto">
          <Panel />
        </div>
      </div>
    </div>
  )
}
