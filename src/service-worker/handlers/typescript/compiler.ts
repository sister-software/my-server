declare var self: ServiceWorkerGlobalScopeExtended

import { TranspileOptions } from 'typescript'
import { moduleResolutionToEnum, moduleKindToEnum, tsTargetToEnum } from './ts-worker'
import { SKIP_COMPILE_HEADER } from '../../../server/utils/requests'

type TSTargetKey = keyof typeof tsTargetToEnum
type ModuleResolutionKey = keyof typeof moduleResolutionToEnum
type ModuleKindKey = keyof typeof moduleKindToEnum

export async function getTSConfig(): Promise<TranspileOptions> {
  const tsConfigResponse = await fetch(`/tsconfig.json?${SKIP_COMPILE_HEADER}=true`)

  if (!tsConfigResponse.ok || tsConfigResponse.status !== 200) {
    throw new Error(tsConfigResponse.statusText)
  }

  try {
    var tsConfigRaw = (await tsConfigResponse.json()) as TranspileOptions
  } catch (error) {
    console.error(error)

    throw new Error('Unable to parse tsconfig.json file')
  }

  // -- Refine user's partial tsConfig

  // TODO: Potentially add more default properties.
  const compilerOptions = tsConfigRaw.compilerOptions!

  // Users provide optional string aliases to several `compilerOptions`.
  // We'll need to map those to TypeScript's expected enums.

  const rawTarget = compilerOptions.target as unknown
  compilerOptions.target = tsTargetToEnum[rawTarget as TSTargetKey] || tsTargetToEnum.ESNext

  const rawModuleResolution = compilerOptions.moduleResolution as unknown

  compilerOptions.moduleResolution =
    moduleResolutionToEnum[rawModuleResolution as ModuleResolutionKey] || moduleResolutionToEnum.Node

  const rawModuleKind = compilerOptions.module as unknown
  compilerOptions.module = moduleKindToEnum[rawModuleKind as ModuleKindKey] || moduleKindToEnum.ESNext

  const tsConfig: TranspileOptions = {
    ...tsConfigRaw,
    compilerOptions
  }

  await self.localForge.setItem<TranspileOptions>('tsConfig', tsConfig)

  return tsConfig
}
