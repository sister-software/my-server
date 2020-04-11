import typeScriptHandler from './handlers/typescript'
import { serviceWorkerDebug } from './utils/log'
import { defaultHandler, HandlerDeclaration } from './handlers'
import { SKIP_COMPILE_HEADER } from '../server/utils/requests'

const handlersDeclarations: HandlerDeclaration[] = [
  { pattern: /\.d\.ts$/, handler: defaultHandler },
  { pattern: /\.tsx?$/, handler: typeScriptHandler }
]

export default async function parseFetchEvent({ request }: FetchEvent): Promise<Response> {
  serviceWorkerDebug(request.url, request)

  if (request.method !== 'GET' || request.url.includes(SKIP_COMPILE_HEADER)) {
    return defaultHandler(request)
  }

  for (let { pattern, handler } of handlersDeclarations) {
    if (pattern.test(request.url)) {
      return handler(request)
    }
  }

  return defaultHandler(request)
}
