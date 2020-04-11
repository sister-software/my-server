const serviceWorkerBaseMessage = '<my-server /> — Service Worker:'

export const serviceWorkerInfo = console.info.bind(console, serviceWorkerBaseMessage)
export const serviceWorkerDebug = console.debug.bind(console, serviceWorkerBaseMessage)
export const serviceWorkerError = console.error.bind(console, serviceWorkerBaseMessage)
export const serviceWorkerWarn = console.warn.bind(console, serviceWorkerBaseMessage)
