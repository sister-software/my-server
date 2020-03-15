import typescript from 'rollup-plugin-typescript2'
import nodeResolve from '@rollup/plugin-node-resolve'
import commonjs from '@rollup/plugin-commonjs'

const defaultEntry = () => ({
  output: {
    dir: 'build',
    format: 'cjs'
  },
  context: 'self',
  plugins: [
    nodeResolve({
      browser: true,
      extensions: ['.js', '.json', '.ts']
    }),
    commonjs({
      namedExports: {
        'node_modules/typescript/lib/typescript.js': ['transpileModule']
      }
    }),
    typescript()
  ]
})

export default [
  {
    ...defaultEntry(),
    input: 'src/worker.ts'
  },
  {
    ...defaultEntry(),
    input: 'src/server.ts',
    context: 'window'
  }
]
