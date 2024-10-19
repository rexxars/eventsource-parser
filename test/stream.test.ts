import {encode} from 'eventsource-encoder'
import {expect, test} from 'vitest'

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
