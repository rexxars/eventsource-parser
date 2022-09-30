export interface SseMessage {
  event?: string
  retry?: number
  id?: string
  data: string
}

export function formatEvent(message: SseMessage | string): string {
  const msg = typeof message === 'string' ? {data: message} : message

  let output = ''
  if (msg.event) {
    output += `event: ${msg.event}\n`
  }

  if (msg.retry) {
    output += `retry: ${msg.retry}\n`
  }

  if (typeof msg.id === 'string' || typeof msg.id === 'number') {
    output += `id: ${msg.id}\n`
  }

  output += encodeData(msg.data)

  return output
}

export function formatComment(comment: string): string {
  return `:${comment}\n\n`
}

export function encodeData(text: string): string {
  const data = String(text).replace(/(\r\n|\r|\n)/g, '\n')
  const lines = data.split(/\n/)

  let line = ''
  let output = ''

  for (let i = 0, l = lines.length; i < l; ++i) {
    line = lines[i]

    output += `data: ${line}`
    output += i + 1 === l ? '\n\n' : '\n'
  }

  return output
}
