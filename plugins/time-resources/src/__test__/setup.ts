// jsdom ships no matchMedia, and the ui index pulls in players and layout helpers that use it.
if (typeof window.matchMedia !== 'function') {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false
  })) as unknown as typeof window.matchMedia
}

// jsdom has no ResizeObserver; the calendar grid observes its own width.
if ((globalThis as any).ResizeObserver === undefined) {
  ;(globalThis as any).ResizeObserver = class {
    observe = (): void => {}
    unobserve = (): void => {}
    disconnect = (): void => {}
  }
}

// Imported dynamically: a static import is hoisted above the polyfills, and the ui index pulls
// in plyr, which reads matchMedia at module scope.
const ui: any = await import('@hcengineering/ui')

// The app fills both stores on boot; without that `$themeStore.fontSize` throws and rem-to-px
// maths collapses to zero.
ui.themeStore.set({ fontSize: 16, dark: false, language: 'en', variant: 0, emoji: '', accent: 'default' })
ui.deviceOptionsStore.update((it: any) => ({ ...it, fontSize: 16 }))

export {}
