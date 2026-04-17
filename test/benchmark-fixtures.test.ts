import {describe, expect, test} from 'vitest'

import {createParser} from '../src/parse.ts'
import type {EventSourceMessage} from '../src/types.ts'
import {
  createDataOnlyFixture,
  createEdgeCasesFixture,
  createNamedEventFixture,
  createSmallChunkFixture,
} from './benchmark-fixtures.ts'

type FixtureFactory = () => {chunks: string[]; events: EventSourceMessage[]}

// Fixed seed so these tests are deterministic. Bench invocations can omit the seed.
const SEED = 0xc0ffee

const fixtures: Array<[string, FixtureFactory]> = [
  ['data-only', () => createDataOnlyFixture({seed: SEED, count: 24})],
  ['named-event', () => createNamedEventFixture({seed: SEED, count: 16})],
  ['small-chunk', () => createSmallChunkFixture({seed: SEED, count: 16, avgChunkSize: 6})],
  ['edge-cases', () => createEdgeCasesFixture()],
]

describe('benchmark fixtures', () => {
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
