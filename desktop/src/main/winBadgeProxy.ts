import { BrowserWindow, NativeImage } from 'electron'

/**
 * Обёртка над BrowserWindow для electron-windows-badge.
 *
 * Плагин держит ссылку на окно и обращается к нему уже после уничтожения: для отрисовки бейджа он
 * вызывает win.webContents.executeJavaScript, а это бросает "Object has been destroyed" прямо в
 * ipcMain-обработчике — падает весь главный процесс. Proxy здесь не работает: нативные геттеры
 * Electron не принимают в качестве this ничего, кроме самого объекта.
 *
 * Поэтому отдаём узкий объект ровно с тем, что плагин использует, и каждую операцию проверяем
 * по живому окну.
 */
interface BadgeWindow {
  id: number
  isDestroyed: () => boolean
  on: (event: 'closed' | 'show', listener: () => void) => void
  setOverlayIcon: (icon: NativeImage | null, description: string) => void
  webContents: { executeJavaScript: (code: string) => Promise<unknown> }
}

export function createSafeWindow (window: BrowserWindow): BadgeWindow {
  const isAlive = (): boolean => !window.isDestroyed() && !window.webContents.isDestroyed()

  return {
    id: window.id,
    isDestroyed: () => !isAlive(),
    on: (event, listener) => {
      if (!isAlive()) return

      if (event === 'closed') {
        window.on('closed', listener)
      } else {
        window.on('show', listener)
      }
    },
    setOverlayIcon: (icon, description) => {
      if (isAlive()) window.setOverlayIcon(icon, description)
    },
    webContents: {
      executeJavaScript: async (code) =>
        isAlive() ? await window.webContents.executeJavaScript(code) : undefined
    }
  }
}
