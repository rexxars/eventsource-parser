import {expect, test, vi} from 'vitest'

import {ParseError} from '../src/errors.ts'
import {createParser} from '../src/parse.ts'
import {
  getBasicFixtureStream,
  getCarriageReturnFixtureStream,
  getCarriageReturnLineFeedFixtureStream,
  getCommentsFixtureStream,
  getDataFieldParsingFixtureStream,
  getEmptyEventsFixtureStream,
  getEmptyRetryFixtureStream,
  getHeartbeatsFixtureStream,
  getHugeMessageFixtureStream,
  getIdentifiedFixtureStream,
  getInvalidBomFixtureStream,
  getInvalidRetryFixtureStream,
  getLeadingBomFixtureStream,
  getLineFeedFixtureStream,
  getMixedCommentsFixtureStream,
  getMultiBomFixtureStream,
  getMultibyteEmptyLineFixtureStream,
  getMultibyteFixtureStream,
  getMultilineFixtureStream,
  getTimeFixtureStream,
  getTimeFixtureStreamChunked,
  getUnknownFieldsFixtureStream,
} from './fixtures.ts'
import {getParseResultMock} from './mock.ts'
import {expectedMultiByteEvents} from './multibyte.ts'

test('basic unnamed events stream', async () => {
  const mock = getParseResultMock()
  const parser = createParser({onEvent: mock.onParse})
  await getBasicFixtureStream(parser.feed)

  mock.expectNumberOfMessagesToBe(6)
  mock.expectNextMessage({data: '0', event: undefined, id: undefined})
  mock.expectNextMessage({data: '1'})
  mock.expectNextMessage({data: '2'})
  mock.expectNextMessage({data: '3'})
  mock.expectNextMessage({data: '4'})
  mock.expectNextMessage({event: 'done', data: '✔'})
})

test('stream of `time` event name', async () => {
  const mock = getParseResultMock()
  const parser = createParser({onEvent: mock.onParse})
  await getTimeFixtureStream(parser.feed)

  mock.expectNumberOfMessagesToBe(6)
  mock.expectNextMessage({event: 'time', data: /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/})
})

test('stream of `time` event names, unbalanced chunks', async () => {
  const mock = getParseResultMock()
  const parser = createParser({onEvent: mock.onParse})
  await getTimeFixtureStreamChunked(parser.feed)

  while (mock.hasNextMessage()) {
    mock.expectNextMessage({event: 'time', data: /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/})
  }
})

test('stream of identified messanges + retry interval', async () => {
  const mock = getParseResultMock()
  const parser = createParser(mock.callbacks)
  await getIdentifiedFixtureStream(1337, parser.feed)

  expect(mock.events[0]).toMatchObject({type: 'reconnect-interval', value: 50})
  expect(mock.events[1]).toMatchObject({type: 'event', id: '1337', event: 'tick', data: '1337'})
  expect(mock.events[2]).toMatchObject({type: 'reconnect-interval', value: 50})
  expect(mock.events[3]).toMatchObject({type: 'event', id: '1338', event: 'tick', data: '1338'})
})

test('stream of "heartbeat" comments, unnamed events', async () => {
  const onComment = vi.fn()
  const mock = getParseResultMock()
  const parser = createParser({onEvent: mock.onParse, onComment})
  await getHeartbeatsFixtureStream(parser.feed)

  for (let char = 65; char < 70; char++) {
    mock.expectNextMessage({data: String.fromCharCode(char)})
  }

  mock.expectNextMessage({event: 'done', data: '✔'})
  expect(onComment).toHaveBeenCalledTimes(5)
  expect(onComment).toHaveBeenLastCalledWith(' ♥')
})

test('stream of multi-line data events', async () => {
  const mock = getParseResultMock()
  const parser = createParser({onEvent: mock.onParse})
  await getMultilineFixtureStream(parser.feed)
  mock.expectNextMessage({
    id: undefined,
    event: 'stock',
    data: 'YHOO\n+2\n10',
  })
  mock.expectNextMessage({
    id: undefined,
    event: 'stock',
    data: 'GOOG\n-8\n1881',
  })
})

test('stream of multi-byte events', async () => {
  const mock = getParseResultMock()
  const parser = createParser({onEvent: mock.onParse})
  await getMultibyteFixtureStream(parser.feed)
  for (let i = 0; i < mock.events.length; i++) {
    expect(mock.events[i]).toStrictEqual(expectedMultiByteEvents[i])
  }
})

test('stream of multi-byte events with some empty lines thrown in', async () => {
  const mock = getParseResultMock()
  const parser = createParser({onEvent: mock.onParse})
  await getMultibyteEmptyLineFixtureStream(parser.feed)

  mock.expectNextMessage({data: '我現在都看實況不玩遊戲'})
  mock.expectNextMessage({event: 'done'})
})

test('stream of leading bom', async () => {
  const mock = getParseResultMock()
  const parser = createParser({onEvent: mock.onParse})
  await getLeadingBomFixtureStream(parser.feed)
  mock.expectNextMessage({data: 'bomful 1'})
  mock.expectNextMessage({data: 'bomless 2'})
  mock.expectNextMessage({event: 'done'})
})

test('stream containing decoded U+FEFF byte-order marks (multiple places)', async () => {
  const mock = getParseResultMock()
  const parser = createParser({onEvent: mock.onParse})
  await getInvalidBomFixtureStream(parser.feed)
  // The leading U+FEFF on the first chunk is stripped (one leading BOM, per spec),
  // so `bomful 1` parses - mirroring the raw 3-byte multi-BOM stream below. The
  // U+FEFF prefixing `bomful 2` is mid-stream, so that line is ignored.
  mock.expectNextMessage({data: 'bomful 1'})
  mock.expectNextMessage({data: 'bomless 3'})
  mock.expectNextMessage({event: 'done'})
})

test('stream containing byte-order mark (multiple places)', async () => {
  const mock = getParseResultMock()
  const parser = createParser({onEvent: mock.onParse})
  await getMultiBomFixtureStream(parser.feed)
  mock.expectNextMessage({data: 'bomful 1'})
  mock.expectNextMessage({data: 'bomless 3'})
  mock.expectNextMessage({event: 'done'})
})

test('UTF-8 BOM is stripped when bytes are decoded with a default `TextDecoder`', () => {
  // The parser strips the raw 3-byte BOM (0xEF 0xBB 0xBF), but the spec-compliant
  // pipeline is to decode bytes to a string first. `new TextDecoder()` strips a leading
  // BOM by default, so the parser never even sees it - the event parses cleanly.
  const mock = getParseResultMock()
  const parser = createParser({onEvent: mock.onParse})

  const body = new TextEncoder().encode('data: hello\n\n')
  const withBom = new Uint8Array([0xef, 0xbb, 0xbf, ...body])
  parser.feed(new TextDecoder().decode(withBom))

  mock.expectNumberOfMessagesToBe(1)
  mock.expectNextMessage({data: 'hello'})
})

test('a decoded U+FEFF (from an `ignoreBOM` decoder) is stripped like the raw 3-byte BOM', () => {
  // With `{ignoreBOM: true}`, the decoder passes through a single U+FEFF character rather
  // than stripping it. The parser strips a leading U+FEFF too (not just the raw 3-byte
  // form), so a leading BOM is ignored regardless of decode path and the event parses
  // cleanly - including the data line the BOM was attached to.
  const mock = getParseResultMock()
  const parser = createParser({onEvent: mock.onParse})

  const body = new TextEncoder().encode('data: first\ndata: second\n\n')
  const withBom = new Uint8Array([0xef, 0xbb, 0xbf, ...body])
  parser.feed(new TextDecoder('utf-8', {ignoreBOM: true}).decode(withBom))

  mock.expectNumberOfMessagesToBe(1)
  mock.expectNextMessage({data: 'first\nsecond'})
})

test('stream using carriage returns', async () => {
  const mock = getParseResultMock()
  const parser = createParser({onEvent: mock.onParse})
  await getCarriageReturnFixtureStream(parser.feed)
  mock.expectNextMessage({data: 'dog\nbark'})
  mock.expectNextMessage({data: 'cat\nmeow'})
  mock.expectNextMessage({event: 'done'})
})

test('stream using line feeds', async () => {
  const mock = getParseResultMock()
  const parser = createParser({onEvent: mock.onParse})
  await getLineFeedFixtureStream(parser.feed)
  mock.expectNextMessage({data: 'cow\nmoo'})
  mock.expectNextMessage({data: 'horse\nneigh'})
  mock.expectNextMessage({event: 'done'})
})

test('stream using carriage returns and line feeds', async () => {
  const mock = getParseResultMock()
  const parser = createParser({onEvent: mock.onParse})
  await getCarriageReturnLineFeedFixtureStream(parser.feed)
  mock.expectNextMessage({data: 'sheep\nbleat'})
  mock.expectNextMessage({data: 'pig\noink'})
  mock.expectNextMessage({event: 'done'})
})

test('stream with varying odd uses of comments', async () => {
  const mock = getParseResultMock()
  const parser = createParser({onEvent: mock.onParse})
  await getCommentsFixtureStream(parser.feed)
  mock.expectNextMessage({data: 'First'})
  mock.expectNextMessage({data: 'Second'})
  mock.expectNextMessage({data: 'Third'})
  mock.expectNextMessage({data: 'Fourth'})
  mock.expectNextMessage({data: 'Fifth'})
  mock.expectNextMessage({data: '✔'})
})

test('stream with even more odd uses of comments', async () => {
  const mock = getParseResultMock()
  const parser = createParser({onEvent: mock.onParse})
  await getMixedCommentsFixtureStream(parser.feed)
  mock.expectNextMessage({data: '1'})
  mock.expectNextMessage({data: '2'})
  mock.expectNextMessage({data: '3'})
  mock.expectNextMessage({data: '4'})
  // No newline after the last message, thus not emitted
})

test('stream with empty `event` field', async () => {
  const mock = getParseResultMock()
  const parser = createParser({onEvent: mock.onParse})
  await getEmptyEventsFixtureStream(parser.feed)
  mock.expectNextMessage({data: 'Hello 1', event: undefined})
  mock.expectNextMessage({data: '✔', event: 'done'})
})

test('stream with empty `retry` field', async () => {
  const mock = getParseResultMock()
  const parser = createParser(mock.callbacks)
  await getEmptyRetryFixtureStream(0, parser.feed)
  await getEmptyRetryFixtureStream(1, parser.feed)
  await getEmptyRetryFixtureStream(2, parser.feed)
  expect(mock.events[0]).toMatchObject({
    type: 'reconnect-interval',
    value: 500,
  })
  expect(mock.events[1]).toMatchObject({
    data: '🥌',
    event: undefined,
    id: '1',
    type: 'event',
  })
  expect(mock.events[2]).toMatchObject({
    type: 'error',
    error: expect.any(Error),
    message: 'Invalid `retry` value: ""',
  })
  expect(mock.events[3]).toMatchObject({
    data: '🧹',
    event: undefined,
    id: '2',
    type: 'event',
  })
  expect(mock.events[4]).toMatchObject({
    data: '✅',
    event: undefined,
    id: '3',
    type: 'event',
  })
})

test('stream with oddly shaped data field', async () => {
  const mock = getParseResultMock()
  const parser = createParser(mock.callbacks)
  await getDataFieldParsingFixtureStream(parser.feed)

  // `data:\n\n` - data field contains only a newline character, spec says:
  //   > If the data buffer is an empty string, set the data buffer and the event type
  //   > buffer to the empty string and return.
  // As we have a newline character, the data buffer is _not_, in fact, empty.
  // The spec continues:
  //   > If the data buffer's last character is a U+000A LINE FEED (LF) character,
  //   > then remove the last character from the data buffer.
  // As the data buffer only contains a newline character, it is removed - leading to an empty
  // data buffer. There is no mention of skipping this event _after_ this step, so the event is
  // emitted with an empty data field.
  mock.expectNextMessage({data: ''})

  // `data\ndata\n\n` - two empty data lines without a colon, spec says to treat the whole line as field name, eg `data`,
  // and append a newline to the data buffer. So data would be… `\n`, then two newlines terminates the event.
  mock.expectNextMessage({data: '\n'})

  // `data:test\n\n` - regular event with data
  mock.expectNextMessage({data: 'test'})
})

test('stream with cr separating chunks of same event', async () => {
  // CR at the end of a chunk might be part of a CRLF sequence that spans chunks,
  // so we shouldn't treat it as a line terminator (yet). If we terminated it as a
  // complete line, we would emit two events instead of one. For the below example:

  // { id: undefined, event: undefined, data: 'A\nB' }
  // { id: undefined, event: undefined, data: 'C' }
  // -- instead of --
  // { id: undefined, event: undefined, data: 'A\nB\nC' }
  // See https://github.com/rexxars/eventsource-parser/issues/17 for more information.

  const mock = getParseResultMock()
  const parser = createParser(mock.callbacks)
  parser.feed('data: A\r\n')
  parser.feed('data: B\r')
  parser.feed('\n')
  parser.feed('data: C\r\n')
  parser.feed('\n')

  expect(mock.events).toHaveLength(1)
})

test('stream with partially incorrect retry fields', async () => {
  const mock = getParseResultMock()
  const parser = createParser(mock.callbacks)
  await getInvalidRetryFixtureStream(parser.feed)

  // `retry:1000\n`
  expect(mock.events[0]).toMatchObject({type: 'reconnect-interval', value: 1000})

  // `retry:2000x\n - invalid retry value, spec says:
  // > If the field value consists of only ASCII digits, then interpret the field value as an
  // > integer in base ten. Otherwise, ignore the field.
  // Assert that we have emitted an error in this case (through the `onError` callback)
  expect(mock.events[1]).toMatchObject({
    type: 'error',
    error: expect.any(Error),
    message: 'Invalid `retry` value: "2000x"',
  })

  // `data:x\n\n` - regular event with data
  expect(mock.events[2]).toMatchObject({type: 'event', data: 'x', event: undefined})
  mock.expectNumberOfMessagesToBe(1)
})

test('stream with `id` field containing a NULL character', async () => {
  const mock = getParseResultMock()
  const parser = createParser(mock.callbacks)

  // Spec says of the `id` field:
  // > If the field value does not contain U+0000 NULL, then set the last event ID buffer
  // > to the field value. Otherwise, ignore the field.
  // Ignoring the field means the previously buffered `123` must survive.
  parser.feed('id: 123\nid: bad\0id\ndata: hello\n\n')

  mock.expectNumberOfMessagesToBe(1)
  mock.expectNextMessage({id: '123', event: undefined, data: 'hello'})
})

test('reports an `id` from a block without data when the block is dispatched', () => {
  const onEvent = vi.fn()
  const onId = vi.fn()
  const parser = createParser({onEvent, onId})

  parser.feed('id: 42\n')
  expect(onId).not.toHaveBeenCalled()

  parser.feed('\n')
  expect(onId).toHaveBeenCalledOnce()
  expect(onId).toHaveBeenCalledWith('42')
  expect(onEvent).not.toHaveBeenCalled()

  parser.feed('id: bad\0id\n\n')
  expect(onId).toHaveBeenCalledTimes(1)

  parser.feed('id:\n\n')
  expect(onId).toHaveBeenNthCalledWith(2, '')
})

test('reports an `id` before dispatching an event from the same block', () => {
  const calls: string[] = []
  const parser = createParser({
    onId: (id) => calls.push(`id: ${id}`),
    onEvent: (event) => calls.push(`event: ${event.data}`),
  })

  parser.feed('id: 42\ndata: hello\n\n')

  expect(calls).toStrictEqual(['id: 42', 'event: hello'])
})

test.each([
  ['CR', '\r'],
  ['CRLF', '\r\n'],
])('reports an `id` from a block using %s line endings', (_name, lineEnd) => {
  const onId = vi.fn()
  const parser = createParser({onId})

  parser.feed(`id: 42${lineEnd}${lineEnd}`)

  expect(onId).toHaveBeenCalledOnce()
  expect(onId).toHaveBeenCalledWith('42')
})

test('stream with incorrect retry fields', async () => {
  const mock = getParseResultMock()
  const parser = createParser(mock.callbacks)
  parser.feed(`
retry: 500

data: first

retry: 50x

data: second

`)

  expect(mock.events[0]).toMatchObject({type: 'reconnect-interval', value: 500})
  expect(mock.events[1]).toMatchObject({type: 'event', data: 'first', event: undefined})
  expect(mock.events[2]).toSatisfy((event) => {
    return (
      // Event is of type `error`
      typeof event === 'object' &&
      'type' in event &&
      event.type === 'error' &&
      // Event has `message` property
      'message' in event &&
      event.message === 'Invalid `retry` value: "50x"' &&
      // `error` property is an Error with `type`
      'error' in event &&
      event.error instanceof Error &&
      event.error.message === 'Invalid `retry` value: "50x"' &&
      'type' in event.error &&
      event.error.type === 'invalid-retry'
    )
  })

  expect(mock.events[3]).toMatchObject({type: 'event', data: 'second', event: undefined})
  mock.expectNumberOfMessagesToBe(2)
})

test('stream with unknown fields in the stream', async () => {
  const mock = getParseResultMock()
  const parser = createParser({onEvent: mock.onParse})
  await getUnknownFieldsFixtureStream(parser.feed)
  mock.expectNextMessage({event: undefined, data: 'abc\n\n123'})
})

test('stream with huge data chunks', async () => {
  const mock = getParseResultMock()
  const parser = createParser({onEvent: mock.onParse})
  await getHugeMessageFixtureStream(parser.feed)
  const hugeMsg = mock.events[0]
  if (!hugeMsg || hugeMsg.type !== 'event') {
    throw new Error('First message was not an event')
  }

  expect(hugeMsg.data.length).toBe(4808512)

  const receivedHash = await sha256(hugeMsg.data)
  const hashMsg = mock.events[1]
  if (!hashMsg || hashMsg.type !== 'event') {
    throw new Error('Second message was not an event')
  }

  expect(hashMsg.data).toBe(receivedHash)
}, 15000)

test('skips onError when the stream is invalid but not newline-terminated (through `reset()`)', async () => {
  const onEvent = vi.fn()
  const onError = vi.fn()
  const parser = createParser({onEvent, onError})
  parser.feed(
    JSON.stringify({
      error: 'Internal Server Error',
      message: 'The server could not process your request',
    }),
  )
  parser.reset({consume: false})

  expect(onEvent).not.toHaveBeenCalled()
  expect(onError).not.toHaveBeenCalled()
})

test('skips onError when the stream is invalid but not newline-terminated (through `reset()` with `consume: false`)', async () => {
  const onEvent = vi.fn()
  const onError = vi.fn()
  const parser = createParser({onEvent, onError})
  parser.feed(
    JSON.stringify({
      error: 'Internal Server Error',
      message: 'The server could not process your request',
    }),
  )
  parser.reset({consume: false})

  expect(onEvent).not.toHaveBeenCalled()
  expect(onError).not.toHaveBeenCalled()
})

test('skips onError when an invalid line was discarded before reset({consume: true})', async () => {
  const onEvent = vi.fn()
  const onError = vi.fn()
  const parser = createParser({onEvent, onError})
  parser.feed(
    JSON.stringify({
      error: 'Internal Server Error',
      message: 'The server could not process your request',
    }),
  )
  parser.reset({consume: true})

  expect(onEvent).not.toHaveBeenCalled()
  expect(onError).not.toHaveBeenCalled()
})

test('calls onError when the stream is invalid (through newline)', async () => {
  const onEvent = vi.fn()
  const onError = vi.fn()
  const parser = createParser({onEvent, onError})
  parser.feed(
    `${JSON.stringify({
      error: 'Internal Server Error',
      message: 'The server could not process your request',
    })}\n`,
  )

  expect(onEvent).not.toHaveBeenCalled()
  expect(onError).toHaveBeenCalled()

  const error = onError.mock.calls[0]?.[0]
  expect(error).toBeInstanceOf(ParseError)
  expect(error).toMatchObject({
    type: 'unknown-field',
    field: '{"error"',
    value: `"Internal Server Error","message":"The server could not process your request"}`,
    line: `{"error":"Internal Server Error","message":"The server could not process your request"}`,
  })
})

test('calls onError when the stream is invalid (no field separator)', async () => {
  const onEvent = vi.fn()
  const onError = vi.fn()
  const parser = createParser({onEvent, onError})
  parser.feed('Well, this is not what I expected\n')

  expect(onEvent).not.toHaveBeenCalled()
  expect(onError).toHaveBeenCalled()

  const error = onError.mock.calls[0]?.[0]
  expect(error).toBeInstanceOf(ParseError)
  expect(error).toMatchObject({
    type: 'unknown-field',
    field: 'Well, this is not what I expected',
    value: '',
    line: 'Well, this is not what I expected',
  })
})

test('maxBufferSize: discards unterminated unknown fields without buffering', () => {
  const onEvent = vi.fn()
  const onError = vi.fn()
  const parser = createParser({onEvent, onError, maxBufferSize: 16})

  parser.feed('unknown-field')
  parser.feed(': this content is ignored even without a terminator')
  parser.feed('\ndata: ok\n\n')

  expect(onError).not.toHaveBeenCalled()
  expect(onEvent).toHaveBeenCalledTimes(1)
  expect(onEvent).toHaveBeenLastCalledWith({id: undefined, event: undefined, data: 'ok'})
})

test('maxBufferSize: discards invalid lines as soon as their field name cannot become valid', () => {
  const onEvent = vi.fn()
  const onError = vi.fn()
  const parser = createParser({onEvent, onError, maxBufferSize: 16})

  parser.feed('datax')
  parser.feed(': this started like data, but is not a valid field')
  parser.feed('\ndata: ok\n\n')

  expect(onError).not.toHaveBeenCalled()
  expect(onEvent).toHaveBeenCalledTimes(1)
  expect(onEvent).toHaveBeenLastCalledWith({id: undefined, event: undefined, data: 'ok'})
})

test('maxBufferSize: preserves split valid fields while discarding invalid lines', () => {
  const onEvent = vi.fn()
  const onError = vi.fn()
  const parser = createParser({onEvent, onError, maxBufferSize: 16})

  parser.feed('da')
  parser.feed('ta\n\n')

  expect(onError).not.toHaveBeenCalled()
  expect(onEvent).toHaveBeenCalledTimes(1)
  expect(onEvent).toHaveBeenLastCalledWith({id: undefined, event: undefined, data: ''})
})

test('maxBufferSize: triggers on pending fragment overflow (no terminator)', () => {
  const onEvent = vi.fn()
  const onError = vi.fn()
  const parser = createParser({onEvent, onError, maxBufferSize: 24})

  // Single feed under the limit — fine.
  parser.feed('data: short')
  expect(onError).not.toHaveBeenCalled()

  // Pushes the accumulated fragments past the limit.
  parser.feed(' and now too long')
  expect(onError).toHaveBeenCalledTimes(1)

  const error = onError.mock.calls[0]?.[0]
  expect(error).toBeInstanceOf(ParseError)
  expect(error).toMatchObject({type: 'max-buffer-size-exceeded'})
})

test('maxBufferSize: discards unterminated comments when no onComment callback exists', () => {
  const onEvent = vi.fn()
  const onError = vi.fn()
  const parser = createParser({onEvent, onError, maxBufferSize: 16})

  parser.feed(':'.repeat(64))
  parser.feed('this content is ignored even without a terminator')
  parser.feed('\ndata: ok\n\n')

  expect(onError).not.toHaveBeenCalled()
  expect(onEvent).toHaveBeenCalledTimes(1)
  expect(onEvent).toHaveBeenLastCalledWith({id: undefined, event: undefined, data: 'ok'})
})

test('discarded unterminated comments consume crlf as one line terminator', () => {
  const onEvent = vi.fn()
  const onError = vi.fn()
  const parser = createParser({onEvent, onError, maxBufferSize: 16})

  parser.feed('data: one\n:')
  parser.feed('ignored\r\ndata: two\n\n')

  expect(onError).not.toHaveBeenCalled()
  expect(onEvent).toHaveBeenCalledTimes(1)
  expect(onEvent).toHaveBeenLastCalledWith({id: undefined, event: undefined, data: 'one\ntwo'})
})

test('discarded lines consume a crlf split across chunks as one line terminator', () => {
  const onEvent = vi.fn()
  const onError = vi.fn()
  const parser = createParser({onEvent, onError})

  // The discarded line's `\r\n` terminator is split across chunks: the `\r` ends one
  // chunk and the `\n` begins the next. The `\n` must be consumed as the second half
  // of the terminator, not treated as a blank line (which would dispatch early).
  parser.feed('data: one\n:')
  parser.feed('ignored\r')
  parser.feed('\ndata: two\n\n')

  expect(onError).not.toHaveBeenCalled()
  expect(onEvent).toHaveBeenCalledTimes(1)
  expect(onEvent).toHaveBeenLastCalledWith({id: undefined, event: undefined, data: 'one\ntwo'})
})

test('discarded lines terminated by a bare cr resume parsing on the next chunk', () => {
  const onEvent = vi.fn()
  const onError = vi.fn()
  const parser = createParser({onEvent, onError})

  // The discarded line ends with a bare `\r` at the chunk boundary and the next chunk
  // does NOT begin with `\n`, so the `\r` was a complete terminator and the following
  // chunk must be parsed as a new line rather than swallowed.
  parser.feed('data: one\n:')
  parser.feed('ignored\r')
  parser.feed('data: two\n\n')

  expect(onError).not.toHaveBeenCalled()
  expect(onEvent).toHaveBeenCalledTimes(1)
  expect(onEvent).toHaveBeenLastCalledWith({id: undefined, event: undefined, data: 'one\ntwo'})
})

test('discarded lines arriving with their own bare cr terminator do not swallow the next line', () => {
  const onEvent = vi.fn()
  const onError = vi.fn()
  const parser = createParser({onEvent, onError})

  // The discarded line arrives together with its bare `\r` terminator as the last
  // character of the chunk. The line is already complete, so the next chunk must be
  // parsed as a new line rather than skipped in search of another terminator.
  parser.feed('data: one\n:ignored\r')
  parser.feed('data: two\n\n')

  expect(onError).not.toHaveBeenCalled()
  expect(onEvent).toHaveBeenCalledTimes(1)
  expect(onEvent).toHaveBeenLastCalledWith({id: undefined, event: undefined, data: 'one\ntwo'})
})

test('discarded lines arriving with a trailing cr consume a following lf as one terminator', () => {
  const onEvent = vi.fn()
  const onError = vi.fn()
  const parser = createParser({onEvent, onError})

  // Same as above, but the `\r` turns out to be the first half of a `\r\n` split across
  // chunks. The leading `\n` of the next chunk must be consumed as the second half of
  // the terminator, not treated as a blank line (which would dispatch early).
  parser.feed('data: one\n:ignored\r')
  parser.feed('\ndata: two\n\n')

  expect(onError).not.toHaveBeenCalled()
  expect(onEvent).toHaveBeenCalledTimes(1)
  expect(onEvent).toHaveBeenLastCalledWith({id: undefined, event: undefined, data: 'one\ntwo'})
})

test('bare field lines terminated by a cr at a chunk boundary are processed, not discarded', () => {
  const onEvent = vi.fn()
  const onError = vi.fn()
  const parser = createParser({onEvent, onError})

  // A line consisting of just `data` (no colon) is a valid field per spec: it appends
  // an empty string to the data buffer. It only becomes distinguishable from an
  // unknown field once the terminator arrives, which here is a `\r` ending the chunk.
  parser.feed('data: one\ndata\r')
  parser.feed('\ndata: two\n\n')

  expect(onError).not.toHaveBeenCalled()
  expect(onEvent).toHaveBeenCalledTimes(1)
  expect(onEvent).toHaveBeenLastCalledWith({id: undefined, event: undefined, data: 'one\n\ntwo'})
})

test('unknown field lines completed by a cr at a chunk boundary still emit unknown-field errors', () => {
  const onEvent = vi.fn()
  const onError = vi.fn()
  const parser = createParser({onEvent, onError})

  // The junk line is completed (terminated by `\r`) within the chunk, so the
  // "completed invalid lines still report errors" contract applies - only lines
  // discarded *before* completion skip `onError`.
  parser.feed('garbage\r')
  parser.feed('data: ok\n\n')

  expect(onError).toHaveBeenCalledTimes(1)
  const error = onError.mock.calls[0]?.[0]
  expect(error).toBeInstanceOf(ParseError)
  expect(error).toMatchObject({type: 'unknown-field', field: 'garbage', value: '', line: 'garbage'})

  expect(onEvent).toHaveBeenCalledTimes(1)
  expect(onEvent).toHaveBeenLastCalledWith({id: undefined, event: undefined, data: 'ok'})
})

test('a blank cr line ending a chunk dispatches the pending event exactly once', () => {
  const onEvent = vi.fn()
  const onError = vi.fn()
  const parser = createParser({onEvent, onError})

  // Stream is `data: one\r\r\n`: a data line, then a blank line whose `\r\n` is split
  // across chunks. Exactly one event must be dispatched.
  parser.feed('data: one\r')
  parser.feed('\r')
  parser.feed('\n')

  expect(onError).not.toHaveBeenCalled()
  expect(onEvent).toHaveBeenCalledTimes(1)
  expect(onEvent).toHaveBeenLastCalledWith({id: undefined, event: undefined, data: 'one'})
})

test('maxBufferSize: preserves unterminated comments when onComment callback exists', () => {
  const onEvent = vi.fn()
  const onError = vi.fn()
  const onComment = vi.fn()
  const parser = createParser({onEvent, onError, onComment, maxBufferSize: 64})

  parser.feed(':')
  parser.feed('preserved')
  parser.feed('\n')

  expect(onError).not.toHaveBeenCalled()
  expect(onComment).toHaveBeenCalledTimes(1)
  expect(onComment).toHaveBeenLastCalledWith('preserved')
})

test('maxBufferSize: triggers on data buffer overflow (no blank line)', () => {
  const onEvent = vi.fn()
  const onError = vi.fn()
  const parser = createParser({onEvent, onError, maxBufferSize: 32})

  // Each `data:` line appends its value to the event's data buffer. Without a
  // blank line, data accumulates unboundedly.
  for (let i = 0; i < 50; i++) {
    parser.feed(`data: chunk-${i}\n`)
    if (onError.mock.calls.length > 0) break
  }

  expect(onError).toHaveBeenCalledTimes(1)
  expect(onEvent).not.toHaveBeenCalled()

  const error = onError.mock.calls[0]?.[0]
  expect(error).toBeInstanceOf(ParseError)
  expect(error).toMatchObject({type: 'max-buffer-size-exceeded'})
})

test('maxBufferSize: feed throws after overflow, until reset', () => {
  const onEvent = vi.fn()
  const onError = vi.fn()
  const parser = createParser({onEvent, onError, maxBufferSize: 8})

  // The overflowing feed itself does not throw — it reports via onError.
  parser.feed('data: this is too long for the buffer')
  expect(onError).toHaveBeenCalledTimes(1)

  // Subsequent feeds throw, signalling that the parser is unusable.
  expect(() => parser.feed('data: hello\n\n')).toThrow(/max buffer size/)
  expect(() => parser.feed('data: world\n\n')).toThrow(/max buffer size/)
  expect(onEvent).not.toHaveBeenCalled()
  expect(onError).toHaveBeenCalledTimes(1)

  // After reset, the parser works again.
  parser.reset()
  parser.feed('data: hello\n\n')
  expect(onEvent).toHaveBeenCalledTimes(1)
  expect(onEvent).toHaveBeenLastCalledWith({id: undefined, event: undefined, data: 'hello'})
})

test('maxBufferSize: not triggered when events dispatch within the limit', () => {
  const onEvent = vi.fn()
  const onError = vi.fn()
  const parser = createParser({onEvent, onError, maxBufferSize: 64})

  // Lots of small events, each well under the limit and dispatched immediately.
  for (let i = 0; i < 100; i++) {
    parser.feed(`data: ${i}\n\n`)
  }

  expect(onError).not.toHaveBeenCalled()
  expect(onEvent).toHaveBeenCalledTimes(100)
})

test('maxBufferSize: undefined option means unbounded (default behavior)', () => {
  const onEvent = vi.fn()
  const onError = vi.fn()
  const parser = createParser({onEvent, onError})

  parser.feed(`data: ${'x'.repeat(1_000_000)}`)
  expect(onError).not.toHaveBeenCalled()
})

test('passing a function to `createParser` will throw with helpful error', () => {
  expect(() => {
    // @ts-expect-error Should not allow a function, typing-wise
    createParser(() => null)
  }).toThrowError(
    '`config` must be an object, got a function instead. Did you mean `createParser({onEvent: fn})`?',
  )
})

async function sha256(message: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(message)
  const hash = await crypto.subtle.digest('SHA-256', data)

  // Return hex
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}
