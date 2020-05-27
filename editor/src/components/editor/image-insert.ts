import { extractImage } from '../../utils/clipboard-utils'
import { EditorDispatch } from './action-types'
import * as EditorActions from './actions/actions'
import * as stringHash from 'string-hash'

function handleImageSelected(
  files: FileList | null,
  dispatch: EditorDispatch,
  createImageElement: boolean,
) {
  if (files != null && files.length === 1) {
    const file = files[0]
    extractImage(file)
      .then((result) => {
        const mimeStrippedBase64 = result.dataUrl.split(',')[1]
        const afterSave = createImageElement
          ? EditorActions.saveImageSwitchMode()
          : EditorActions.saveImageDoNothing()
        const hash = stringHash(mimeStrippedBase64)
        const saveImageAction = EditorActions.saveAsset(
          `assets/${result.filename}`,
          file.type,
          mimeStrippedBase64,
          hash,
          EditorActions.saveImageDetails(result.size, afterSave),
        )
        dispatch([saveImageAction], 'everyone')
      })
      .catch((failure) => {
        console.error(failure)
      })
      .finally(() => {
        removeFileDialogTrigger()
      })
  }
}

const fileDialogInputId: string = 'filedialoginput'

let inputElement: HTMLInputElement | null = null

function createFileDialogTrigger(
  dispatch: EditorDispatch,
  createImageElement: boolean,
): HTMLInputElement {
  removeFileDialogTrigger()
  inputElement = document.createElement('input')
  inputElement.id = fileDialogInputId
  inputElement.type = 'file'
  inputElement.accept = 'image/*'
  inputElement.style.display = 'none'
  inputElement.onchange = () => {
    if (inputElement != null) {
      handleImageSelected(inputElement.files, dispatch, createImageElement)
    }
  }
  document.body.appendChild(inputElement)
  return inputElement
}

function removeFileDialogTrigger() {
  if (inputElement != null) {
    document.body.removeChild(inputElement)
  }
  inputElement = null
}

export function insertImage(dispatch: EditorDispatch): void {
  const element = createFileDialogTrigger(dispatch, true)
  element.click()
}

export function addImageToAssets(dispatch: EditorDispatch): void {
  const element = createFileDialogTrigger(dispatch, false)
  element.click()
}
