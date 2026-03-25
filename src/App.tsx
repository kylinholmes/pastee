import { useEffect, useState } from 'react'
import { useSettingsStore } from './store/settingsStore'
import { ClipboardWindow } from './components/ClipboardWindow'
import { SettingsWindow } from './components/settings/SettingsWindow'
import './App.css'

export default function App() {
  const { load, theme } = useSettingsStore()
  const [showSettings, setShowSettings] = useState(false)

  useEffect(() => { load() }, [])

  useEffect(() => {
    const root = document.documentElement
    root.classList.remove('theme-light', 'theme-dark')
    if (theme === 'light') root.classList.add('theme-light')
    else if (theme === 'dark') root.classList.add('theme-dark')
  }, [theme])

  if (showSettings) {
    return <SettingsWindow onClose={() => setShowSettings(false)} />
  }

  return <ClipboardWindow onOpenSettings={() => setShowSettings(true)} />
}
