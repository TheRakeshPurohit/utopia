import { MetadataUtils } from '../../../../core/model/element-metadata-utils'
import { generateUidWithExistingComponents } from '../../../../core/model/element-template-utils'
import {
  appendToPath,
  isDescendantOf,
  parentPath,
  toString,
} from '../../../../core/shared/element-path'
import { canvasPoint } from '../../../../core/shared/math-utils'
import { EditorStatePatch } from '../../../editor/store/editor-state'
import { foldAndApplyCommandsInner } from '../../commands/commands'
import { duplicateElement } from '../../commands/duplicate-element-command'
import { updateFunctionCommand } from '../../commands/update-function-command'
import { wildcardPatch } from '../../commands/wildcard-patch-command'
import { ParentBounds } from '../../controls/parent-bounds'
import { ParentOutlines } from '../../controls/parent-outlines'
import {
  DragOutlineControl,
  dragTargetsElementPaths,
} from '../../controls/select-mode/drag-outline-control'
import { ZeroSizedElementControls } from '../../controls/zero-sized-element-controls'
import { CanvasStrategyFactory, pickCanvasStateFromEditorState } from '../canvas-strategies'
import {
  CanvasStrategy,
  controlWithProps,
  CustomStrategyState,
  emptyStrategyApplicationResult,
  getTargetPathsFromInteractionTarget,
  InteractionCanvasState,
  strategyApplicationResult,
} from '../canvas-strategy-types'
import { InteractionSession } from '../interaction-state'
import { baseAbsoluteReparentStrategy } from './absolute-reparent-strategy'
import { getEscapeHatchCommands } from './convert-to-absolute-and-move-strategy'
import { ifAllowedToReparent } from './reparent-helpers'
import { ReparentTarget } from './reparent-strategy-helpers'
import { getDragTargets } from './shared-move-strategies-helpers'

export function baseFlexReparentToAbsoluteStrategy(
  reparentTarget: ReparentTarget,
  fitness: number,
): CanvasStrategyFactory {
  return (
    canvasState: InteractionCanvasState,
    interactionSession: InteractionSession | null,
    customStrategyState: CustomStrategyState,
  ): CanvasStrategy | null => {
    const selectedElements = getTargetPathsFromInteractionTarget(canvasState.interactionTarget)

    return {
      id: `FLEX_REPARENT_TO_ABSOLUTE`,
      name: `Reparent (Abs)`,
      controlsToRender: [
        controlWithProps({
          control: DragOutlineControl,
          props: dragTargetsElementPaths(selectedElements),
          key: 'ghost-outline-control',
          show: 'visible-only-while-active',
        }),
        controlWithProps({
          control: ParentOutlines,
          props: { targetParent: reparentTarget.newParent },
          key: 'parent-outlines-control',
          show: 'visible-only-while-active',
        }),
        controlWithProps({
          control: ParentBounds,
          props: { targetParent: reparentTarget.newParent },
          key: 'parent-bounds-control',
          show: 'visible-only-while-active',
        }),
        controlWithProps({
          control: ZeroSizedElementControls,
          props: { showAllPossibleElements: true },
          key: 'zero-size-control',
          show: 'visible-only-while-active',
        }),
      ],
      fitness: fitness,
      apply: (strategyLifecycle) => {
        const filteredSelectedElements = getDragTargets(selectedElements)
        return ifAllowedToReparent(
          canvasState,
          canvasState.startingMetadata,
          filteredSelectedElements,
          () => {
            if (
              interactionSession == null ||
              interactionSession.interactionData.type !== 'DRAG' ||
              interactionSession.interactionData.drag == null
            ) {
              return emptyStrategyApplicationResult
            }

            const newParent = reparentTarget.newParent

            let duplicatedElementNewUids = {
              ...customStrategyState.duplicatedElementNewUids,
            }

            const placeholderCloneCommands = filteredSelectedElements.flatMap((element) => {
              const newParentADescendantOfCurrentParent = isDescendantOf(
                newParent,
                parentPath(element),
              )

              if (newParentADescendantOfCurrentParent) {
                // if the new parent a descendant of the current parent, it means we want to keep a placeholder element where the original dragged element was, to avoid the new parent shifting around on the screen
                const selectedElementString = toString(element)
                const newUid =
                  duplicatedElementNewUids[selectedElementString] ??
                  generateUidWithExistingComponents(canvasState.projectContents)
                duplicatedElementNewUids[selectedElementString] = newUid

                const newPath = appendToPath(parentPath(element), newUid)

                return [
                  duplicateElement('mid-interaction', element, newUid),
                  wildcardPatch('mid-interaction', {
                    hiddenInstances: { $push: [newPath] },
                  }),
                ]
              } else {
                return []
              }
            })

            const escapeHatchCommands = getEscapeHatchCommands(
              filteredSelectedElements,
              canvasState.startingMetadata,
              canvasState,
              canvasPoint({ x: 0, y: 0 }),
            ).commands

            return strategyApplicationResult([
              ...placeholderCloneCommands,
              ...escapeHatchCommands,
              updateFunctionCommand(
                'always',
                (editorState, commandLifecycle): Array<EditorStatePatch> => {
                  const updatedCanvasState = pickCanvasStateFromEditorState(
                    editorState,
                    canvasState.builtInDependencies,
                  )
                  const absoluteReparentStrategyToUse = baseAbsoluteReparentStrategy(
                    reparentTarget,
                    0,
                  )
                  const reparentCommands =
                    absoluteReparentStrategyToUse(
                      updatedCanvasState,
                      interactionSession,
                      customStrategyState,
                    )?.apply(strategyLifecycle).commands ?? []

                  return foldAndApplyCommandsInner(
                    editorState,
                    [],
                    reparentCommands,
                    commandLifecycle,
                  ).statePatches
                },
              ),
            ])
          },
        )
      },
    }
  }
}
