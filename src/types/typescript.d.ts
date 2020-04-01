import * as ts from 'typescript'

declare module 'typescript' {
  declare namespace ts {
    function resolvePath(...paths: string[]): string
  }
  export = ts
}
