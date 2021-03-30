import { extractFile } from '../core/model/project-file-utils'
import { FileResult } from '../core/shared/file-utils'
import { CopyData } from './clipboard'

export interface PasteResult {
  utopiaData: CopyData[]
  files: Array<FileResult>
}

export async function parsePasteEvent(clipboardData: DataTransfer | null): Promise<PasteResult> {
  if (clipboardData == null) {
    return {
      files: [],
      utopiaData: [],
    }
  }
  const utopiaData = extractUtopiaDataFromClipboardData(clipboardData)
  if (utopiaData.length > 0) {
    return {
      files: [],
      utopiaData: utopiaData,
    }
  } else {
    const items = clipboardData.items
    const imageArray = await extractFiles(items)
    return {
      files: imageArray,
      utopiaData: [],
    }
  }
}

function extractFiles(items: DataTransferItemList): Promise<Array<FileResult>> {
  const fileItems = Array.from(items).filter((item) => item.kind === 'file')
  return Promise.all<FileResult>(
    fileItems.map((item) => {
      const file = item.getAsFile()
      if (file == null) {
        return Promise.reject('Could not extract file.')
      } else {
        return extractFile(file)
      }
    }),
  )
}

function filterNone(node: Node) {
  return NodeFilter.FILTER_ACCEPT
}

const UtopiaDataPrefix = '(utopia)'
const UtopiaPrefixLength = UtopiaDataPrefix.length
const UtopiaDataPostfix = '(/utopia)'
const UtopiaPostfixLength = UtopiaDataPostfix.length

function extractUtopiaDataFromClipboardData(data: DataTransfer): Array<CopyData> {
  const htmlString = data.getData('text/html')
  if (htmlString !== '') {
    return extractUtopiaDataFromHtml(htmlString)
  } else {
    return []
  }
}

function extractUtopiaDataFromHtml(htmlString: string): Array<CopyData> {
  const comments: string[] = []
  // parse them html
  const htmlElement = document.createElement('html')
  htmlElement.innerHTML = htmlString

  // extract comments
  const iterator = document.createNodeIterator(
    htmlElement,
    NodeFilter.SHOW_COMMENT,
    filterNone as any,
  )
  let currentNode: Node | null
  // tslint:disable-next-line:no-conditional-assignment
  while ((currentNode = iterator.nextNode())) {
    if (currentNode != null && currentNode.nodeValue) {
      comments.push(currentNode.nodeValue)
    }
  }

  // parse comments, look for Utopia Data
  // HACK we only take the first comment! (we are assuming there's only one comment)
  const utopiaDataString = comments
    .filter((comment) => comment.indexOf('(utopia)') === 0)
    .map((utopiaComment) =>
      utopiaComment.substring(UtopiaPrefixLength, utopiaComment.length - UtopiaPostfixLength),
    )[0]
  if (utopiaDataString != null) {
    try {
      const decodedString = decodeURIComponent(utopiaDataString)
      const utopiaData = JSON.parse(decodedString)
      return utopiaData
    } catch (e) {
      console.error('error parsing pasted JSON', e)
    }
  }
  return []
}

export function encodeUtopiaDataToHtml(data: Array<CopyData>): string {
  const utopiaDataString = JSON.stringify(data)
  const encodedData = encodeURIComponent(utopiaDataString)
  const htmlWithData = `<meta charset="utf-8"><!--${UtopiaDataPrefix}${encodedData}${UtopiaDataPostfix}-->`
  return htmlWithData
}
