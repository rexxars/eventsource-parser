import {createHash} from 'node:crypto'

import {expect, test, vi} from 'vitest'

import {createParser} from '../src/parse.ts'
import type {ParsedEvent, ReconnectInterval} from '../src/types.ts'
import {
  getBasicFixtureStream,
  getBomFixtureStream,
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
  getLineFeedFixtureStream,
  getMixedCommentsFixtureStream,
  getMultibyteEmptyLineFixtureStream,
  getMultibyteFixtureStream,
  getMultilineFixtureStream,
  getTimeFixtureStream,
  getTimeFixtureStreamChunked,
  getUnknownFieldsFixtureStream,
} from './fixtures.ts'

test('basic unnamed events stream', async () => {
  const mock = getParseResultMock()
  const parser = createParser(mock.onParse)
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
  const parser = createParser(mock.onParse)
  await getTimeFixtureStream(parser.feed)

  mock.expectNumberOfMessagesToBe(6)
  mock.expectNextMessage({event: 'time', data: /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/})
})

test('stream of `time` event names, unbalanced chunks', async () => {
  const mock = getParseResultMock()
  const parser = createParser(mock.onParse)
  await getTimeFixtureStreamChunked(parser.feed)

  while (mock.hasNextMessage()) {
    mock.expectNextMessage({event: 'time', data: /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/})
  }
})

test('stream of identified messanges + retry interval', async () => {
  const mock = getParseResultMock()
  const parser = createParser(mock.onParse)
  await getIdentifiedFixtureStream(1337, parser.feed)

  expect(mock.events[0]).toMatchObject({type: 'reconnect-interval', value: 50})
  expect(mock.events[1]).toMatchObject({type: 'event', id: '1337', event: 'tick', data: '1337'})
  expect(mock.events[2]).toMatchObject({type: 'reconnect-interval', value: 50})
  expect(mock.events[3]).toMatchObject({type: 'event', id: '1338', event: 'tick', data: '1338'})
})

test('stream of "heartbeat" comments, unnamed events', async () => {
  const mock = getParseResultMock()
  const parser = createParser(mock.onParse)
  await getHeartbeatsFixtureStream(parser.feed)

  for (let char = 65; char < 70; char++) {
    mock.expectNextMessage({data: String.fromCharCode(char)})
  }

  mock.expectNextMessage({event: 'done', data: '✔'})
})

test('stream of multi-line data events', async () => {
  const mock = getParseResultMock()
  const parser = createParser(mock.onParse)
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
  const parser = createParser(mock.onParse)
  await getMultibyteFixtureStream(parser.feed)
  for (const event of mock.events) {
    expect(event).toMatchSnapshot()
  }
})

test('stream of multi-byte events with some empty lines thrown in', async () => {
  const mock = getParseResultMock()
  const parser = createParser(mock.onParse)
  await getMultibyteEmptyLineFixtureStream(parser.feed)

  mock.expectNextMessage({data: '我現在都看實況不玩遊戲'})
  mock.expectNextMessage({event: 'done'})
})

test('stream containing (invalid?) byte-order mark (multiple places)', async () => {
  const mock = getParseResultMock()
  const parser = createParser(mock.onParse)
  await getInvalidBomFixtureStream(parser.feed)
  mock.expectNextMessage({data: 'bomless 3'})
  mock.expectNextMessage({event: 'done'})
})

test('stream containing byte-order mark (multiple places)', async () => {
  const mock = getParseResultMock()
  const parser = createParser(mock.onParse)
  await getBomFixtureStream(parser.feed)
  mock.expectNextMessage({data: 'bomful 1'})
  mock.expectNextMessage({data: 'bomless 3'})
  mock.expectNextMessage({event: 'done'})
})

test('stream using carriage returns', async () => {
  const mock = getParseResultMock()
  const parser = createParser(mock.onParse)
  await getCarriageReturnFixtureStream(parser.feed)
  mock.expectNextMessage({data: 'dog\nbark'})
  mock.expectNextMessage({data: 'cat\nmeow'})
  mock.expectNextMessage({event: 'done'})
})

test('stream using line feeds', async () => {
  const mock = getParseResultMock()
  const parser = createParser(mock.onParse)
  await getLineFeedFixtureStream(parser.feed)
  mock.expectNextMessage({data: 'cow\nmoo'})
  mock.expectNextMessage({data: 'horse\nneigh'})
  mock.expectNextMessage({event: 'done'})
})

test('stream using carriage returns and line feeds', async () => {
  const mock = getParseResultMock()
  const parser = createParser(mock.onParse)
  await getCarriageReturnLineFeedFixtureStream(parser.feed)
  mock.expectNextMessage({data: 'sheep\nbleat'})
  mock.expectNextMessage({data: 'pig\noink'})
  mock.expectNextMessage({event: 'done'})
})

test('stream with varying odd uses of comments', async () => {
  const mock = getParseResultMock()
  const parser = createParser(mock.onParse)
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
  const parser = createParser(mock.onParse)
  await getMixedCommentsFixtureStream(parser.feed)
  mock.expectNextMessage({data: '1'})
  mock.expectNextMessage({data: '2\n3\n4'})
})

test('stream with empty `event` field', async () => {
  const mock = getParseResultMock()
  const parser = createParser(mock.onParse)
  await getEmptyEventsFixtureStream(parser.feed)
  mock.expectNextMessage({data: 'Hello 1', event: undefined})
  mock.expectNextMessage({data: '✔', event: 'done'})
})

test('stream with empty `retry` field', async () => {
  const mock = getParseResultMock()
  const parser = createParser(mock.onParse)
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
    data: '🧹',
    event: undefined,
    id: '2',
    type: 'event',
  })
  expect(mock.events[3]).toMatchObject({
    data: '✅',
    event: undefined,
    id: '3',
    type: 'event',
  })
})

test('stream with oddly shaped data field', async () => {
  const mock = getParseResultMock()
  const parser = createParser(mock.onParse)
  await getDataFieldParsingFixtureStream(parser.feed)
  mock.expectNextMessage({data: ''})
  mock.expectNextMessage({data: '\n'})
  mock.expectNextMessage({data: 'test'})
})

test('stream with partially incorrect retry fields', async () => {
  const mock = getParseResultMock()
  const parser = createParser(mock.onParse)
  await getInvalidRetryFixtureStream(parser.feed)
  expect(mock.events[0]).toMatchObject({type: 'reconnect-interval', value: 1000})
  expect(mock.events[1]).toMatchObject({type: 'reconnect-interval', value: 2000})
  expect(mock.events[2]).toMatchObject({type: 'event', data: 'x', event: undefined})
  mock.expectNumberOfMessagesToBe(3)
})

test('stream with unknown fields in the stream', async () => {
  const mock = getParseResultMock()
  const parser = createParser(mock.onParse)
  await getUnknownFieldsFixtureStream(parser.feed)
  mock.expectNextMessage({event: undefined, data: 'abc\n\n123'})
})

test('stream with huge data chunks', async () => {
  const mock = getParseResultMock()
  const parser = createParser(mock.onParse)
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

interface MessageMatcher {
  id?: string | RegExp
  event?: string
  data?: string | RegExp
}

function getParseResultMock() {
  let messageIndex = -1
  const events: (ParsedEvent | ReconnectInterval)[] = []
  const fn = vi.fn((evt: ParsedEvent | ReconnectInterval) => events.push(evt))

  function messageMatches(index: number, evt: MessageMatcher) {
    const msg = events[index]
    if (!msg) {
      throw new Error(`No message found at index ${index}`)
    }

    if (msg.type !== 'event') {
      throw new Error(`Expected parse result of type "event", got "${msg.type}"`)
    }

    if ('id' in evt) {
      if (evt.id instanceof RegExp) {
        expect(msg.id).toMatch(evt.id)
      } else {
        expect(msg.id).toBe(evt.id)
      }
    }

    if ('event' in evt) {
      expect(msg.event).toBe(evt.event)
    }

    if ('data' in evt) {
      if (evt.data instanceof RegExp) {
        expect(msg.data).toMatch(evt.data)
      } else {
        expect(msg.data).toBe(evt.data)
      }
    }
  }

  return {
    onParse: fn,
    events,
    hasNextMessage() {
      return events.length > messageIndex + 1
    },
    expectMessageAtIndexToMatch(index: 0, evt: MessageMatcher) {
      return messageMatches(index, evt)
    },
    expectNextMessage(evt: MessageMatcher) {
      messageIndex++
      return messageMatches(messageIndex, evt)
    },
    expectNumberOfMessagesToBe(num: number) {
      return expect(fn).toBeCalledTimes(num)
    },
  }
}
