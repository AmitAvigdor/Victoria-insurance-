// Installed apps keep a stable viewport; normal browser tabs keep browser zoom.
export function installAppGestureGuard() {
  const displayMode = window.matchMedia('(display-mode: standalone)')
  const iosNavigator = navigator as Navigator & { standalone?: boolean }
  let active = false
  const stopGesture = (event: Event) => {
    if (event.cancelable) event.preventDefault()
  }
  const gestureEvents = ['gesturestart', 'gesturechange', 'gestureend'] as const
  function synchronize() {
    const standalone = displayMode.matches || iosNavigator.standalone === true
    document.documentElement.toggleAttribute('data-installed-app', standalone)
    if (active === standalone) return
    active = standalone
    for (const name of gestureEvents) {
      if (active) document.addEventListener(name, stopGesture, { passive: false })
      else document.removeEventListener(name, stopGesture)
    }
  }
  synchronize()
  displayMode.addEventListener('change', synchronize)
  return () => {
    displayMode.removeEventListener('change', synchronize)
    for (const name of gestureEvents) document.removeEventListener(name, stopGesture)
    document.documentElement.removeAttribute('data-installed-app')
  }
}
