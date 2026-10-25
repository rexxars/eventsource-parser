import {describe, expect, test} from 'vitest'

import {createParser} from '../src/parse.ts'
import type {EventSourceMessage} from '../src/types.ts'
import {
  createCarriageReturnFixture,
  createDataOnlyFixture,
  createEdgeCasesFixture,
  createHeartbeatFixture,
  createIdentifiedEventFixture,
  createIdleStreamFixture,
  createInvalidLineDripFixture,
  createMultibyteFixture,
  createNamedEventFixture,
  createSmallChunkFixture,
  createSparseCarriageReturnFixture,
} from './benchmark-fixtures.ts'

type FixtureFactory = () => {chunks: string[]; events: EventSourceMessage[]}

// Fixed seed so these tests are deterministic. Bench invocations can omit the seed.
const SEED = 0xc0ffee

const fixtures: Array<[string, FixtureFactory]> = [
  ['data-only', () => createDataOnlyFixture({seed: SEED, count: 24})],
  ['carriage-return', () => createCarriageReturnFixture({seed: SEED, count: 24})],
  ['sparse-carriage-return', () => createSparseCarriageReturnFixture({seed: SEED, count: 24})],
  ['named-event', () => createNamedEventFixture({seed: SEED, count: 16})],
  ['identified-event', () => createIdentifiedEventFixture({seed: SEED, count: 16})],
  ['multibyte', () => createMultibyteFixture({seed: SEED, count: 20})],
  ['heartbeat', () => createHeartbeatFixture({seed: SEED, count: 12})],
  ['idle-stream', () => createIdleStreamFixture({count: 64})],
  ['invalid-line-drip', () => createInvalidLineDripFixture({count: 64})],
  ['small-chunk', () => createSmallChunkFixture({seed: SEED, count: 16, avgChunkSize: 6})],
  ['edge-cases', () => createEdgeCasesFixture()],
]

describe('benchmark fixtures', () => {
  test.each([createCarriageReturnFixture, createSparseCarriageReturnFixture])(
    '%s preserves events across chunk boundaries',
    (createFixture) => {
      const {chunks, events: expected} = createFixture({seed: SEED, count: 8})
      const input = chunks.join('')
      for (const size of [1, 2, 7, 1024]) {
        const actual: EventSourceMessage[] = []
        const parser = createParser({onEvent: (event) => actual.push(event)})
        for (let offset = 0; offset < input.length; offset += size) {
          parser.feed(input.slice(offset, offset + size))
        }
        expect(actual).toEqual(expected)
      }
    },
  )

  test.each(fixtures)('%s parses into the expected events', (_name, factory) => {
    const {chunks, events: expected} = factory()

    const actual: EventSourceMessage[] = []
    const parser = createParser({
      onEvent: (evt) => actual.push(evt),
    })

    for (const chunk of chunks) {
      parser.feed(chunk)
    }

    expect(actual).toEqual(expected)
  })

  test('data-only produces one event per chunk', () => {
    const {chunks, events} = createDataOnlyFixture({seed: SEED, count: 10})
    expect(chunks).toHaveLength(events.length)
    for (const chunk of chunks) {
      expect(chunk.startsWith('data: ')).toBe(true)
      expect(chunk.endsWith('\n\n')).toBe(true)
    }
  })

  test('small-chunk splits the stream into many small chunks', () => {
    const {chunks} = createSmallChunkFixture({seed: SEED, count: 16, avgChunkSize: 6})
    expect(chunks.length).toBeGreaterThan(16)
    for (const chunk of chunks) {
      expect(chunk.length).toBeGreaterThan(0)
    }
  })

  test('fixtures are deterministic for a given seed', () => {
    const a = createDataOnlyFixture({seed: 42, count: 8})
    const b = createDataOnlyFixture({seed: 42, count: 8})
    expect(a).toEqual(b)
  })
})
