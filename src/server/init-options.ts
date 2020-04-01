export interface MyServerInitOptions {
  /** Path to where your app initializes. */
  entry: string
  /** Scope limiting which files in your source directory should be compiled. */
  scope: string
  workerPath: string
}

export const createDefaultInitOptions = (): MyServerInitOptions => {
  return {
    entry: 'main.ts',
    scope: '/',
    workerPath: '/service-worker.js'
  }
}
