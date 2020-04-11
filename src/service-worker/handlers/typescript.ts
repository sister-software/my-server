declare var self: ServiceWorkerGlobalScopeExtended

import { getTSConfig } from './typescript/compiler'
import { serviceWorkerError, serviceWorkerInfo, serviceWorkerWarn } from '../utils/log'
import { diagnosticToPrintedString } from './typescript/diagnostics'
import { TranspileOptions } from 'typescript'
import { TypeScriptWorker } from './typescript/ts-worker'
import { SKIP_COMPILE_HEADER, DEFAULT_CACHE_MATCH_OPTIONS, DEFAULT_SKIP_CACHE_INIT } from '../../server/utils/requests'

interface FileNameToResponse {
  [fileName: string]: Response | undefined
}

function createSimpleResponse(blobPart: BlobPart, type = 'application/javascript', init: ResponseInit = {}): Response {
  return new Response(new Blob([blobPart], { type }), {
    status: 200,
    ...init
  })
}

export default async function typeScriptHandler(request: Request): Promise<Response> {
  const tsConfig = await getTSConfig()
  const typeScriptWorker = new TypeScriptWorker({
    compilerOptions: tsConfig.compilerOptions!
  })
  const responseCache = await typeScriptWorker.fetchResponseCache()

  const rawResponse = await fetch(`${request.url}?${SKIP_COMPILE_HEADER}=true`, DEFAULT_SKIP_CACHE_INIT)

  if (!rawResponse.ok || rawResponse.status !== 200) {
    return rawResponse
  }

  const lastModifiedHeader = rawResponse.headers.get('last-modified')
  const lastModifiedDate = lastModifiedHeader ? new Date(lastModifiedHeader) : null

  if (lastModifiedDate) {
    const cachedResponse = await responseCache.match(request.url, DEFAULT_CACHE_MATCH_OPTIONS)
    const cachedLastModifiedHeader = cachedResponse ? cachedResponse.headers.get('last-modified') : null
    const cachedLastModifiedDate = cachedLastModifiedHeader ? new Date(cachedLastModifiedHeader) : null

    if (cachedResponse && cachedLastModifiedDate && lastModifiedDate.getTime() <= cachedLastModifiedDate.getTime()) {
      // We've encountered this file before and it's unchanged.
      return cachedResponse
    }
  }

  try {
    await typeScriptWorker.addLibFiles()
    await typeScriptWorker.addRootFile(request.url, request.url, rawResponse)

    var { files, diagnostics: combinedDiagnostics } = await typeScriptWorker.getEmitOutputs()
  } catch (error) {
    serviceWorkerError(error)
    return createSimpleResponse(error, 'text/plain', { status: 500 })
  }

  const fileNameToResponse: FileNameToResponse = {}

  for (let emitOutput of Object.values(files)) {
    const { fileName, diagnostics, compiledResult, rawResponse } = emitOutput!
    const lastModifiedHeader = rawResponse.headers.get('last-modified')
    const lastModifiedDate = lastModifiedHeader ? new Date(lastModifiedHeader) : null

    if (!lastModifiedDate) {
      // serviceWorkerWarn(`Request response for “${rawResponse.url}” doesn't include an last-modified header to cache.`)
      await responseCache.delete(rawResponse.url)
    }

    combinedDiagnostics.push(...diagnostics)

    if (compiledResult) {
      const compiledResultResponse = createSimpleResponse(compiledResult, 'application/javascript', {
        headers: {
          'last-modified': lastModifiedDate ? lastModifiedDate.toUTCString() : ''
        }
      })

      fileNameToResponse[fileName] = compiledResultResponse

      const rawResponseUrl = new URL(rawResponse.url)

      await responseCache.put(rawResponseUrl.pathname, compiledResultResponse.clone())
    }
  }

  const diagnosticsOutput = combinedDiagnostics
    .flatMap(({ type, diagnostics }) => {
      return diagnostics.map(diagnostic => diagnosticToPrintedString(diagnostic, type))
    })
    .join('\n')

  if (diagnosticsOutput) {
    serviceWorkerInfo('TypeScript:\n', diagnosticsOutput)
  }

  const primaryResponse = fileNameToResponse[request.url]

  if (primaryResponse) return primaryResponse

  if (diagnosticsOutput) {
    return createSimpleResponse(diagnosticsOutput, 'text/plain', { status: 500 })
  }

  return createSimpleResponse(`File “${request.url}” not found in compiled output`, 'text/plain', { status: 500 })
}
