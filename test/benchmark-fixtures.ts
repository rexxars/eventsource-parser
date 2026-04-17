import type {EventSourceMessage} from '../src/types.ts'

import {MULTIBYTE_EMOJIS, MULTIBYTE_LINES} from './multibyte.ts'

/**
 * Benchmark fixtures for eventsource-parser.
 *
 * Each generator returns a pre-materialized list of string chunks (to feed into `parser.feed()`)
 * plus the events the parser is expected to emit. Fixtures are deterministic when given a
 * fixed `seed` and randomized (time-seeded) when `seed` is omitted, so benchmarks can't win by
 * caching across invocations.
 *
 * The shapes cover distinct hot-path branches in the parser:
 *
 *   - data-only: single `data: <json>\n\n` events, exercising the single-event fast path.
 *   - named-event: `event: <t>\ndata: <json>\n\n` events, exercising the inline prefix checks
 *     and the multi-field accumulator.
 *   - identified-event: `id: <n>\nevent: <t>\ndata: <json>\n\n`, also exercising the inline
 *     `id:` prefix check on every event.
 *   - small-chunk: a stream re-chunked at arbitrary character boundaries, exercising the
 *     incomplete-line buffering across feed() calls.
 *   - multibyte: data-only events whose payloads are UTF-8 text and emoji — stresses String
 *     primitives where character count and code-unit count diverge.
 *   - heartbeat: data events interleaved with `: keep-alive\n` comment chunks, one complete
 *     line per `feed()` call. Exercises the comment fast path at high frequency.
 *   - idle-stream: an idle connection that sends a bare `:` per `feed()` to hold the socket
 *     open — no newlines until a real event eventually arrives. Exercises the
 *     incomplete-line buffer under worst-case growth (each feed rescans the full buffer
 *     for `\r`/`\n`).
 *   - edge-cases: a mix that falls off the fast path (CRLF, comments, multi-line data,
 *     unknown fields, split CRLF pairs).
 */

export interface BenchmarkFixture {
  chunks: string[]
  events: EventSourceMessage[]
}

export interface FixtureOptions {
  /** Seed for the PRNG. If omitted, a time-based seed is used (non-deterministic). */
  seed?: number
  /** Number of content deltas/chunks to emit. Defaults differ per fixture. */
  count?: number
}

export interface SmallChunkOptions extends FixtureOptions {
  /**
   * Average chunk size, in characters. Actual sizes are drawn uniformly from
   * [1, 2*avgChunkSize). Defaults to 8.
   */
  avgChunkSize?: number
}

/**
 * A stream of `data:`-only events.
 *
 * Each event is a single `data: <json>\n\n` line with no `event:` field, terminated by a
 * `data: [DONE]\n\n` sentinel. Every chunk delivered to `feed()` is one complete event.
 */
export function createDataOnlyFixture(options: FixtureOptions = {}): BenchmarkFixture {
  const rng = makeRng(options.seed)
  const count = options.count ?? 64
  const id = `id-${randomId(rng, 24)}`
  const created = Math.floor(rng() * 1_000_000_000)

  const chunks: string[] = []
  const events: EventSourceMessage[] = []

  for (let i = 0; i < count; i++) {
    const token = randomToken(rng)
    const payload = {
      id,
      object: 'chat.completion.chunk',
      created,
      model: 'dre-dr-ruby',
      choices: [
        {
          index: 0,
          delta: i === 0 ? {role: 'assistant', content: token} : {content: token},
          finish_reason: null,
        },
      ],
    }
    const json = JSON.stringify(payload)
    chunks.push(`data: ${json}\n\n`)
    events.push({id: undefined, event: undefined, data: json})
  }

  const finalPayload = {
    id,
    object: 'chat.completion.chunk',
    created,
    model: 'dre-dr-ruby',
    choices: [{index: 0, delta: {}, finish_reason: 'stop'}],
  }
  const finalJson = JSON.stringify(finalPayload)
  chunks.push(`data: ${finalJson}\n\n`)
  events.push({id: undefined, event: undefined, data: finalJson})

  chunks.push('data: [DONE]\n\n')
  events.push({id: undefined, event: undefined, data: '[DONE]'})

  return {chunks, events}
}

/**
 * A stream of named, multi-field events.
 *
 * Each event carries an explicit `event: <type>` field followed by `data: <json>`, with a
 * handful of distinct event names across the stream. Exercises the inline `event:` / `data:`
 * prefix checks together with the multi-field event accumulator.
 */
export function createNamedEventFixture(options: FixtureOptions = {}): BenchmarkFixture {
  const rng = makeRng(options.seed)
  const deltaCount = options.count ?? 48
  const msgId = `msg_${randomId(rng, 22)}`

  const chunks: string[] = []
  const events: EventSourceMessage[] = []

  const push = (eventName: string, payload: unknown) => {
    const json = JSON.stringify(payload)
    chunks.push(`event: ${eventName}\ndata: ${json}\n\n`)
    events.push({id: undefined, event: eventName, data: json})
  }

  push('message-start', {
    type: 'message-start',
    message: {
      id: msgId,
      type: 'message',
      role: 'assistant',
      content: [],
      mode: 'dre-dr-ruby',
      usage: {input_tokens: 10 + Math.floor(rng() * 200), output_tokens: 1},
    },
  })

  push('block-start', {
    type: 'block-start',
    index: 0,
    block: {type: 'text', text: ''},
  })

  // A no-op keep-alive-style event, to vary the event names in the stream.
  push('ping', {type: 'ping'})

  let outputTokens = 1
  for (let i = 0; i < deltaCount; i++) {
    push('block-delta', {
      type: 'block-delta',
      index: 0,
      delta: {type: 'text-delta', text: randomToken(rng)},
    })
    outputTokens++
  }

  push('block-stop', {type: 'block-stop', index: 0})

  push('message-delta', {
    type: 'message-delta',
    delta: {stop_reason: 'end'},
    usage: {output_tokens: outputTokens},
  })

  push('message-stop', {type: 'message-stop'})

  return {chunks, events}
}

/**
 * A stream with `id:` + `event:` + `data:` on every event.
 *
 * Exercises the inline `id:` prefix check alongside the `event:` / `data:` ones, plus the
 * per-dispatch `id` reset that only matters when `id:` is actually used.
 */
export function createIdentifiedEventFixture(options: FixtureOptions = {}): BenchmarkFixture {
  const rng = makeRng(options.seed)
  const count = options.count ?? 128

  const chunks: string[] = []
  const events: EventSourceMessage[] = []

  for (let i = 0; i < count; i++) {
    const id = String(1000 + i)
    const payload = {index: i, text: randomToken(rng)}
    const json = JSON.stringify(payload)
    chunks.push(`id: ${id}\nevent: tick\ndata: ${json}\n\n`)
    events.push({id, event: 'tick', data: json})
  }

  return {chunks, events}
}

/**
 * A stream of `data:` events whose payloads are full of multi-byte UTF-8.
 *
 * Real-world LLM streams carry non-ASCII content (natural language in many scripts, emoji,
 * combining sequences). This fixture pulls from the same multi-byte corpus the correctness
 * tests use, but sizes the stream up to benchmark scale so the per-iteration cost isn't
 * dominated by setup.
 */
export function createMultibyteFixture(options: FixtureOptions = {}): BenchmarkFixture {
  // seed is accepted for API consistency with other fixtures, but the multibyte corpus is
  // indexed deterministically — there's no RNG-driven variation needed here.
  void options.seed
  const count = options.count ?? 128

  const chunks: string[] = []
  const events: EventSourceMessage[] = []

  for (let i = 0; i < count; i++) {
    const line = MULTIBYTE_LINES[i % MULTIBYTE_LINES.length]!
    // A handful of emojis per event — emojis are the worst case for multi-byte String
    // handling because many are ZWJ sequences (multiple code points per grapheme).
    const emojiStart = (i * 5) % MULTIBYTE_EMOJIS.length
    const emojis = MULTIBYTE_EMOJIS.slice(emojiStart, emojiStart + 5).join(' ')
    const data = `${line} ${emojis}`
    chunks.push(`data: ${data}\n\n`)
    events.push({id: undefined, event: undefined, data})
  }

  return {chunks, events}
}

/**
 * A heartbeat-heavy idle-ish stream.
 *
 * Between every few real events the server sends line-terminated `: keep-alive\n` comments,
 * each delivered as its own `feed()` chunk. Every chunk ends with `\n`, so the parser
 * dispatches each comment immediately without buffering — this is the "hot comment path"
 * shape, where `line.startsWith(':')` is the dominant branch.
 */
export function createHeartbeatFixture(options: FixtureOptions = {}): BenchmarkFixture {
  const rng = makeRng(options.seed)
  const count = options.count ?? 64
  const beatsPerEvent = 4

  const chunks: string[] = []
  const events: EventSourceMessage[] = []

  for (let i = 0; i < count; i++) {
    for (let b = 0; b < beatsPerEvent; b++) {
      chunks.push(': keep-alive\n')
    }
    const data = randomToken(rng).trim() || 'tick'
    chunks.push(`data: ${data}\n\n`)
    events.push({id: undefined, event: undefined, data})
  }

  return {chunks, events}
}

/**
 * An idle connection that drips a bare `:` per `feed()` to hold the socket open, with no
 * newline terminators until a real event eventually arrives.
 *
 * This is the worst-case shape for parsers that concatenate `incompleteLine + chunk` and
 * rescan for `\r`/`\n` on every call: the incomplete-line buffer grows by one char per feed
 * and is rescanned from the start each time, so the total scan work is O(n²) in the number
 * of idle feeds. A well-meaning parser may also hold the entire accumulated string in memory
 * until the terminator arrives.
 */
export function createIdleStreamFixture(options: FixtureOptions = {}): BenchmarkFixture {
  const count = options.count ?? 512

  const chunks: string[] = []
  for (let i = 0; i < count; i++) {
    chunks.push(':')
  }
  // Finally terminate the giant comment line and send one real event.
  chunks.push('\ndata: finally\n\n')

  // The long accumulated comment is emitted via onComment (not tracked here), so the only
  // event produced is the final `data: finally`.
  return {
    chunks,
    events: [{id: undefined, event: undefined, data: 'finally'}],
  }
}

/**
 * A stream sliced into many small, variable-size chunks.
 *
 * Takes a data-only stream and re-chunks it at arbitrary character boundaries, forcing the
 * parser to repeatedly buffer incomplete lines across `feed()` calls.
 */
export function createSmallChunkFixture(options: SmallChunkOptions = {}): BenchmarkFixture {
  const {chunks: source, events} = createDataOnlyFixture({
    seed: options.seed,
    count: options.count ?? 32,
  })

  const rng = makeRng(options.seed === undefined ? undefined : options.seed ^ 0x9e3779b9)
  const avg = options.avgChunkSize ?? 8
  const full = source.join('')

  const chunks: string[] = []
  let pos = 0
  while (pos < full.length) {
    const size = 1 + Math.floor(rng() * (avg * 2 - 1))
    chunks.push(full.slice(pos, pos + size))
    pos += size
  }

  return {chunks, events}
}

/**
 * A mix of inputs that tests the parser in depth.
 *
 * Includes: CRLF line endings, CR-only line endings, comments (ignored by the parser),
 * multi-line `data:` events, `id:` fields, `retry:` fields, unknown fields, and events split
 * across chunk boundaries. Chunk boundaries intentionally fall inside lines and between the
 * CR and LF of CRLF pairs to exercise the spec-complete fallback path.
 */
export function createEdgeCasesFixture(): BenchmarkFixture {
  const chunks: string[] = []
  const events: EventSourceMessage[] = []

  // CRLF-terminated event with id + event + data.
  chunks.push('id: 1\r\nevent: greet\r\ndata: hello world\r\n\r\n')
  events.push({id: '1', event: 'greet', data: 'hello world'})

  // Split a CRLF across two chunks so the `\r` ends one feed() and `\n` starts the next.
  chunks.push('id: 2\r\nevent: split-crlf\r\ndata: across-chunks\r')
  chunks.push('\n\r\n')
  events.push({id: '2', event: 'split-crlf', data: 'across-chunks'})

  // Multi-line data (joined by LF in the emitted event). `id` resets after every dispatch,
  // so from here on events have no id unless they carry their own `id:` line.
  chunks.push('event: multiline\ndata: line one\ndata: line two\ndata: line three\n\n')
  events.push({
    id: undefined,
    event: 'multiline',
    data: 'line one\nline two\nline three',
  })

  // Comment lines are consumed but never produce events.
  chunks.push(': keep-alive comment\n: another comment\n')

  // CR-only line terminators, also spec-legal.
  chunks.push('event: cr-only\rdata: carriage\rdata: return\r\r')
  events.push({id: undefined, event: 'cr-only', data: 'carriage\nreturn'})

  // retry + unknown-field lines. Neither produces an event; both exercise the non-fast-path
  // branches in parseLine/processField.
  chunks.push('retry: 1500\nfoobar: ignored\n\n')

  // Chunked event where field name and value are split across feed() calls.
  chunks.push('ev')
  chunks.push('ent: chunked-field\nda')
  chunks.push('ta: split-value\n\n')
  events.push({id: undefined, event: 'chunked-field', data: 'split-value'})

  // Event where the blank-line dispatcher arrives as its own chunk.
  chunks.push('event: tail\ndata: end')
  chunks.push('\n')
  chunks.push('\n')
  events.push({id: undefined, event: 'tail', data: 'end'})

  return {chunks, events}
}

function makeRng(seed: number | undefined): () => number {
  const s = (seed ?? Date.now() ^ (Math.random() * 0x100000000)) >>> 0
  // Mulberry32 — tiny, fast, good enough for fixture generation.
  let a = s || 1
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
function randomId(rng: () => number, length: number): string {
  let out = ''
  for (let i = 0; i < length; i++) {
    out += ALPHABET[Math.floor(rng() * ALPHABET.length)]
  }
  return out
}

const TOKEN_WORDS = [
  ' the',
  ' quick',
  ' brown',
  ' fox',
  ' jumps',
  ' over',
  ' a',
  ' lazy',
  ' dog',
  '.',
  ' Hello',
  ' world',
  '!',
  ' Streaming',
  ' tokens',
  ' arrive',
  ' one',
  ' at',
  ' time',
  ',',
  ' parsed',
  ' incrementally',
  ' by',
  ' SSE',
]
function randomToken(rng: () => number): string {
  return TOKEN_WORDS[Math.floor(rng() * TOKEN_WORDS.length)]!
}
