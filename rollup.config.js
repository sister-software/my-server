import typescript from 'rollup-plugin-typescript2'
import json from '@rollup/plugin-json'
import nodeResolve from '@rollup/plugin-node-resolve'
import commonjs from '@rollup/plugin-commonjs'
import copy from 'rollup-plugin-copy'

export default [
  {
    input: 'src/service-worker.ts',
    output: {
      dir: 'build',
      format: 'cjs'
    },
    context: 'self',
    plugins: [
      json(),
      nodeResolve({
        browser: true,
        preferBuiltins: false,
        extensions: ['.js', '.json', '.ts']
      }),
      commonjs({
        namedExports: {
          'node_modules/typescript/lib/typescript.js': [
            'createLanguageService',
            'createDocumentRegistry',
            'flattenDiagnosticMessageText',
            'TranspileOptions',
            'EmitResult',
            'Diagnostic',
            'CompilerOptions',
            'LanguageServiceHost',
            'ScriptSnapshot',
            'ScriptKind',
            'ScriptTarget',
            'LanguageService',
            'ResolvedModule',
            'ModuleResolutionKind',
            'ModuleKind',
            'resolveModuleName',
            'resolvePath',
            'createSourceFile',
            'createPrinter',
            'preProcessFile',
            'getSourceMapRange',
            'setSourceMapRange',
            'getMutableClone',
            'isNumericLiteral',
            'isImportDeclaration',
            'isSourceFile',
            'updateImportDeclaration',
            'Visitor',
            'createStringLiteral',
            'visitEachChild',
            'visitNode',
            'transform',
            'SyntaxKind'
          ]
        }
      }),
      typescript(),
      copy({
        targets: [
          {
            src: 'node_modules/typescript/lib/*.d.ts',
            dest: 'build/typescript/lib/'
          }
        ],
        copyOnce: true
      })
    ]
  },
  {
    input: 'src/server.ts',
    context: 'window',
    output: {
      dir: 'build',
      format: 'cjs'
    },
    plugins: [
      nodeResolve({
        browser: true,
        extensions: ['.js', '.json', '.ts']
      }),
      commonjs(),
      typescript()
    ]
  }
]
