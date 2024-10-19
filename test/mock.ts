import {expect, vi} from 'vitest'

import type {EventSourceMessage, ParserCallbacks} from '../src/types.ts'

interface MessageMatcher {
  id?: string | RegExp
  event?: string
  data?: string | RegExp
}

// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
export function getParseResultMock() {
  let messageIndex = -1
  const events: Array<
    | ({type: 'event'} & EventSourceMessage)
    | {type: 'reconnect-interval'; value: number}
    | {type: 'comment'; comment: string}
    | {type: 'error'; error: Error; message: string}
  > = []
  const fn = vi.fn((evt: EventSourceMessage) => events.push({type: 'event', ...evt}))

  const callbacks: ParserCallbacks = {
    onEvent: fn,
    onRetry: vi.fn((ms: number) => events.push({type: 'reconnect-interval', value: ms})),
    onComment: vi.fn((comment: string) => events.push({type: 'comment', comment})),
    onError: vi.fn((error: Error) => events.push({type: 'error', error, message: error.message})),
  }

  function messageMatches(index: number, evt: MessageMatcher) {
    const msg = events[index]
    if (!msg) {
      throw new Error(`No message found at index ${index}`)
    }

    if (msg.type !== 'event') {
      throw new Error(`Message at index ${index} was not an event`)
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
    callbacks,
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
