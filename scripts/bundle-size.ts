/**
 * Reports the bundle size of the built ESM entry (`dist/index.js`):
 * raw, minified (terser), and gzipped (zlib level 9).
 *
 * Run with:
 *   npm run bundle-size
 */

import {spawnSync} from 'node:child_process'
import {readFile, stat, writeFile} from 'node:fs/promises'
import {fileURLToPath} from 'node:url'
import {gzipSync} from 'node:zlib'

import {minify} from 'terser'

const sourcePath = fileURLToPath(new URL('../dist/index.js', import.meta.url))
const minifiedPath = fileURLToPath(new URL('../dist/index.min.js', import.meta.url))

try {
  await stat(sourcePath)
} catch {
  console.error(`Could not find \`${sourcePath}\`. Run \`npm run build\` first.`)
  process.exit(1)
}

const source = await readFile(sourcePath, 'utf8')

const result = await minify(source, {
  module: true,
  ecma: 2020,
  compress: true,
  mangle: true,
})

if (typeof result.code !== 'string') {
  console.error('Terser produced no output.')
  process.exit(1)
}

const rawBytes = Buffer.byteLength(source, 'utf8')
const minifiedBytes = Buffer.byteLength(result.code, 'utf8')
const gzippedBytes = gzipSync(result.code, {level: 9}).byteLength

// Write the raw terser output, then format it with oxfmt for easier reading
// when code-golfing. Size metrics above reflect the unformatted output, which
// is what ships in real bundles.
await writeFile(minifiedPath, result.code)
const oxfmt = spawnSync('npx', ['oxfmt', '--write', minifiedPath], {stdio: 'inherit'})
if (oxfmt.status !== 0) {
  console.error('oxfmt failed to format the minified output.')
  process.exit(1)
}

const format = (bytes: number) => `${(bytes / 1024).toFixed(2)} KB (${bytes} B)`

console.log(`Raw:      ${format(rawBytes)}`)
console.log(`Minified: ${format(minifiedBytes)}`)
console.log(`Gzipped:  ${format(gzippedBytes)}`)
