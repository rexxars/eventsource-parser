import {defineConfig} from '@sanity/pkg-utils'

export default defineConfig({
  tsconfig: './tsconfig.build.json',

  extract: {
    rules: {
      'tsdoc-undefined-tag': 'off',
    },
  },
})
