/* eslint-disable no-console */
import {createParser} from '../src/parse.ts'

const NUM_RUNS = 10
const NUM_EVENTS = 5e6

const bytes: number[] = []
const runs: number[] = []

for (let run = 0; run < NUM_RUNS; run++) {
  let totalLength = 0
  const start = Date.now()
  const parser = createParser({
    onEvent: (event) => {
      totalLength += event.data.length
    },
  })

  for (let i = 0; i < NUM_EVENTS; i++) {
    parser.feed(`id: evt-${i}\n`)
    parser.feed('event: update\n')
    parser.feed(`data: {"foo":"bar","counter":${i}}\n\n`)
  }

  const elapsed = Date.now() - start
  runs.push(elapsed)
  bytes.push(totalLength)
}

if (!bytes.every((b) => b === bytes[0])) {
  throw new Error('Mismatched byte count')
}

const min = runs.reduce((a, b) => Math.min(a, b), runs[0])
const max = runs.reduce((a, b) => Math.max(a, b), runs[0])
const mean = Math.floor(runs.reduce((a, b) => a + b, 0) / runs.length)

console.log('%d MB processed x %d runs', (bytes[0] / 1e6).toFixed(2), NUM_RUNS)
console.log('Time:')
console.log('  Avg: %d s', (mean / 1000).toFixed(2))
console.log('  Min: %d s', (min / 1000).toFixed(2))
console.log('  Max: %d s', (max / 1000).toFixed(2))

/**
 * M1 MacBook Book results, 5e6 events, 10 runs:
 * 153.89 MB processed x 10 runs
 * Time:
 *  Avg: 3.52 s
 *  Min: 3.41 s
 *  Max: 3.68 s
 */
