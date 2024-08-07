import {encodeData, formatComment, formatEvent} from './format.ts'
import {MULTIBYTE_EMOJIS, MULTIBYTE_LINES} from './multibyte.ts'

type OnChunkCallback = (chunk: string) => void

const TEN_MEGABYTES = 1024 * 1024 * 10
const EMOJI_DATA = MULTIBYTE_EMOJIS.join(' ')
const DATA_CHUNK = encodeData(`${MULTIBYTE_LINES.join('\n\n')}\n${EMOJI_DATA}`).trim()
const DATA_CHUNK_LENGTH = new Blob([DATA_CHUNK]).size
const DATA_CHUNK_WAIT = Math.floor(1000 / (TEN_MEGABYTES / DATA_CHUNK_LENGTH))

export async function getBasicFixtureStream(onChunk: OnChunkCallback): Promise<void> {
  for (let i = 0; i < 5; i++) {
    onChunk(formatEvent({data: `${i}`}))
    await delay(250)
  }

  onChunk(formatEvent({event: 'done', data: '✔'}))
}

export async function getTimeFixtureStream(onChunk: OnChunkCallback): Promise<void> {
  for (let i = 0; i < 5; i++) {
    onChunk(formatEvent({event: 'time', data: new Date().toISOString()}))
    await delay(250)
  }

  onChunk(formatEvent({event: 'done', data: '✔'}))
}

export async function getTimeFixtureStreamChunked(onChunk: OnChunkCallback): Promise<void> {
  for (let i = 0; i < 30; i++) {
    await enqueRandomChunks(
      formatEvent({id: randomString(), event: 'time', data: new Date().toISOString()}),
      onChunk,
    )
  }
}

export async function getIdentifiedFixtureStream(
  start: number,
  onChunk: OnChunkCallback,
): Promise<void> {
  for (let id = start; id < start + 2; id++) {
    onChunk(formatEvent({event: 'tick', data: `${id}`, id: `${id}`, retry: 50}))
    await delay(15)
  }

  if (start >= 4) {
    onChunk(formatEvent({event: 'done', data: '✔'}))
  }
}

export async function getHeartbeatsFixtureStream(onChunk: OnChunkCallback): Promise<void> {
  for (let i = 0; i < 5; i++) {
    onChunk(formatComment(' ♥'))
    onChunk(formatEvent(String.fromCharCode(65 + i)))
    await delay(15)
  }

  onChunk(formatEvent({event: 'done', data: '✔'}))
}

export async function getMultilineFixtureStream(onChunk: OnChunkCallback): Promise<void> {
  onChunk('event: stock\n')
  onChunk('data: YHOO\n')
  onChunk('data: +2\n')
  onChunk('data: 10\n\n')

  await delay(250)

  onChunk('event: stock\n')
  onChunk('data: GOOG\n')
  onChunk('data: -8\n')
  onChunk('data: 1881\n\n')

  onChunk(formatEvent({event: 'done', data: '✔'}))
}

export async function getMultibyteFixtureStream(onChunk: OnChunkCallback): Promise<void> {
  const emojis = MULTIBYTE_EMOJIS
  const lines = MULTIBYTE_LINES
  const emojisPerMessage = Math.ceil(emojis.length / lines.length)

  for (let i = 0; i < lines.length; i++) {
    const split = i % 2 === 0 // Split into separate data chunks in the case of even lines
    const linejis = emojis
      .slice(emojisPerMessage * i, emojisPerMessage * i + emojisPerMessage)
      .join(' ')
    const line = `${lines[i]} ${linejis}`
    onChunk(`id: ${i}\n`)
    if (split) {
      onChunk(`data:${line.slice(0, 5)}\n`)
      onChunk(`data:${line.slice(5)}\n\n`)
    } else {
      onChunk(`data:${line}\n\n`)
    }
    await delay(50)
  }

  onChunk(formatEvent({event: 'done', data: '✔'}))
}

export async function getMultibyteEmptyLineFixtureStream(onChunk: OnChunkCallback): Promise<void> {
  await delay(1)

  onChunk('\n\n\n\nid: 1\ndata: 我現在都看實況不玩遊戲\n\n')
  onChunk(formatEvent({event: 'done', data: '✔'}))
}

export async function getInvalidBomFixtureStream(onChunk: OnChunkCallback): Promise<void> {
  await delay(1)

  onChunk('\uFEFFdata: bomful 1\n\n')
  onChunk('\uFEFFdata: bomful 2\n\n')
  onChunk('data: bomless 3\n\n')
  onChunk(formatEvent({event: 'done', data: '✔'}))
}

export async function getBomFixtureStream(onChunk: OnChunkCallback): Promise<void> {
  await delay(1)

  const bom = [239, 187, 191].map((ascii) => String.fromCharCode(ascii)).join('')

  onChunk(`${bom}data: bomful 1\n\n`)
  onChunk(`${bom}data: bomful 2\n\n`)
  onChunk('data: bomless 3\n\n')
  onChunk(formatEvent({event: 'done', data: '✔'}))
}

export async function getCarriageReturnFixtureStream(onChunk: OnChunkCallback): Promise<void> {
  await delay(1)

  onChunk('data: dog\r')
  onChunk('data: bark\r\r')

  onChunk('data: cat\r')
  onChunk('data: meow\r\r')

  onChunk(formatEvent({event: 'done', data: '✔'}))
}

export async function getLineFeedFixtureStream(onChunk: OnChunkCallback): Promise<void> {
  await delay(1)

  onChunk('data: cow\n')
  onChunk('data: moo\n\n')

  onChunk('data: horse\n')
  onChunk('data: neigh\n\n')

  onChunk(formatEvent({event: 'done', data: '✔'}))
}

export async function getCarriageReturnLineFeedFixtureStream(
  onChunk: OnChunkCallback,
): Promise<void> {
  await delay(1)

  onChunk('data: sheep\r\n')
  onChunk('data: bleat\r\n\r\n')

  onChunk('data: pig\r\n')
  onChunk('data: oink\r\n\r\n')

  onChunk(formatEvent({event: 'done', data: '✔'}))
}

export async function getCommentsFixtureStream(onChunk: OnChunkCallback): Promise<void> {
  onChunk(': Hello\n\n')
  onChunk(':'.repeat(300))
  onChunk('\n')
  await delay(250)

  onChunk('data: First\n\n')
  onChunk(': Первый')
  await delay(250)

  onChunk(': 第二')
  onChunk('\n')
  onChunk('data: Second\n\n')
  await delay(250)

  for (let i = 0; i < 10; i++) {
    onChunk(': Moop \n')
  }

  onChunk(': ثالث')
  onChunk('\n')
  onChunk('data: Third\n\n')
  await delay(250)

  onChunk(':നാലാമത്തെ')
  onChunk('\n')
  onChunk('data: Fourth\n\n')
  await delay(250)

  onChunk(`: ${MULTIBYTE_EMOJIS.slice(0, 100).join(' ')} :`)
  onChunk('\n')
  onChunk('data: Fifth\n\n')

  onChunk(formatEvent({event: 'done', data: '✔'}))
}

export async function getMixedCommentsFixtureStream(onChunk: OnChunkCallback): Promise<void> {
  const longString = 'x'.repeat(2 * 1024 + 1)
  onChunk('data:1\r\r:\0\n:\r\ndata:2\n\n:')

  await delay(50)

  onChunk(longString)

  await delay(50)

  onChunk('\rdata:3\n\n:data:fail\r:')
  onChunk(longString)

  await delay(50)

  onChunk('\ndata:4\n\n')
  await delay(250)

  onChunk('data:5')
  await delay(250)
}

export async function getEmptyEventsFixtureStream(onChunk: OnChunkCallback): Promise<void> {
  await delay(1)

  onChunk('event:\ndata: Hello 1\n\n')
  onChunk('event:\n\n')
  onChunk(formatEvent({event: 'done', data: '✔'}))
}

export async function getEmptyRetryFixtureStream(
  last: number | undefined,
  onChunk: OnChunkCallback,
): Promise<void> {
  await delay(1)

  if (!last) {
    onChunk(formatEvent({id: '1', retry: 500, data: '🥌'}))
  } else if (last === 1) {
    onChunk('id:2\nretry:\ndata:🧹\n\n')
  } else {
    onChunk(formatEvent({id: '3', data: '✅'}))
  }
}

export async function getDataFieldParsingFixtureStream(onChunk: OnChunkCallback): Promise<void> {
  await delay(1)

  onChunk('data:\n\ndata\ndata\n\ndata:test\n\n')
  onChunk(formatEvent({event: 'done', data: '✔'}))
}

export async function getInvalidRetryFixtureStream(onChunk: OnChunkCallback): Promise<void> {
  await delay(1)

  onChunk('retry:1000\nretry:2000x\ndata:x\n\n')
}

export async function getUnknownFieldsFixtureStream(onChunk: OnChunkCallback): Promise<void> {
  await delay(1)

  onChunk('data:abc\n data\ndata\nfoobar:xxx\njustsometext\n:thisisacommentyay\ndata:123\n\n')
  onChunk(formatEvent({event: 'done', data: '✔'}))
}

export async function getHugeMessageFixtureStream(onChunk: OnChunkCallback): Promise<void> {
  onChunk(': hello\n\n')

  let written = 0
  while (written < TEN_MEGABYTES) {
    onChunk(DATA_CHUNK)
    written += DATA_CHUNK_LENGTH
    await delay(DATA_CHUNK_WAIT)
  }

  onChunk('\n\n')
  onChunk(': END-OF-STREAM\n\n')
  onChunk(
    formatEvent({
      event: 'done',
      data: 'e094a44a2436226ea9feb04e413a28de012b406012ec0eb6b37ad0a19d403660',
    }),
  )
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function randomString() {
  return `${Math.floor(Math.random() * 1e12)}`
}

function randomDelay(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, Math.ceil(Math.random() * 30)))
}

function getRandomChunks(input: string): [string, string] {
  const splitAt = Math.floor(Math.random() * Math.floor(input.length))
  return [input.slice(0, splitAt), input.slice(splitAt)]
}

async function enqueRandomChunks(input: string, onChunk: OnChunkCallback) {
  const [start, end] = getRandomChunks(input)
  onChunk(start)
  await randomDelay()
  onChunk(end)
}
