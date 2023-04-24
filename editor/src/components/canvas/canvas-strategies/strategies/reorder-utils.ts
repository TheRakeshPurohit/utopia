import * as EP from '../../../../core/shared/element-path'
import { ElementPath } from '../../../../core/shared/project-file-types'
import { MetadataUtils } from '../../../../core/model/element-metadata-utils'
import {
  canvasRectangle,
  CanvasRectangle,
  CanvasVector,
  isInfinityRectangle,
  offsetPoint,
  rectContainsPoint,
} from '../../../../core/shared/math-utils'
import { absolute } from '../../../../utils/utils'
import { CSSCursor } from '../../canvas-types'
import { reorderElement } from '../../commands/reorder-element-command'
import { setCursorCommand } from '../../commands/set-cursor-command'
import { setElementsToRerenderCommand } from '../../commands/set-elements-to-rerender-command'
import { updateHighlightedViews } from '../../commands/update-highlighted-views-command'
import {
  CustomStrategyState,
  emptyStrategyApplicationResult,
  getTargetPathsFromInteractionTarget,
  InteractionCanvasState,
  strategyApplicationResult,
  StrategyApplicationResult,
} from '../canvas-strategy-types'
import { InteractionSession } from '../interaction-state'
import { ElementInstanceMetadataMap } from '../../../../core/shared/element-template'

export function isReorderAllowed(siblings: Array<ElementPath>): boolean {
  return siblings.every((sibling) => !isRootOfGeneratedElement(sibling))
}

function isRootOfGeneratedElement(target: ElementPath): boolean {
  const uid = EP.toUid(target)
  const staticUid = EP.toStaticUid(target)
  return uid !== staticUid
}

export function applyReorderCommon(
  originalTargets: Array<ElementPath>,
  targets: Array<ElementPath>,
  canvasState: InteractionCanvasState,
  interactionSession: InteractionSession,
  customStrategyState: CustomStrategyState,
  direction: 'horizontal' | 'vertical',
  isValidTarget: (path: ElementPath, metadata: ElementInstanceMetadataMap) => boolean,
): StrategyApplicationResult {
  if (interactionSession.interactionData.type !== 'DRAG') {
    return emptyStrategyApplicationResult
  }

  if (interactionSession.interactionData.drag != null) {
    const selectedElements = targets
    const target = selectedElements[0]

    const siblings = MetadataUtils.getSiblingsOrdered(canvasState.startingMetadata, target).map(
      (element) => element.elementPath,
    )

    if (!isReorderAllowed(siblings)) {
      return strategyApplicationResult([setCursorCommand(CSSCursor.NotPermitted)], {}, 'failure')
    }

    const pointOnCanvas = offsetPoint(
      interactionSession.interactionData.dragStart,
      interactionSession.interactionData.drag,
    )

    const unpatchedIndex = siblings.findIndex((sibling) => EP.pathsEqual(sibling, target))
    const lastReorderIdx = customStrategyState.lastReorderIdx ?? unpatchedIndex

    const newIndex = findSiblingIndexUnderPoint(
      canvasState.startingMetadata,
      siblings,
      pointOnCanvas,
      direction,
      isValidTarget,
    )

    const newIndexFound = newIndex > -1
    const newResultOrLastIndex = newIndexFound ? newIndex : lastReorderIdx

    if (newResultOrLastIndex === unpatchedIndex) {
      return strategyApplicationResult(
        [
          updateHighlightedViews('mid-interaction', []),
          setElementsToRerenderCommand(siblings),
          setCursorCommand(CSSCursor.Move),
        ],
        {
          lastReorderIdx: newResultOrLastIndex,
        },
      )
    } else {
      return strategyApplicationResult(
        [
          reorderElement(
            'always',
            target,
            absolute(newResultOrLastIndex),
            'use-deprecated-insertJSXElementChild',
          ),
          setElementsToRerenderCommand(siblings),
          updateHighlightedViews('mid-interaction', []),
          setCursorCommand(CSSCursor.Move),
        ],
        {
          lastReorderIdx: newResultOrLastIndex,
        },
      )
    }
  } else {
    // Fallback for when the checks above are not satisfied.
    return strategyApplicationResult([setCursorCommand(CSSCursor.Move)])
  }
}

function findSiblingIndexUnderPoint(
  metadata: ElementInstanceMetadataMap,
  siblings: Array<ElementPath>,
  point: CanvasVector,
  direction: 'horizontal' | 'vertical',
  isValidTarget: (path: ElementPath, metadata: ElementInstanceMetadataMap) => boolean,
): number {
  return siblings.findIndex((sibling) => {
    const element = MetadataUtils.findElementByElementPath(metadata, sibling)
    const parentFrame = element?.specialSizeMeasurements.immediateParentBounds
    const frame = MetadataUtils.getFrameInCanvasCoords(sibling, metadata)
    if (frame != null && parentFrame != null) {
      const siblingArea = (() => {
        if (direction === 'horizontal') {
          return canvasRectangle({
            x: isInfinityRectangle(frame) ? -Infinity : frame.x,
            y: parentFrame.y,
            width: isInfinityRectangle(frame) ? Infinity : frame.width,
            height: parentFrame.height,
          })
        } else {
          return canvasRectangle({
            x: parentFrame.x,
            y: isInfinityRectangle(frame) ? -Infinity : frame.y,
            width: parentFrame.width,
            height: isInfinityRectangle(frame) ? Infinity : frame.height,
          })
        }
      })()

      return rectContainsPoint(siblingArea, point) && isValidTarget(sibling, metadata)
    } else {
      return false
    }
  })
}
