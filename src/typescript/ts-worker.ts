import * as ts from 'typescript'
import { lib_es5_dts, lib_es2015_bundled_dts } from './lib/lib'

const noop = () => undefined

export interface IExtraLib {
  content: string
  version: number
}

export interface IExtraLibs {
  [path: string]: IExtraLib
}

const libBundles = {
  defaultLibDTS: {
    fileName: 'defaultLib:lib.d.ts',
    content: lib_es5_dts
  },
  es2015DTS: {
    fileName: 'defaultLib:lib.es2015.d.ts',
    content: lib_es2015_bundled_dts
  }
}

const moduleNamePattern = /(\.\/)(.+)/

const libBundlesByFileName: { [fileName: string]: RootFile } = {}

Object.keys(libBundles).forEach(libName => {
  const libBundle = libBundles[libName as keyof typeof libBundles]

  libBundlesByFileName[libBundle.fileName] = libBundle
})

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
  content: string
}

export interface RootFileModel extends RootFile {
  version: number
}

export interface FileNameToFileEntry {
  [fileName: string]: RootFileModel | undefined
}

export type CompiledOutputFile =
  | {
      fileName: string
      compiledResult: string
      // diagnostics: null
      diagnostics: string[]
    }
  | {
      fileName: string
      compiledResult: null
      diagnostics: string[]
    }

const scriptFileExtensionPattern = /\.ts|js$/g

export interface TypeScriptWorkerOptions {
  compilerOptions: ts.CompilerOptions
  extraLibs?: IExtraLibs
}

interface FileModelResolveQueue {
  [fileName: string]: undefined | Promise<RootFileModel>
}

interface FileModelResolves {
  [fileName: string]: FileModelResolveQueue
}

export class TypeScriptWorker implements ts.LanguageServiceHost {
  // --- model sync -----------------------

  private _extraLibs: IExtraLibs = Object.create(null)
  private _languageService = ts.createLanguageService(this)
  private _compilerOptions: ts.CompilerOptions
  private _fileNameToResolveQueue: FileModelResolves = {}
  private _fileNameToFileModel: FileNameToFileEntry = {}
  private _printer = ts.createPrinter()

  constructor(options: TypeScriptWorkerOptions) {
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

  addRootFile = async (fileName: string, fileUrlPath = fileName): Promise<RootFileModel> => {
    if (this._fileNameToFileModel[fileName]) {
      return this._fileNameToFileModel[fileName]!
    }

    if (!this._fileNameToResolveQueue[fileName]) {
      this._fileNameToResolveQueue[fileName] = {}
    }

    const fileResponse = await fetch(fileUrlPath + '?skip-compile=true')

    if (!fileResponse.ok || fileResponse.status !== 200) {
      throw new Error(fileResponse.statusText)
    }

    const fileContent = await fileResponse.text()

    const sourceFile = ts.createSourceFile(fileName, fileContent, ts.ScriptTarget.Latest, true)

    const transformationResult = ts.transform(sourceFile, this.customTransformers.before, this._compilerOptions)

    const rootFileModel: RootFileModel = {
      fileName,
      content: this._printer.printFile(transformationResult.transformed[0]),
      // TODO: consider caching source files.
      // sourceFile,
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
    } else if (this.isDefaultLibFileName(fileName)) {
      // default lib is static
      return '1'
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
      return model.content
    } else if (fileName in this._extraLibs) {
      return this._extraLibs[fileName].content
    } else if (fileName in libBundlesByFileName) {
      return libBundlesByFileName[fileName].content
    }
  }

  getScriptSnapshot(fileName: string): ts.IScriptSnapshot | undefined {
    const text = this._getScriptText(fileName)
    if (!text) {
      return
    }

    return <ts.IScriptSnapshot>{
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

  getDefaultLibFileName(options: ts.CompilerOptions): string {
    const tsTargetEnum =
      (options.target && tsTargetToEnum[(options.target as unknown) as keyof typeof tsTargetToEnum]) ||
      tsTargetToEnum.ES2015

    return tsTargetEnum <= tsTargetToEnum.ES2015 ? libBundles.es2015DTS.fileName : libBundles.defaultLibDTS.fileName
  }

  isDefaultLibFileName(fileName: string): boolean {
    return fileName === this.getDefaultLibFileName(this._compilerOptions)
  }

  // _createFileResolvePromise = async (absoluteModulePath: string, fileAbsoluteUrl: string): Promise<RootFileModel> => {
  //   if (this._fileNameToFileModel[fileAbsoluteUrl]) {
  //     return this._fileNameToFileModel[fileAbsoluteUrl]!
  //   }

  //   const fileResponse = await fetch(fileAbsoluteUrl + '?skip-compile=true')

  //   if (!fileResponse.ok || fileResponse.status !== 200) {
  //     throw new Error(fileResponse.statusText)
  //   }

  //   const fileContent = await fileResponse.text()

  //   const rootFileModel = await this.addRootFile({
  //     fileName: fileAbsoluteUrl,
  //     content: fileContent
  //   })

  //   return rootFileModel
  // }

  // --- language features

  private static clearFiles(diagnostics: ts.Diagnostic[]): ts.Diagnostic[] {
    // Clear the `file` field, which cannot be JSON'yfied because it
    // contains cyclic data structures.
    diagnostics.forEach(diag => {
      diag.file = undefined
      const related = <ts.Diagnostic[]>diag.relatedInformation
      if (related) {
        related.forEach(diag2 => (diag2.file = undefined))
      }
    })
    return <ts.Diagnostic[]>diagnostics
  }

  getSyntacticDiagnostics = async (fileName: string): Promise<ts.Diagnostic[]> => {
    const diagnostics = this._languageService.getSyntacticDiagnostics(fileName)
    return TypeScriptWorker.clearFiles(diagnostics)
  }

  getSemanticDiagnostics = async (fileName: string): Promise<ts.Diagnostic[]> => {
    const diagnostics = this._languageService.getSemanticDiagnostics(fileName)
    return TypeScriptWorker.clearFiles(diagnostics)
  }

  getSuggestionDiagnostics = async (fileName: string): Promise<ts.Diagnostic[]> => {
    const diagnostics = this._languageService.getSuggestionDiagnostics(fileName)
    return TypeScriptWorker.clearFiles(diagnostics)
  }

  getCompilerOptionsDiagnostics = async (fileName: string): Promise<ts.Diagnostic[]> => {
    const diagnostics = this._languageService.getCompilerOptionsDiagnostics()
    return TypeScriptWorker.clearFiles(diagnostics)
  }

  getCombinedDiagnostics = async (fileName: string): Promise<string[]> => {
    const diagnosticMethods = [
      this.getCompilerOptionsDiagnostics,
      this.getSyntacticDiagnostics,
      this.getSemanticDiagnostics,
      this.getSuggestionDiagnostics
    ]

    const allDiagnosticsPromises = await Promise.all(diagnosticMethods.map(method => method(fileName)))
    const allDiagnostics = allDiagnosticsPromises.flat()

    return allDiagnostics.map(diagnostic => {
      const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n')

      if (diagnostic.file) {
        let { line, character } = diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start!)
        return `  Error ${diagnostic.file.fileName} (${line + 1},${character + 1}): ${message}`
      }
      return `  Error: ${message}`
    })
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
    const { emitSkipped, outputFiles } = this._languageService.getEmitOutput(fileName)

    if (emitSkipped) {
      return {
        fileName,
        compiledResult: null,
        diagnostics: await this.getCombinedDiagnostics(fileName)
      }
    }

    return {
      fileName,
      compiledResult: outputFiles[0].text,
      diagnostics: await this.getCombinedDiagnostics(fileName)
    }
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
