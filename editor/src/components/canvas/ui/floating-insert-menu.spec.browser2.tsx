import { act, fireEvent, queryByAttribute } from '@testing-library/react'
import { FOR_TESTS_setNextGeneratedUid } from '../../../core/model/element-template-utils.test-utils'
import { BakedInStoryboardUID } from '../../../core/model/scene-utils'
import * as EP from '../../../core/shared/element-path'
import { expectSingleUndo2Saves, selectComponentsForTest } from '../../../utils/utils.test-utils'
import { mouseClickAtPoint, pressKey } from '../event-helpers.test-utils'
import {
  EditorRenderResult,
  getPrintedUiJsCode,
  makeTestProjectCodeWithSnippet,
  renderTestEditorWithCode,
  TestAppUID,
  TestSceneUID,
} from '../ui-jsx.test-utils'
import { FloatingMenuTestId } from './floating-insert-menu'
import { expectNoAction } from '../../../utils/utils.test-utils'

describe('Floating insert menu', () => {
  it('can insert a conditional via the floating insert menu', async () => {
    const editor = await renderTestEditorWithCode(
      makeTestProjectCodeWithSnippet(`<div
    style={{
      backgroundColor: '#aaaaaa33',
      position: 'absolute',
      left: 57,
      top: 168,
      width: 247,
      height: 402,
    }}
    data-uid='container'
  >
    <div data-uid='a3d' />
  </div>`),
      'await-first-dom-report',
    )

    await selectComponentsForTest(editor, [
      EP.fromString(`${BakedInStoryboardUID}/${TestSceneUID}/${TestAppUID}:container`),
    ])

    await insertViaAddElementPopup(editor, 'cond')

    expect(getPrintedUiJsCode(editor.getEditorState())).toEqual(
      makeTestProjectCodeWithSnippet(`<div
    style={{
      backgroundColor: '#aaaaaa33',
      position: 'absolute',
      left: 57,
      top: 168,
      width: 247,
      height: 402,
    }}
    data-uid='container'
  >
    <div data-uid='a3d' />
    {true ? null : null}
  </div>`),
    )
  })

  it('can insert a fragment via the floating insert menu', async () => {
    const editor = await renderTestEditorWithCode(
      makeTestProjectCodeWithSnippet(`<div
    style={{
      backgroundColor: '#aaaaaa33',
      position: 'absolute',
      left: 57,
      top: 168,
      width: 247,
      height: 402,
    }}
    data-uid='container'
  >
    <div data-uid='a3d' />
  </div>`),
      'await-first-dom-report',
    )

    await selectComponentsForTest(editor, [
      EP.fromString(`${BakedInStoryboardUID}/${TestSceneUID}/${TestAppUID}:container`),
    ])

    await insertViaAddElementPopup(editor, 'frag')

    expect(getPrintedUiJsCode(editor.getEditorState())).toEqual(
      makeTestProjectCodeWithSnippet(`<div
    style={{
      backgroundColor: '#aaaaaa33',
      position: 'absolute',
      left: 57,
      top: 168,
      width: 247,
      height: 402,
    }}
    data-uid='container'
  >
    <div data-uid='a3d' />
    <React.Fragment />
  </div>`),
    )
  })

  it('can insert a div via the floating insert menu', async () => {
    const editor = await renderTestEditorWithCode(
      makeTestProjectCodeWithSnippet(`<div
    style={{
      backgroundColor: '#aaaaaa33',
      position: 'absolute',
      left: 57,
      top: 168,
      width: 247,
      height: 402,
    }}
    data-uid='container'
  >
    <div data-uid='a3d' />
  </div>`),
      'await-first-dom-report',
    )

    await selectComponentsForTest(editor, [
      EP.fromString(`${BakedInStoryboardUID}/${TestSceneUID}/${TestAppUID}:container`),
    ])

    FOR_TESTS_setNextGeneratedUid('new-div')

    await insertViaAddElementPopup(editor, 'div')

    expect(getPrintedUiJsCode(editor.getEditorState())).toEqual(
      makeTestProjectCodeWithSnippet(`<div
    style={{
      backgroundColor: '#aaaaaa33',
      position: 'absolute',
      left: 57,
      top: 168,
      width: 247,
      height: 402,
    }}
    data-uid='container'
  >
    <div data-uid='a3d' />
    <div
        style={{
            backgroundColor: '#aaaaaa33',
            position: 'absolute'
        }}
        data-uid='new-div'
    />

  </div>`),
    )
  })

  it('can insert a span with sample text', async () => {
    const editor = await renderTestEditorWithCode(
      makeTestProjectCodeWithSnippet(`<div
    style={{
      backgroundColor: '#aaaaaa33',
      position: 'absolute',
      left: 57,
      top: 168,
      width: 247,
      height: 402,
    }}
    data-uid='container'
  >
    <div data-uid='a3d' />
  </div>`),
      'await-first-dom-report',
    )

    await selectComponentsForTest(editor, [
      EP.fromString(`${BakedInStoryboardUID}/${TestSceneUID}/${TestAppUID}:container`),
    ])

    FOR_TESTS_setNextGeneratedUid('sample-text')

    await insertViaAddElementPopup(editor, 'sampl')

    expect(getPrintedUiJsCode(editor.getEditorState())).toEqual(
      makeTestProjectCodeWithSnippet(`<div
    style={{
      backgroundColor: '#aaaaaa33',
      position: 'absolute',
      left: 57,
      top: 168,
      width: 247,
      height: 402,
    }}
    data-uid='container'
  >
    <div data-uid='a3d' />
    <span data-uid='sample-text'>Sample text</span>
  </div>`),
    )
  })

  describe('add element to conditional', () => {
    it(`can't add element to the root of a conditional`, async () => {
      const editor = await renderTestEditorWithCode(
        makeTestProjectCodeWithSnippet(`
        <div data-uid='container'>
        {
          // @utopia/uid=conditional
          [].length === 0 ? null : "Hello there"
        }
        </div>
        `),
        'await-first-dom-report',
      )

      const initialCode = getPrintedUiJsCode(editor.getEditorState())

      const slot = editor.renderedDOM.getByText('Conditional')
      await mouseClickAtPoint(slot, { x: 5, y: 5 })

      expect(editor.getEditorState().editor.selectedViews.map(EP.toString)).toEqual([
        'utopia-storyboard-uid/scene-aaa/app-entity:container/conditional',
      ])

      await expectNoAction(editor, () => insertViaAddElementPopup(editor, 'img'))

      expect(getPrintedUiJsCode(editor.getEditorState())).toEqual(initialCode)
      expectChildrenNotSupportedToastToBePresent(editor)
    })
    it('add element to true branch of a conditional', async () => {
      const editor = await renderTestEditorWithCode(
        makeTestProjectCodeWithSnippet(`
        <div data-uid='container'>
        {
          // @utopia/uid=conditional
          [].length === 0 ? null : "Hello there"
        }
        </div>
        `),
        'await-first-dom-report',
      )

      FOR_TESTS_setNextGeneratedUid('newly-added-img')

      await clickEmptySlot(editor)
      await expectSingleUndo2Saves(editor, () => insertViaAddElementPopup(editor, 'img'))

      expect(editor.getEditorState().editor.selectedViews.map(EP.toString)).toEqual([
        'utopia-storyboard-uid/scene-aaa/app-entity:container/conditional/newly-added-img',
      ])

      expect(getPrintedUiJsCode(editor.getEditorState())).toEqual(
        makeTestProjectCodeWithSnippet(`
        <div data-uid='container'>
        {
          // @utopia/uid=conditional
          [].length === 0 ? (
            <img
              style={{
                width: '64px',
                height: '64px',
                position: 'absolute',
              }}
              src='/editor/icons/favicons/favicon-128.png?hash=nocommit'
              data-uid='newly-added-img'
            />
          ) : (
            'Hello there'
          )
        }
        </div>
      `),
      )
    })

    it('add element to false branch of a conditional', async () => {
      const editor = await renderTestEditorWithCode(
        makeTestProjectCodeWithSnippet(`
        <div data-uid='container'>
        {
          // @utopia/uid=conditional
          [].length === 0 ? "Hello there" : null
        }
        </div>
        `),
        'await-first-dom-report',
      )

      FOR_TESTS_setNextGeneratedUid('newly-added-img')

      await clickEmptySlot(editor)
      await expectSingleUndo2Saves(editor, () => insertViaAddElementPopup(editor, 'img'))

      expect(editor.getEditorState().editor.selectedViews.map(EP.toString)).toEqual([
        'utopia-storyboard-uid/scene-aaa/app-entity:container/conditional/newly-added-img',
      ])

      expect(getPrintedUiJsCode(editor.getEditorState())).toEqual(
        makeTestProjectCodeWithSnippet(`
      <div data-uid='container'>
      {
        // @utopia/uid=conditional
        [].length === 0 ? (
          'Hello there'
        ) : (
          <img
            style={{
              width: '64px',
              height: '64px',
              position: 'absolute',
            }}
            src='/editor/icons/favicons/favicon-128.png?hash=nocommit'
            data-uid='newly-added-img'
          />
        )
      }
      </div>
      `),
      )
    })

    it('add element to element in conditional slot - does not support children', async () => {
      const editor = await renderTestEditorWithCode(
        makeTestProjectCodeWithSnippet(`
        <div data-uid='container'>
        {/* @utopia/uid=conditional */
          true ?  (
          <img
            style={{
              width: '64px',
              height: '64px',
              position: 'absolute',
            }}
            src='/editor/icons/favicons/favicon-128.png?hash=3334bc1ac8ae28310d92d7ad97c4b466428cd1e7'
            data-uid='img'
            data-label='img'
          />
        ) : null}
        </div>
        `),
        'await-first-dom-report',
      )

      const initialCode = getPrintedUiJsCode(editor.getEditorState())

      const slot = editor.renderedDOM.getByText('img')
      await mouseClickAtPoint(slot, { x: 5, y: 5 })

      expect(editor.getEditorState().editor.selectedViews.map(EP.toString)).toEqual([
        'utopia-storyboard-uid/scene-aaa/app-entity:container/conditional/img',
      ])

      await expectNoAction(editor, () => insertViaAddElementPopup(editor, 'img'))

      expect(getPrintedUiJsCode(editor.getEditorState())).toEqual(initialCode)
      expectChildrenNotSupportedToastToBePresent(editor)
    })

    it('add element to element in conditional slot - does supports children', async () => {
      const editor = await renderTestEditorWithCode(
        makeTestProjectCodeWithSnippet(`
        <div data-uid='container'>
        {true ? /* @utopia/uid=conditional */ (
          <div
            style={{
              backgroundColor: '#aaaaaa33',
              position: 'absolute',
              left: 77,
              top: 235,
              width: 96,
              height: 115,
            }}
            data-uid='52b'
          />
        ) : null}
        </div>
        `),
        'await-first-dom-report',
      )

      const slot = editor.renderedDOM.getByText('div')
      await mouseClickAtPoint(slot, { x: 5, y: 5 })

      FOR_TESTS_setNextGeneratedUid('newly-added-img')

      await expectSingleUndo2Saves(editor, () => insertViaAddElementPopup(editor, 'img'))

      expect(getPrintedUiJsCode(editor.getEditorState())).toEqual(
        makeTestProjectCodeWithSnippet(`
      <div data-uid='container'>
      {true ? (
        <div
          style={{
            backgroundColor: '#aaaaaa33',
            position: 'absolute',
            left: 77,
            top: 235,
            width: 96,
            height: 115,
          }}
          data-uid='52b'
        >
          <img
            style={{
              width: '64px',
              height: '64px',
              position: 'absolute',
            }}
            src='/editor/icons/favicons/favicon-128.png?hash=nocommit'
            data-uid='newly-added-img'
          />
        </div>
      ) : null}
      </div>
      `),
      )
    })
  })
})

async function clickEmptySlot(editor: EditorRenderResult) {
  const slot = editor.renderedDOM.getByText('Empty')
  await mouseClickAtPoint(slot, { x: 5, y: 5 })
}

async function insertViaAddElementPopup(editor: EditorRenderResult, query: string) {
  await pressKey('a')
  const floatingMenu = editor.renderedDOM.getByTestId(FloatingMenuTestId)
  const searchBox = queryByAttribute('type', floatingMenu, 'text')!

  await act(() => {
    fireEvent.focus(searchBox)
    fireEvent.change(searchBox, { target: { value: query } })
    fireEvent.blur(searchBox)
    fireEvent.keyDown(searchBox, { key: 'Enter', keyCode: 13, metaKey: true })
  })
}

function expectChildrenNotSupportedToastToBePresent(editor: EditorRenderResult) {
  expect(editor.getEditorState().editor.toasts.length).toEqual(1)
  expect(editor.getEditorState().editor.toasts[0].level).toEqual('INFO')
  expect(editor.getEditorState().editor.toasts[0].message).toEqual(
    'Selected element does not support children',
  )
  expect(editor.getEditorState().editor.toasts[0].persistent).toEqual(false)
}
