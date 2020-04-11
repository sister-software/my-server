import { Diagnostic, flattenDiagnosticMessageText } from 'typescript'
export type DiagnosticType = 'compiler' | 'syntactic' | 'semantic' | 'suggestion'

export type DiagnosticsResult = {
  type: DiagnosticType
  diagnostics: Diagnostic[]
}

export type DiagnosticPair = {
  type: DiagnosticType
  method: (fileName: string) => Promise<Diagnostic[]>
}

export function diagnosticToPrintedString(diagnostic: Diagnostic, diagnosticType: DiagnosticType) {
  const message = flattenDiagnosticMessageText(diagnostic.messageText, '\n')

  if (diagnostic.file) {
    let { line, character } = diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start!)

    return `${diagnosticType} ${diagnostic.file.fileName} (${line + 1},${character + 1}): ${message}`
  }

  return `${diagnosticType}: ${message}`
}
