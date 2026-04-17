/**
 * Throughput benchmark for `createParser().feed()`.
 *
 * Run with:
 *   node --expose-gc bench/parse.bench.ts
 *
 * Uses the fixture generators from `test/benchmark-fixtures.ts`. Fixtures are generated once
 * per process invocation with a time-based seed, so the JIT cannot memoize anything about a
 * specific fixture across runs of the binary.
 *
 * The bench bodies follow the mitata "writing good benchmarks" guidance:
 *   - fresh parser per iteration via a computed parameter (`[0]()`), so JIT cannot lift any
 *     parser-state-dependent work out of the hot loop.
 *   - `do_not_optimize()` on a per-iteration event counter so the parser's side effects are
 *     observable to the engine (defeats dead-code elimination).
 *   - `.gc('inner')` on each case — parsing is allocation-heavy (incomplete-line buffer, data
 *     accumulator, new strings), and we don't want unpredictable GC pauses inside a sample.
 */

import {bench, do_not_optimize, run} from 'mitata'

import {createParser} from '../src/parse.ts'
import type {EventSourceParser} from '../src/types.ts'
import {
  createDataOnlyFixture,
  createEdgeCasesFixture,
  createHeartbeatFixture,
  createIdentifiedEventFixture,
  createIdleStreamFixture,
  createMultibyteFixture,
  createNamedEventFixture,
  createSmallChunkFixture,
} from '../test/benchmark-fixtures.ts'

interface Fixture {
  chunks: string[]
  eventCount: number
  byteLength: number
}

function materialize(fixture: {chunks: string[]; events: unknown[]}): Fixture {
  let byteLength = 0
  for (const chunk of fixture.chunks) byteLength += chunk.length
  return {chunks: fixture.chunks, eventCount: fixture.events.length, byteLength}
}

// Time-seeded, generated once per process. Sizes chosen so each iteration does enough work
// to swamp per-iter setup overhead but stays small enough to not dominate the total run time.
const FIXTURES = {
  'data-only': materialize(createDataOnlyFixture({count: 256})),
  'named-event': materialize(createNamedEventFixture({count: 128})),
  'identified-event': materialize(createIdentifiedEventFixture({count: 128})),
  multibyte: materialize(createMultibyteFixture({count: 128})),
  heartbeat: materialize(createHeartbeatFixture({count: 64})),
  'idle-stream': materialize(createIdleStreamFixture({count: 512})),
  'small-chunk': materialize(createSmallChunkFixture({count: 128, avgChunkSize: 8})),
  'edge-cases': materialize(createEdgeCasesFixture()),
} as const satisfies Record<string, Fixture>

type CaseName = keyof typeof FIXTURES

const CASES: CaseName[] = [
  'data-only',
  'named-event',
  'identified-event',
  'multibyte',
  'heartbeat',
  'idle-stream',
  'small-chunk',
  'edge-cases',
]

for (const name of CASES) {
  const f = FIXTURES[name]
  // oxlint-disable-next-line no-console
  console.log(`# ${name}: ${f.chunks.length} chunks, ${f.eventCount} events, ${f.byteLength} chars`)
}

// Not wrapped in summary() — the four cases do different amounts of work, so mitata's
// cross-case "Nx faster than" block would be noise. Per-case numbers are what matter.
for (const name of CASES) {
  const {chunks} = FIXTURES[name]
  // Reused across iterations — shape stable, so onEvent doesn't get re-JITted per-iter.
  let count = 0
  const onEvent = () => {
    count++
  }

  bench(`feed() — ${name}`, function* () {
    yield {
      [0]() {
        // Fresh parser per iteration (computed parameter, not measured). A fresh parser
        // guarantees no state carry-over between samples: incompleteLine, data buffer,
        // and isFirstChunk all start clean.
        count = 0
        return createParser({onEvent})
      },

      bench(parser: EventSourceParser) {
        for (let i = 0; i < chunks.length; i++) {
          parser.feed(chunks[i]!)
        }
        // Observable side effect so the engine can't elide the feed() calls.
        do_not_optimize(count)
      },
    }
  }).gc('inner')
}

await run()
