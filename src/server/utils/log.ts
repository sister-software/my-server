const serverClientBaseMessage = '<my-server /> — Client:'

export const clientInfo = console.info.bind(console, serverClientBaseMessage)
export const clientDebug = console.debug.bind(console, serverClientBaseMessage)
export const clientError = console.error.bind(console, serverClientBaseMessage)
export const clientWarn = console.warn.bind(console, serverClientBaseMessage)
