import * as ts from 'typescript'
import { DiagnosticsResult, DiagnosticPair } from './diagnostics'
import { serviceWorkerWarn } from '../../utils/log'
import { SKIP_COMPILE_HEADER, DEFAULT_SKIP_CACHE_INIT } from '../../../server/utils/requests'

const noop = () => undefined

export interface IExtraLib {
  content: string
  version: number
}

export interface IExtraLibs {
  [path: string]: IExtraLib
}

const moduleNamePattern = /(\.\/)(.+)/

export const moduleResolutionToEnum = {
  node: ts.ModuleResolutionKind.NodeJs,
  Node: ts.ModuleResolutionKind.NodeJs,
  classic: ts.ModuleResolutionKind.Classic,
  Classic: ts.ModuleResolutionKind.Classic
}

export const moduleKindToEnum = {
  None: ts.ModuleKind.None,
  CommonJS: ts.ModuleKind.CommonJS,
  AMD: ts.ModuleKind.AMD,
  UMD: ts.ModuleKind.UMD,
  System: ts.ModuleKind.System,
  ES2015: ts.ModuleKind.ES2015,
  ES2020: ts.ModuleKind.ES2020,
  ESNext: ts.ModuleKind.ESNext
}

export const tsTargetToEnum = {
  ES3: ts.ScriptTarget.ES3,
  ES5: ts.ScriptTarget.ES5,
  ES2015: ts.ScriptTarget.ES2015,
  ES2016: ts.ScriptTarget.ES2016,
  ES2017: ts.ScriptTarget.ES2017,
  ES2018: ts.ScriptTarget.ES2018,
  ES2019: ts.ScriptTarget.ES2019,
  ES2020: ts.ScriptTarget.ES2020,
  ESNext: ts.ScriptTarget.ESNext,
  JSON: ts.ScriptTarget.JSON,
  Latest: ts.ScriptTarget.Latest
}

export interface RootFile {
  fileName: string
  uncompiledText: string
}

export interface RootFileModel extends RootFile {
  sourceFile: ts.SourceFile
  rawResponse: Response
  version: number
}

export interface FileNameToFileEntry {
  [fileName: string]: RootFileModel | undefined
}

export interface CompiledOutputFile {
  fileName: string
  rawResponse: Response
  uncompiledText: string
  compiledResult: string | null
  diagnostics: DiagnosticsResult[]
}

export interface CombinedEmitOutput {
  files: CompiledOutputByFileName
  // diagnosticsByType: {
  //   [T in DiagnosticType]: DiagnosticsResult
  // }
  diagnostics: DiagnosticsResult[]
}

export interface CompiledOutputByFileName {
  [fileName: string]: CompiledOutputFile | undefined
}

const scriptFileExtensionPattern = /\.ts|js$/g

export interface TypeScriptWorkerOptions {
  compilerOptions: ts.CompilerOptions
  extraLibs?: IExtraLibs
}

export const TYPESCRIPT_CACHE_NAME = 'MyServer:TypeScript:Compiled'

interface FileModelResolveQueue {
  [fileName: string]: undefined | Promise<RootFileModel>
}

interface FileModelResolves {
  [fileName: string]: FileModelResolveQueue
}

export class TypeScriptWorker implements ts.LanguageServiceHost {
  // --- Model Sync

  private _extraLibs: IExtraLibs = Object.create(null)
  private _languageService = ts.createLanguageService(this)
  private _compilerOptions: ts.CompilerOptions

  private _fileNameToResolveQueue: FileModelResolves = {}
  private _fileNameToFileModel: FileNameToFileEntry = {}
  private _printer = ts.createPrinter()
  private _responseCache?: Cache

  fetchResponseCache = async (): Promise<Cache> => {
    if (this._responseCache) return this._responseCache

    this._responseCache = await caches.open(TYPESCRIPT_CACHE_NAME)

    return this._responseCache
  }

  constructor(options: TypeScriptWorkerOptions) {
    // TODO: Consider deep cloning.
    this._compilerOptions = options.compilerOptions
    this._extraLibs = options.extraLibs || {}
  }

  importTransformer = (): ts.TransformerFactory<ts.SourceFile> => {
    return context => {
      const visit: ts.Visitor = node => {
        if (ts.isSourceFile(node) && node.libReferenceDirectives && node.libReferenceDirectives.length) {
          const containingFilePath = node.fileName
          const resolveQueue = this._fileNameToResolveQueue[containingFilePath]

          for (let referenceDirective of node.libReferenceDirectives) {
            resolveQueue[referenceDirective.fileName] = this.addLibFile(referenceDirective.fileName)
          }
        }

        if (ts.isImportDeclaration(node) && node.moduleSpecifier) {
          const sourceFile = node.getSourceFile()
          const containingFilePath = sourceFile.fileName
          const resolveQueue = this._fileNameToResolveQueue[containingFilePath]

          // Omit quotes
          const moduleName = node.moduleSpecifier.getText().slice(1, -1)

          // ts.getAnyExtensionFromPath(moduleName)
          const [, isRelative, fileName] = moduleName.match(moduleNamePattern) || []

          if (isRelative) {
            // Module name is relative, so we build an absolute path.
            const relativePath = containingFilePath.substring(0, containingFilePath.lastIndexOf('/') + 1)

            const absoluteModulePath = ts.resolvePath(relativePath, moduleName)
            const absoluteModulePathNormalized = fileName.match(scriptFileExtensionPattern)
              ? absoluteModulePath
              : absoluteModulePath + '.ts'

            if (
              !this._fileNameToFileModel[absoluteModulePathNormalized] &&
              !resolveQueue[absoluteModulePathNormalized]
            ) {
              resolveQueue[absoluteModulePath] = this.addRootFile(absoluteModulePathNormalized)
            }

            const newNode = ts.getMutableClone(node)

            newNode.moduleSpecifier = ts.createStringLiteral(absoluteModulePathNormalized)
            // Update sourcemap.
            ts.setSourceMapRange(newNode, ts.getSourceMapRange(node))

            return newNode
          }
        }

        return ts.visitEachChild(node, visit, context)
      }

      return node => ts.visitNode(node, visit)
    }
  }

  customTransformers = {
    before: [this.importTransformer()]
  }

  addLibFile = async (libraryName: string): Promise<RootFileModel> => {
    const libraryNameNormalized = libraryName.toLowerCase()
    const libraryNameWithExtension = `lib.${libraryNameNormalized}.d.ts`

    if (this._fileNameToFileModel[libraryNameNormalized]) {
      return this._fileNameToFileModel[libraryNameNormalized]!
    }

    const libraryPath = `http://localhost:8888/typescript/lib/${libraryNameWithExtension}`

    return this.addRootFile(libraryNameWithExtension, libraryPath)
  }

  addLibFiles = async (libraries = this._compilerOptions.lib): Promise<void> => {
    if (!libraries || !libraries.length) return

    for (let library of libraries) {
      await this.addLibFile(library)
    }
  }

  // TODO: Define overloads for just passing raw response.
  addRootFile = async (fileName: string, fileUrlPath = fileName, rawResponse?: Response): Promise<RootFileModel> => {
    if (this._fileNameToFileModel[fileName]) {
      return this._fileNameToFileModel[fileName]!
    }

    if (!this._fileNameToResolveQueue[fileName]) {
      this._fileNameToResolveQueue[fileName] = {}
    }

    if (!rawResponse) {
      rawResponse = await fetch(`${fileUrlPath}?${SKIP_COMPILE_HEADER}=true`, DEFAULT_SKIP_CACHE_INIT)

      if (!rawResponse.ok || rawResponse.status !== 200) {
        throw new Error(rawResponse.statusText)
      }
    }

    const fileContent = await rawResponse.text()

    const sourceFile = ts.createSourceFile(fileName, fileContent, this._compilerOptions.target!, true)
    const transformationResult = ts.transform(sourceFile, this.customTransformers.before, this._compilerOptions)

    const rootFileModel: RootFileModel = {
      fileName,
      uncompiledText: this._printer.printFile(transformationResult.transformed[0]),
      rawResponse,
      sourceFile,
      version: 1
    }

    this._fileNameToFileModel[fileName] = rootFileModel

    const resolveQueue = this._fileNameToResolveQueue[fileName]
    const resolveQueueFileNames = Object.keys(resolveQueue)
    const resolveQueuePromises = resolveQueueFileNames.map(fileName => resolveQueue[fileName]!)

    if (resolveQueuePromises.length) {
      await Promise.all(resolveQueuePromises)

      resolveQueueFileNames.forEach(fileName => delete resolveQueue[fileName])
    }

    return rootFileModel
  }

  // --- language service host ---------------

  fileExists = (fileName: string): boolean => {
    return !!this._fileNameToFileModel[fileName]
  }

  readFile = (fileName: string): string | undefined => {
    const fileModel = this._fileNameToFileModel[fileName]

    return fileModel ? fileModel.uncompiledText : undefined
  }

  getSourceFile = (
    fileName: string,
    languageVersion: ts.ScriptTarget,
    onError?: (message: string) => void
  ): ts.SourceFile | undefined => {
    const fileModel = this._fileNameToFileModel[fileName]

    if (fileModel) {
      return fileModel.sourceFile
    } else if (onError) {
      onError(`File “${fileName}” is missing`)
    }
  }

  resolveModuleNames = (moduleNames: string[], containingFile: string): Array<ts.ResolvedModule | undefined> => {
    return moduleNames.map(moduleName => {
      let result = ts.resolveModuleName(moduleName, containingFile, this._compilerOptions, {
        fileExists: this.fileExists,
        readFile: this.readFile
      })

      return result.resolvedModule ? result.resolvedModule : undefined
    })
  }

  getCompilationSettings(): ts.CompilerOptions {
    return this._compilerOptions
  }

  getScriptFileNames(): string[] {
    const fileNames = Object.keys(this._fileNameToFileModel)

    return fileNames.concat(Object.keys(this._extraLibs))
  }

  private _getModel(fileName: string): RootFileModel | null {
    const model = this._fileNameToFileModel[fileName]

    return model || null
  }

  getScriptVersion(fileName: string): string {
    let model = this._getModel(fileName)

    if (model) {
      return model.version.toString()
    } else if (fileName in this._extraLibs) {
      return String(this._extraLibs[fileName].version)
    }
    return ''
  }

  async getScriptText(fileName: string): Promise<string | undefined> {
    const scriptText = this._getScriptText(fileName)

    if (scriptText) return scriptText
  }

  _getScriptText(fileName: string): string | undefined {
    let model = this._getModel(fileName)

    if (model) {
      return model.uncompiledText
    } else if (fileName in this._extraLibs) {
      return this._extraLibs[fileName].content
    }
  }

  getScriptSnapshot(fileName: string): ts.IScriptSnapshot | undefined {
    const text = this._getScriptText(fileName)
    if (!text) {
      return
    }

    return {
      getText: (start, end) => text.substring(start, end),
      getLength: () => text.length,
      getChangeRange: noop
    }
  }

  getScriptKind?(fileName: string): ts.ScriptKind {
    const suffix = fileName.substr(fileName.lastIndexOf('.') + 1)
    switch (suffix) {
      case 'ts':
        return ts.ScriptKind.TS
      case 'tsx':
        return ts.ScriptKind.TSX
      case 'js':
        return ts.ScriptKind.JS
      case 'jsx':
        return ts.ScriptKind.JSX
      default:
        return this.getCompilationSettings().allowJs ? ts.ScriptKind.JS : ts.ScriptKind.TS
    }
  }

  getCurrentDirectory(): string {
    return ''
  }

  getDefaultLibFileName() {
    // TODO: this may be unnecessary if we specify a default lib for the user.
    return 'lib.d.ts'
  }

  // --- language features

  private static clearFiles(diagnostics: ts.Diagnostic[]): ts.Diagnostic[] {
    // Clear the `file` field, which cannot be JSON'yfied because it
    // contains cyclic data structures.

    diagnostics.forEach(diag => {
      diag.file = undefined

      const related = diag.relatedInformation

      if (related) {
        related.forEach(diag2 => (diag2.file = undefined))
      }
    })

    return diagnostics
  }

  getCompilerOptionsDiagnostics = async (): Promise<ts.Diagnostic[]> => {
    return this._languageService.getCompilerOptionsDiagnostics()
  }

  getSyntacticDiagnostics = async (fileName: string): Promise<ts.Diagnostic[]> => {
    return this._languageService.getSyntacticDiagnostics(fileName)
  }

  getSemanticDiagnostics = async (fileName: string): Promise<ts.Diagnostic[]> => {
    return this._languageService.getSemanticDiagnostics(fileName)
  }

  getSuggestionDiagnostics = async (fileName: string): Promise<ts.Diagnostic[]> => {
    return this._languageService.getSuggestionDiagnostics(fileName)
  }

  diagnosticPairs: DiagnosticPair[] = [
    { type: 'syntactic', method: this.getSyntacticDiagnostics },
    { type: 'semantic', method: this.getSemanticDiagnostics },
    { type: 'suggestion', method: this.getSuggestionDiagnostics }
  ]

  getCombinedDiagnostics = async (fileName: string): Promise<DiagnosticsResult[]> => {
    const diagnosticRsesults: DiagnosticsResult[] = []

    for (let { type, method } of this.diagnosticPairs) {
      diagnosticRsesults.push({
        type,
        diagnostics: await method(fileName)
      })
    }

    return diagnosticRsesults
  }

  async getCompletionsAtPosition(fileName: string, position: number): Promise<ts.CompletionInfo | undefined> {
    return this._languageService.getCompletionsAtPosition(fileName, position, undefined)
  }

  async getCompletionEntryDetails(
    fileName: string,
    position: number,
    entry: string
  ): Promise<ts.CompletionEntryDetails | undefined> {
    return this._languageService.getCompletionEntryDetails(fileName, position, entry, undefined, undefined, undefined)
  }

  async getSignatureHelpItems(fileName: string, position: number): Promise<ts.SignatureHelpItems | undefined> {
    return this._languageService.getSignatureHelpItems(fileName, position, undefined)
  }

  async getQuickInfoAtPosition(fileName: string, position: number): Promise<ts.QuickInfo | undefined> {
    return this._languageService.getQuickInfoAtPosition(fileName, position)
  }

  async getOccurrencesAtPosition(
    fileName: string,
    position: number
  ): Promise<ReadonlyArray<ts.ReferenceEntry> | undefined> {
    return this._languageService.getOccurrencesAtPosition(fileName, position)
  }

  async getDefinitionAtPosition(
    fileName: string,
    position: number
  ): Promise<ReadonlyArray<ts.DefinitionInfo> | undefined> {
    return this._languageService.getDefinitionAtPosition(fileName, position)
  }

  async getReferencesAtPosition(fileName: string, position: number): Promise<ts.ReferenceEntry[] | undefined> {
    return this._languageService.getReferencesAtPosition(fileName, position)
  }

  async getNavigationBarItems(fileName: string): Promise<ts.NavigationBarItem[]> {
    return this._languageService.getNavigationBarItems(fileName)
  }

  async getFormattingEditsForDocument(fileName: string, options: ts.FormatCodeOptions): Promise<ts.TextChange[]> {
    return this._languageService.getFormattingEditsForDocument(fileName, options)
  }

  async getFormattingEditsForRange(
    fileName: string,
    start: number,
    end: number,
    options: ts.FormatCodeOptions
  ): Promise<ts.TextChange[]> {
    return this._languageService.getFormattingEditsForRange(fileName, start, end, options)
  }

  async getFormattingEditsAfterKeystroke(
    fileName: string,
    postion: number,
    ch: string,
    options: ts.FormatCodeOptions
  ): Promise<ts.TextChange[]> {
    return this._languageService.getFormattingEditsAfterKeystroke(fileName, postion, ch, options)
  }

  async findRenameLocations(
    fileName: string,
    position: number,
    findInStrings: boolean,
    findInComments: boolean,
    providePrefixAndSuffixTextForRename: boolean
  ): Promise<readonly ts.RenameLocation[] | undefined> {
    return this._languageService.findRenameLocations(
      fileName,
      position,
      findInStrings,
      findInComments,
      providePrefixAndSuffixTextForRename
    )
  }

  async getRenameInfo(fileName: string, position: number, options: ts.RenameInfoOptions): Promise<ts.RenameInfo> {
    return this._languageService.getRenameInfo(fileName, position, options)
  }

  getEmitOutput = async (fileName: string): Promise<CompiledOutputFile> => {
    const fileModel = this._getModel(fileName)

    if (!fileModel) {
      throw new Error(`Missing file model for “${fileName}”`)
    }

    const { emitSkipped, outputFiles } = this._languageService.getEmitOutput(fileName)

    if (emitSkipped || !outputFiles.length) {
      return {
        fileName,
        rawResponse: fileModel.rawResponse,
        uncompiledText: fileModel.uncompiledText,
        compiledResult: null,
        diagnostics: await this.getCombinedDiagnostics(fileName)
      }
    }

    return {
      fileName,
      compiledResult: outputFiles[0].text,
      uncompiledText: fileModel.uncompiledText,
      rawResponse: fileModel.rawResponse,
      diagnostics: await this.getCombinedDiagnostics(fileName)
    }
  }

  getEmitOutputs = async (): Promise<CombinedEmitOutput> => {
    const output: CombinedEmitOutput = {
      files: {},
      diagnostics: [
        {
          type: 'compiler',
          diagnostics: await this.getCompilerOptionsDiagnostics()
        }
      ]
    }

    for (let fileName of Object.keys(this._fileNameToFileModel)) {
      output.files[fileName] = await this.getEmitOutput(fileName)
    }

    return output
  }

  async getCodeFixesAtPosition(
    fileName: string,
    start: number,
    end: number,
    errorCodes: number[],
    formatOptions: ts.FormatCodeOptions
  ): Promise<ReadonlyArray<ts.CodeFixAction>> {
    const preferences = {}
    return this._languageService.getCodeFixesAtPosition(fileName, start, end, errorCodes, formatOptions, preferences)
  }

  updateExtraLibs(extraLibs: IExtraLibs) {
    this._extraLibs = extraLibs
  }
}
