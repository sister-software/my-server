import { TranspileOptions } from 'typescript'

export type MyServerMessageEvent<T extends string, D = {}> = Omit<ExtendableMessageEvent, 'data'> & {
  data: undefined | ({ type: T } & D)
}

export type MyServerLoadTSConfigEvent = MyServerMessageEvent<
  'LOAD_TSCONFIG',
  {
    tsConfig: TranspileOptions
    src: string
    cacheName: string
  }
>
export type MyServerTSConfigLoadedEvent = MyServerMessageEvent<'TSCONFIG_LOADED', {}>

export type MyServerMessageEvents = MyServerLoadTSConfigEvent | MyServerTSConfigLoadedEvent
