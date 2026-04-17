/**
 * EventSource/Server-Sent Events parser
 * @see https://html.spec.whatwg.org/multipage/server-sent-events.html
 */
import {ParseError} from './errors.ts'
import type {EventSourceParser, ParserCallbacks} from './types.ts'

// oxlint-disable-next-line no-unused-vars
function noop(_arg: unknown) {
  // intentional noop
}

/**
 * Creates a new EventSource parser.
 *
 * @param callbacks - Callbacks to invoke on different parsing events:
 *   - `onEvent` when a new event is parsed
 *   - `onError` when an error occurs
 *   - `onRetry` when a new reconnection interval has been sent from the server
 *   - `onComment` when a comment is encountered in the stream
 *
 * @returns A new EventSource parser, with `parse` and `reset` methods.
 * @public
 */
export function createParser(callbacks: ParserCallbacks): EventSourceParser {
  if (typeof callbacks === 'function') {
    throw new TypeError(
      '`callbacks` must be an object, got a function instead. Did you mean `{onEvent: fn}`?',
    )
  }

  const {onEvent = noop, onError = noop, onRetry = noop, onComment} = callbacks

  let incompleteLine = ''

  let isFirstChunk = true
  let id: string | undefined
  let data = ''
  let dataLines = 0
  let eventType: string | undefined

  function feed(chunk: string) {
    if (isFirstChunk) {
      isFirstChunk = false
      feedFirst(chunk)
      return
    }
    const input = incompleteLine === '' ? chunk : incompleteLine + chunk
    incompleteLine = processLines(input)
  }

  function feedFirst(chunk: string) {
    if (
      chunk.charCodeAt(0) === 0xef &&
      chunk.charCodeAt(1) === 0xbb &&
      chunk.charCodeAt(2) === 0xbf
    ) {
      chunk = chunk.slice(3)
    }
    const input = incompleteLine === '' ? chunk : incompleteLine + chunk
    incompleteLine = processLines(input)
  }

  function processLines(chunk: string): string {
    let searchIndex = 0

    if (chunk.indexOf('\r') === -1) {
      let lfIndex = chunk.indexOf('\n', searchIndex)
      while (lfIndex !== -1) {
        if (searchIndex === lfIndex) {
          if (dataLines > 0) {
            onEvent({id, event: eventType, data})
          }
          id = undefined
          data = ''
          dataLines = 0
          eventType = undefined
          searchIndex = lfIndex + 1
          lfIndex = chunk.indexOf('\n', searchIndex)
          continue
        }
        const fc = chunk.charCodeAt(searchIndex)
        if (isDataPrefix(chunk, searchIndex, fc)) {
          const vs = chunk.charCodeAt(searchIndex + 5) === 32 ? searchIndex + 6 : searchIndex + 5
          const value = chunk.slice(vs, lfIndex)
          if (dataLines === 0 && chunk.charCodeAt(lfIndex + 1) === 10) {
            onEvent({id, event: eventType, data: value})
            id = undefined
            data = ''
            eventType = undefined
            searchIndex = lfIndex + 2
            lfIndex = chunk.indexOf('\n', searchIndex)
            continue
          }
          data = dataLines === 0 ? value : `${data}\n${value}`
          dataLines++
        } else if (isEventPrefix(chunk, searchIndex, fc)) {
          eventType = chunk.slice(
            chunk.charCodeAt(searchIndex + 6) === 32 ? searchIndex + 7 : searchIndex + 6,
            lfIndex,
          ) || undefined
        } else {
          parseLine(chunk, searchIndex, lfIndex)
        }
        searchIndex = lfIndex + 1
        lfIndex = chunk.indexOf('\n', searchIndex)
      }
      return chunk.slice(searchIndex)
    }

    while (searchIndex < chunk.length) {
      const crIndex = chunk.indexOf('\r', searchIndex)
      const lfIndex = chunk.indexOf('\n', searchIndex)

      let lineEnd = -1
      if (crIndex !== -1 && lfIndex !== -1) {
        lineEnd = crIndex < lfIndex ? crIndex : lfIndex
      } else if (crIndex !== -1) {
        if (crIndex === chunk.length - 1) {
          lineEnd = -1
        } else {
          lineEnd = crIndex
        }
      } else if (lfIndex !== -1) {
        lineEnd = lfIndex
      }

      if (lineEnd === -1) {
        break
      }

      parseLine(chunk, searchIndex, lineEnd)
      searchIndex = lineEnd + 1
      if (chunk.charCodeAt(searchIndex - 1) === 13 && chunk.charCodeAt(searchIndex) === 10) {
        searchIndex++
      }
    }

    return chunk.slice(searchIndex)
  }

  function parseLine(chunk: string, start: number, end: number) {
    if (start === end) {
      dispatchEvent()
      return
    }

    const firstChar = chunk.charCodeAt(start)

    if (isDataPrefix(chunk, start, firstChar)) {
      const valueStart = chunk.charCodeAt(start + 5) === 32 ? start + 6 : start + 5
      const value = chunk.slice(valueStart, end)
      data = dataLines === 0 ? value : `${data}\n${value}`
      dataLines++
      return
    }

    if (isEventPrefix(chunk, start, firstChar)) {
      eventType =
        chunk.slice(chunk.charCodeAt(start + 6) === 32 ? start + 7 : start + 6, end) || undefined
      return
    }

    // 'i' = 105 — fast path for "id:"
    if (
      firstChar === 105 &&
      chunk.charCodeAt(start + 1) === 100 &&
      chunk.charCodeAt(start + 2) === 58
    ) {
      const value = chunk.slice(chunk.charCodeAt(start + 3) === 32 ? start + 4 : start + 3, end)
      id = value.includes('\0') ? undefined : value
      return
    }

    // ':' = 58 — comment
    if (firstChar === 58) {
      if (onComment) {
        const line = chunk.slice(start, end)
        onComment(line.slice(chunk.charCodeAt(start + 1) === 32 ? 2 : 1))
      }
      return
    }

    const line = chunk.slice(start, end)
    const fieldSeparatorIndex = line.indexOf(':')
    if (fieldSeparatorIndex !== -1) {
      const field = line.slice(0, fieldSeparatorIndex)
      const offset = line.charCodeAt(fieldSeparatorIndex + 1) === 32 ? 2 : 1
      const value = line.slice(fieldSeparatorIndex + offset)
      processField(field, value, line)
      return
    }

    processField(line, '', line)
  }

  function processField(field: string, value: string, line: string) {
    // Field names must be compared literally, with no case folding performed.
    switch (field) {
      case 'event':
        // Set the `event type` buffer to field value
        eventType = value || undefined
        break
      case 'data':
        data = dataLines === 0 ? value : `${data}\n${value}`
        dataLines++
        break
      case 'id':
        // If the field value does not contain U+0000 NULL, then set the `ID` buffer to
        // the field value. Otherwise, ignore the field.
        id = value.includes('\0') ? undefined : value
        break
      case 'retry':
        // If the field value consists of only ASCII digits, then interpret the field value as an
        // integer in base ten, and set the event stream's reconnection time to that integer.
        // Otherwise, ignore the field.
        if (/^\d+$/.test(value)) {
          onRetry(parseInt(value, 10))
        } else {
          onError(
            new ParseError(`Invalid \`retry\` value: "${value}"`, {
              type: 'invalid-retry',
              value,
              line,
            }),
          )
        }
        break
      default:
        // Otherwise, the field is ignored.
        onError(
          new ParseError(
            `Unknown field "${field.length > 20 ? `${field.slice(0, 20)}…` : field}"`,
            {type: 'unknown-field', field, value, line},
          ),
        )
        break
    }
  }

  function dispatchEvent() {
    if (dataLines > 0) {
      onEvent({
        id,
        event: eventType,
        data,
      })
    }

    id = undefined
    data = ''
    dataLines = 0
    eventType = undefined
  }

  function reset(options: {consume?: boolean} = {}) {
    if (incompleteLine && options.consume) {
      parseLine(incompleteLine, 0, incompleteLine.length)
    }

    isFirstChunk = true
    id = undefined
    data = ''
    dataLines = 0
    eventType = undefined
    incompleteLine = ''
  }

  return {feed, reset}
}

function isDataPrefix(chunk: string, i: number, fc: number): boolean {
  return (
    fc === 100 &&
    chunk.charCodeAt(i + 1) === 97 &&
    chunk.charCodeAt(i + 2) === 116 &&
    chunk.charCodeAt(i + 3) === 97 &&
    chunk.charCodeAt(i + 4) === 58
  )
}

function isEventPrefix(chunk: string, i: number, fc: number): boolean {
  return (
    fc === 101 &&
    chunk.charCodeAt(i + 1) === 118 &&
    chunk.charCodeAt(i + 2) === 101 &&
    chunk.charCodeAt(i + 3) === 110 &&
    chunk.charCodeAt(i + 4) === 116 &&
    chunk.charCodeAt(i + 5) === 58
  )
}

