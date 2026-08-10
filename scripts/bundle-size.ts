/**
 * Reports the bundle size of the built ESM entries: raw, minified (terser),
 * and gzipped (zlib level 9).
 *
 * Run with:
 *   npm run bundle-size
 */

import {spawnSync} from 'node:child_process'
import {stat, writeFile} from 'node:fs/promises'
import {join} from 'node:path'
import {gzipSync} from 'node:zlib'

import {build} from 'esbuild'
import {minify} from 'terser'

const format = (bytes: number) => `${(bytes / 1024).toFixed(2)} KB (${bytes} B)`

const entries = [
  {
    name: 'eventsource-parser',
    sourcePath: join(import.meta.dirname, '..', 'dist', 'index.js'),
    minifiedPath: join(import.meta.dirname, '..', 'dist', 'index.min.js'),
  },
  {
    name: 'eventsource-parser/stream',
    sourcePath: join(import.meta.dirname, '..', 'dist', 'stream.js'),
    minifiedPath: join(import.meta.dirname, '..', 'dist', 'stream.min.js'),
  },
]

for (const {name, sourcePath, minifiedPath} of entries) {
  try {
    await stat(sourcePath)
  } catch {
    console.error(`Could not find \`${sourcePath}\`. Run \`npm run build\` first.`)
    process.exit(1)
  }

  const bundled = await build({
    entryPoints: [sourcePath],
    bundle: true,
    format: 'esm',
    platform: 'browser',
    target: 'es2018',
    write: false,
  })
  const source = bundled.outputFiles[0]?.text

  if (typeof source !== 'string') {
    console.error(`esbuild produced no output for \`${name}\`.`)
    process.exit(1)
  }

  const result = await minify(source, {
    module: true,
    ecma: 2018,
    compress: true,
    mangle: true,
  })

  if (typeof result.code !== 'string') {
    console.error(`Terser produced no output for \`${name}\`.`)
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

  console.log(name)
  console.log(`  Raw:      ${format(rawBytes)}`)
  console.log(`  Minified: ${format(minifiedBytes)}`)
  console.log(`  Gzipped:  ${format(gzippedBytes)}`)
}
