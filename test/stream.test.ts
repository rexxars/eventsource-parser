import {encode} from 'eventsource-encoder'
import {expect, test, vi} from 'vitest'

import {ParseError} from '../src/errors.ts'
import {type EventSourceMessage, EventSourceParserStream} from '../src/stream.ts'

test('can use `EventSourceParserStream`', async () => {
  let fixture = ''
  for (let i = 0; i < 10; i++) {
    fixture += encode({data: `Hello ${i}`, event: 'foo', id: `evt-${i}`})
  }

  const response = new Response(fixture)
  if (!response.body) {
    throw new Error('No body')
  }

  const eventStream = response.body
    .pipeThrough(new TextDecoderStream())
    .pipeThrough(new EventSourceParserStream())
    .getReader()

  const chunks: EventSourceMessage[] = []
  for (;;) {
    const {done, value} = await eventStream.read()
    if (!done) {
      chunks.push(value)
      continue
    }

    expect(chunks).toHaveLength(10)
    expect(chunks[0]).toMatchObject({
      data: 'Hello 0',
      event: 'foo',
      id: 'evt-0',
    })
    expect(chunks[9]).toMatchObject({
      data: 'Hello 9',
      event: 'foo',
      id: 'evt-9',
    })
    return
  }
})

test('maxBufferSize: terminates the stream when onError is `terminate`', async () => {
  const response = new Response('x'.repeat(1024))
  if (!response.body) {
    throw new Error('No body')
  }

  const eventStream = response.body
    .pipeThrough(new TextDecoderStream())
    .pipeThrough(new EventSourceParserStream({maxBufferSize: 64, onError: 'terminate'}))
    .getReader()

  await expect(eventStream.read()).rejects.toBeInstanceOf(ParseError)
})

test('maxBufferSize: invokes custom onError function and errors the stream', async () => {
  const onError = vi.fn()
  const response = new Response('x'.repeat(1024))
  if (!response.body) {
    throw new Error('No body')
  }

  const eventStream = response.body
    .pipeThrough(new TextDecoderStream())
    .pipeThrough(new EventSourceParserStream({maxBufferSize: 64, onError}))
    .getReader()

  // Overflow is fatal, so the stream errors even though `onError` is a function
  // (not 'terminate'). The user's `onError` still fires so they can observe the error.
  await expect(eventStream.read()).rejects.toMatchObject({
    type: 'max-buffer-size-exceeded',
  })

  expect(onError).toHaveBeenCalled()
  const error = onError.mock.calls[0]?.[0]
  expect(error).toBeInstanceOf(ParseError)
  expect(error).toMatchObject({type: 'max-buffer-size-exceeded'})
})
