import { BrowserWindow, NativeImage } from 'electron'

/**
 * Обёртка над BrowserWindow для electron-windows-badge.
 *
 * Плагин вызывает setOverlayIcon на 'show'/'close' без проверки isDestroyed —
 * это даёт "Cannot read properties of null (reading 'setOverlayIcon')".
 *
 * Proxy перехватывает setOverlayIcon и делает no-op, если окно destroyed.
 * Всё остальное идёт напрямую в реальное окно.
 */
export function createSafeWindow (window: BrowserWindow): BrowserWindow {
  return new Proxy(window, {
    get (target, prop, receiver) {
      if (prop === 'setOverlayIcon') {
        return (icon: NativeImage | null, description: string): void => {
          if (!target.isDestroyed()) {
            target.setOverlayIcon(icon, description)
          }
        }
      }
      const value = Reflect.get(target, prop, receiver)
      return typeof value === 'function' ? value.bind(target) : value
    }
  }) as BrowserWindow
}
