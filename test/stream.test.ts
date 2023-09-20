import {test, expect} from 'vitest'
import {EventSourceParserStream, ParsedEvent} from '../src/stream.js'
import {formatEvent} from './format.js'

test('can use `EventSourceParserStream`', async () => {
  let fixture = ''
  for (let i = 0; i < 10; i++) {
    fixture += formatEvent({data: `Hello ${i}`, event: 'foo', id: `evt-${i}`})
  }

  const response = new Response(fixture)
  if (!response.body) {
    throw new Error('No body')
  }

  const eventStream = response.body
    .pipeThrough(new TextDecoderStream())
    .pipeThrough(new EventSourceParserStream())
    .getReader()

  const chunks: ParsedEvent[] = []
  for (;;) {
    const {done, value} = await eventStream.read()
    if (!done) {
      chunks.push(value)
      continue
    }

    expect(chunks).toHaveLength(10)
    expect(chunks[0]).toMatchInlineSnapshot(`
      {
        "data": "Hello 0",
        "event": "foo",
        "id": "evt-0",
        "type": "event",
      }
    `)
    expect(chunks[9]).toMatchInlineSnapshot(`
      {
        "data": "Hello 9",
        "event": "foo",
        "id": "evt-9",
        "type": "event",
      }
    `)
    return
  }
})
