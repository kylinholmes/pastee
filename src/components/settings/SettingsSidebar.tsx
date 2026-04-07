export type SettingsSection = 'general' | 'shortcuts' | 'ocr' | 'about'

const NAV_ITEMS: { id: SettingsSection; label: string }[] = [
  { id: 'general',   label: '通用' },
  { id: 'shortcuts', label: '快捷键' },
  { id: 'ocr',       label: 'OCR' },
  { id: 'about',     label: '关于' },
]

interface Props {
  active: SettingsSection
  onChange: (s: SettingsSection) => void
}

export function SettingsSidebar({ active, onChange }: Props) {
  return (
    <nav className="w-28 bg-[var(--bg-secondary)] border-r border-[var(--border)] flex flex-col gap-0.5 p-2 flex-shrink-0">
      {NAV_ITEMS.map(({ id, label }) => (
        <button
          key={id}
          onClick={() => onChange(id)}
          className={[
            'text-left px-3 py-2 rounded-md text-xs transition-colors',
            active === id
              ? 'bg-[var(--bg-elevated)] text-[var(--text-primary)]'
              : 'text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)]',
          ].join(' ')}
        >
          {label}
        </button>
      ))}
    </nav>
  )
}
