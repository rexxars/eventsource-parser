import {defineConfig} from '@sanity/pkg-utils'
import {visualizer} from 'rollup-plugin-visualizer'
import {name, version} from './package.json'

export default defineConfig({
  extract: {
    rules: {
      'tsdoc-undefined-tag': 'off',
    },
  },

  rollup: {
    plugins: [
      visualizer({
        emitFile: true,
        filename: 'stats.html',
        gzipSize: true,
        title: `${name}@${version} bundle analysis`,
      }),
    ],
  },

  tsconfig: 'tsconfig.dist.json',
})
