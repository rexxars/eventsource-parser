import {createHash} from 'node:crypto'

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

test('stream containing (invalid?) byte-order mark (multiple places)', async () => {
  const mock = getParseResultMock()
  const parser = createParser({onEvent: mock.onParse})
  await getInvalidBomFixtureStream(parser.feed)
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
  if (hugeMsg.type !== 'event') {
    throw new Error('First message was not an event')
  }

  expect(hugeMsg.data.length).toBe(4808512)

  const receivedHash = createHash('sha256').update(hugeMsg.data).digest('hex')
  const hashMsg = mock.events[1]
  if (hashMsg.type !== 'event') {
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

test('calls onError when the stream is invalid but not newline-terminated (through `reset() with `consume: true`)', async () => {
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
  expect(onError).toHaveBeenCalled()

  const error = onError.mock.calls[0][0]
  expect(error).toBeInstanceOf(ParseError)
  expect(error).toMatchObject({
    type: 'unknown-field',
    field: '{"error"',
    value: `"Internal Server Error","message":"The server could not process your request"}`,
    line: `{"error":"Internal Server Error","message":"The server could not process your request"}`,
  })
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

  const error = onError.mock.calls[0][0]
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

  const error = onError.mock.calls[0][0]
  expect(error).toBeInstanceOf(ParseError)
  expect(error).toMatchObject({
    type: 'unknown-field',
    field: 'Well, this is not what I expected',
    value: '',
    line: 'Well, this is not what I expected',
  })
})
