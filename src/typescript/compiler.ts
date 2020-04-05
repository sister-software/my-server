import { TranspileOptions } from 'typescript'

import { TypeScriptWorker, CompiledOutputFile, moduleResolutionToEnum, moduleKindToEnum } from './ts-worker'

export async function getTSConfig(storage: LocalForage): Promise<TranspileOptions> {
  // let cachedTsConfig = await storage.getItem<TranspileOptions | undefined>('tsConfig')

  // if (cachedTsConfig) {
  //   return cachedTsConfig
  // }

  const tsConfigResponse = await fetch('/tsconfig.json')

  if (!tsConfigResponse.ok || tsConfigResponse.status !== 200) {
    throw new Error(tsConfigResponse.statusText)
  }

  try {
    var tsConfigRaw = (await tsConfigResponse.json()) as TranspileOptions
  } catch (error) {
    console.error(error)

    throw new Error('Unable to parse tsconfig.json file')
  }

  const rawModuleResolution = (tsConfigRaw.compilerOptions!.moduleResolution as unknown) as string
  const rawModuleKind = (tsConfigRaw.compilerOptions!.module as unknown) as string

  const moduleResolution =
    moduleResolutionToEnum[(rawModuleResolution as unknown) as keyof typeof moduleResolutionToEnum] ||
    moduleResolutionToEnum.Node

  const module = moduleKindToEnum[(rawModuleKind as unknown) as keyof typeof moduleKindToEnum]

  const tsConfig: TranspileOptions = {
    ...tsConfigRaw,
    compilerOptions: {
      ...tsConfigRaw.compilerOptions,
      moduleResolution,
      module
    }
  }

  await storage.setItem<TranspileOptions>('tsConfig', tsConfig)

  return tsConfig
}

export default async function compileTypescript(
  moduleRequest: Request,
  tsConfig: TranspileOptions
): Promise<CompiledOutputFile> {
  let cachedTypeScriptWorker: undefined | TypeScriptWorker

  if (!cachedTypeScriptWorker) {
    cachedTypeScriptWorker = new TypeScriptWorker({
      compilerOptions: tsConfig.compilerOptions!
    })
  }

  await cachedTypeScriptWorker.addLibFiles()
  await cachedTypeScriptWorker.addRootFile(moduleRequest.url)

  const result = await cachedTypeScriptWorker.getEmitOutput(moduleRequest.url)

  return result
}
