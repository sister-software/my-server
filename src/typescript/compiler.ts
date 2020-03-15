import {transpileModule, TranspileOptions, TranspileOutput} from 'typescript'

export default async function compileTypescript(
  moduleRequest: Request,
  tsConfig: TranspileOptions
): Promise<TranspileOutput> {
  const moduleContent = await moduleRequest.text()

  const compiledOutput = transpileModule(moduleContent, tsConfig)

  return compiledOutput
}
