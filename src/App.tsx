import { useEffect } from 'react'
import { useSettingsStore } from './store/settingsStore'
import { ClipboardWindow } from './components/ClipboardWindow'
import { SettingsWindow } from './components/settings/SettingsWindow'
import './App.css'

const isSettingsWindow = window.location.hash === '#/settings'

export default function App() {
  const { load, theme } = useSettingsStore()

  useEffect(() => { load() }, [])

  useEffect(() => {
    const root = document.documentElement
    root.classList.remove('theme-light', 'theme-dark')
    if (theme === 'light') root.classList.add('theme-light')
    else if (theme === 'dark') root.classList.add('theme-dark')
  }, [theme])

  if (isSettingsWindow) {
    return <SettingsWindow onClose={() => window.close()} />
  }

  return <ClipboardWindow />
}
