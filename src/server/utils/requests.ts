const { seal, freeze } = Object

export const DEFAULT_CACHE_MATCH_OPTIONS: CacheQueryOptions = {
  ignoreSearch: true
}

export const SKIP_COMPILE_HEADER = 'X-My-Server-Skip-Compile'

export const DEFAULT_SKIP_CACHE_INIT: RequestInit = seal(
  freeze({
    cache: 'no-cache',
    mode: 'cors'
    // headers: {
    //   'Cache-Control': 'no-cache'
    // }
  })
)

// Unfortunately foreign fetch in service workers is poorly supported
// and possibly gone forever. Check for the skip compile header in the URL instead.

// export const DEFAULT_SKIP_COMPILE_INIT: RequestInit = seal(
//   freeze({
//     mode: 'cors',
//     headers: {
//       [SKIP_COMPILE_HEADER]: 'true'
//     }
//   })
// )
