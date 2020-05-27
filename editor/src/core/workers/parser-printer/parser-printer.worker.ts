import { ParserPrinterResultMessage, handleMessage } from './parser-printer-worker'

const ctx: Worker = self as any

function sendMessageWebWorker(content: ParserPrinterResultMessage) {
  ctx.postMessage(content)
}

ctx.addEventListener('message', (event: MessageEvent) => {
  handleMessage(event.data, sendMessageWebWorker)
})
