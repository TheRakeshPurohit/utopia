import React from 'react'
import { sides } from 'utopia-api/core'
import * as ResizeObserverSyntheticDefault from 'resize-observer-polyfill'
import * as EP from '../../core/shared/element-path'
import type {
  DetectedLayoutSystem,
  ElementInstanceMetadata,
  ComputedStyle,
  SpecialSizeMeasurements,
  StyleAttributeMetadata,
  ElementInstanceMetadataMap,
  GridContainerProperties,
  GridElementProperties,
  DomElementMetadata,
} from '../../core/shared/element-template'
import {
  elementInstanceMetadata,
  specialSizeMeasurements,
  emptySpecialSizeMeasurements,
  emptyComputedStyle,
  emptyAttributeMetadata,
  gridContainerProperties,
  gridElementProperties,
  gridAutoOrTemplateFallback,
  domElementMetadata,
} from '../../core/shared/element-template'
import type { ElementPath } from '../../core/shared/project-file-types'
import {
  getCanvasRectangleFromElement,
  getDOMAttribute,
  hugPropertiesFromStyleMap,
} from '../../core/shared/dom-utils'
import {
  applicative4Either,
  defaultEither,
  isRight,
  left,
  eitherToMaybe,
  mapEither,
} from '../../core/shared/either'
import Utils from '../../utils/utils'
import type {
  CanvasPoint,
  CanvasRectangle,
  CoordinateMarker,
  InfinityRectangle,
  LocalPoint,
  LocalRectangle,
  Rectangle,
} from '../../core/shared/math-utils'
import {
  canvasPoint,
  localRectangle,
  roundToNearestHalf,
  canvasRectangle,
  infinityCanvasRectangle,
  infinityLocalRectangle,
  stretchRect,
  boundingRectangleArray,
  infinityRectangle,
  isFiniteRectangle,
} from '../../core/shared/math-utils'
import type { CSSNumber, CSSPosition } from '../inspector/common/css-utils'
import {
  parseCSSLength,
  positionValues,
  computedStyleKeys,
  parseDirection,
  parseFlexDirection,
  parseCSSPx,
  parseGridPosition,
  parseGridRange,
  parseGridAutoOrTemplateBase,
  parseGridAutoFlow,
  isCSSKeyword,
} from '../inspector/common/css-utils'
import { camelCaseToDashed } from '../../core/shared/string-utils'
import type { UtopiaStoreAPI } from '../editor/store/store-hook'
import {
  UTOPIA_DO_NOT_TRAVERSE_KEY,
  UTOPIA_PATH_KEY,
  UTOPIA_SCENE_ID_KEY,
  UTOPIA_VALID_PATHS,
} from '../../core/model/utopia-constants'

import { PERFORMANCE_MARKS_ALLOWED } from '../../common/env-vars'
import { CanvasContainerID } from './canvas-types'
import { emptySet } from '../../core/shared/set-utils'
import type { PathWithString } from '../../core/shared/uid-utils'
import {
  getDeepestPathOnDomElement,
  getPathStringsOnDomElement,
  getPathWithStringsOnDomElement,
} from '../../core/shared/uid-utils'
import { mapDropNulls, pluck, uniqBy } from '../../core/shared/array-utils'
import { forceNotNull, optionalMap } from '../../core/shared/optional-utils'
import { fastForEach } from '../../core/shared/utils'
import { isFeatureEnabled } from '../../utils/feature-switches'
import type {
  EditorState,
  EditorStorePatched,
  ElementsToRerender,
} from '../editor/store/editor-state'
import { shallowEqual } from '../../core/shared/equality-utils'
import { pick } from '../../core/shared/object-utils'
import { getFlexAlignment, getFlexJustifyContent, MaxContent } from '../inspector/inspector-common'
import type { EditorDispatch } from '../editor/action-types'
import { runDOMWalker } from '../editor/actions/action-creators'

export const ResizeObserver =
  window.ResizeObserver ?? ResizeObserverSyntheticDefault.default ?? ResizeObserverSyntheticDefault

const MutationObserverConfig = { attributes: true, childList: true, subtree: true }
const ObserversAvailable = window.MutationObserver != null && ResizeObserver != null

function elementLayoutSystem(computedStyle: CSSStyleDeclaration | null): DetectedLayoutSystem {
  if (computedStyle == null) {
    return 'none'
  }
  if (computedStyle.display != null) {
    if (computedStyle.display.includes('flex')) {
      return 'flex'
    }
    if (computedStyle.display.includes('grid')) {
      return 'grid'
    }
  }
  return 'flow'
}

function getPosition(computedStyle: CSSStyleDeclaration | null): CSSPosition | null {
  const valueAsAny = computedStyle?.position as any
  return positionValues.includes(valueAsAny) ? valueAsAny : null
}

function isElementNonStatic(computedStyle: CSSStyleDeclaration | null) {
  if (computedStyle == null) {
    return false
  }
  if (computedStyle.position != null && computedStyle.position !== 'static') {
    return true
  }

  return false
}

function isElementAContainingBlockForAbsolute(computedStyle: CSSStyleDeclaration | null) {
  // https://developer.mozilla.org/en-US/docs/Web/CSS/Containing_block#identifying_the_containing_block
  if (computedStyle == null) {
    return false
  }
  if (isElementNonStatic(computedStyle)) {
    return true
  }
  if (computedStyle.transform != null && computedStyle.transform !== 'none') {
    return true
  }
  if (computedStyle.perspective != null && computedStyle.perspective !== 'none') {
    return true
  }
  if (computedStyle.willChange === 'transform' || computedStyle.willChange === 'perspective') {
    return true
  }
  if (computedStyle.filter != null && computedStyle.filter !== 'none') {
    return true
  }
  // https://developer.mozilla.org/en-US/docs/Web/CSS/contain
  if (
    computedStyle.contain.includes('layout') ||
    computedStyle.contain.includes('paint') ||
    computedStyle.contain.includes('strict') ||
    computedStyle.contain.includes('content')
  ) {
    return true
  }
  return false
}

const applicativeSidesPxTransform = (t: CSSNumber, r: CSSNumber, b: CSSNumber, l: CSSNumber) =>
  sides(
    t.unit === 'px' ? t.value : undefined,
    r.unit === 'px' ? r.value : undefined,
    b.unit === 'px' ? b.value : undefined,
    l.unit === 'px' ? l.value : undefined,
  )

function isScene(node: Node): node is HTMLElement {
  return (
    node instanceof HTMLElement && node.attributes.getNamedItemNS(null, UTOPIA_SCENE_ID_KEY) != null
  )
}

function findParentScene(target: Element): string | null {
  // First check if the node is a Scene element, which could be nested at any level
  const sceneID = getDOMAttribute(target, UTOPIA_SCENE_ID_KEY)
  if (sceneID != null) {
    return sceneID
  } else {
    const parent = target.parentElement

    if (parent != null) {
      const parentPath = getDeepestPathOnDomElement(parent)
      const parentIsStoryboard = parentPath == null || EP.isStoryboardPath(parentPath)
      if (parentIsStoryboard) {
        // If the parent element is the storyboard, then we've reached the top and have to stop
        const allPaths = getPathStringsOnDomElement(target)
        allPaths.sort((a, b) => a.length - b.length)
        const shallowestPath = allPaths[0]
        if (shallowestPath != null) {
          return shallowestPath
        }
      } else {
        return findParentScene(parent)
      }
    }
  }

  return null
}

function findNearestElementWithPath(element: Element | null): ElementPath | null {
  if (element == null) {
    return null
  }
  const path = getDeepestPathOnDomElement(element)
  if (path != null) {
    return path
  }
  const parent = element.parentElement
  return findNearestElementWithPath(parent)
}

export function lazyValue<T>(getter: () => T) {
  let alreadyResolved = false
  let resolvedValue: T
  return () => {
    if (!alreadyResolved) {
      resolvedValue = getter()
      alreadyResolved = true
    }
    return resolvedValue
  }
}

export function getAttributesComingFromStyleSheets(element: HTMLElement): Set<string> {
  let appliedAttributes = new Set<string>()
  const sheets = document.styleSheets
  for (const i in sheets) {
    try {
      const sheet = sheets[i]
      const rules = sheet.rules ?? sheet.cssRules
      for (const r in rules) {
        const rule = rules[r] as CSSStyleRule
        if (element.matches(rule.selectorText)) {
          const style = rule.style
          for (const attributeName in style) {
            const attributeExists = style[attributeName] !== ''
            if (attributeExists) {
              appliedAttributes.add(attributeName)
            }
          }
        }
      }
    } catch (e) {
      // ignore error, either JSDOM unit test related or we're trying to read one
      // of the editor stylesheets from a CDN URL in a way that is blocked by our
      // cross-origin policies
    }
  }
  return appliedAttributes
}

let AttributesFromStyleSheetsCache: Map<HTMLElement, Set<string>> = new Map()

function getCachedAttributesComingFromStyleSheets(
  invalidatedPathsForStylesheetCache: Set<string>,
  elementPath: ElementPath,
  element: HTMLElement,
): Set<string> {
  const pathAsString = EP.toString(elementPath)
  const invalidated = invalidatedPathsForStylesheetCache.has(pathAsString)
  const inCache = AttributesFromStyleSheetsCache.has(element)
  if (inCache && !invalidated) {
    return AttributesFromStyleSheetsCache.get(element)!
  }
  invalidatedPathsForStylesheetCache.delete(pathAsString) // mutation!
  const value = getAttributesComingFromStyleSheets(element)
  AttributesFromStyleSheetsCache.set(element, value)
  return value
}

// todo move to file
export type UpdateMutableCallback<S> = (updater: (mutableState: S) => void) => void

export interface DomWalkerProps {
  selectedViews: Array<ElementPath>
  scale: number
  onDomReport: (
    elementMetadata: ElementInstanceMetadataMap,
    cachedPaths: Array<ElementPath>,
  ) => void
  mountCount: number
  domWalkerInvalidateCount: number
  canvasInteractionHappening: boolean
  additionalElementsToUpdate: Array<ElementPath>
}

function mergeMetadataMaps_MUTATE(
  metadataToMutate: ElementInstanceMetadataMap,
  otherMetadata: Readonly<ElementInstanceMetadataMap>,
): void {
  fastForEach(Object.values(otherMetadata), (elementMetadata) => {
    const pathString = EP.toString(elementMetadata.elementPath)
    metadataToMutate[pathString] = elementMetadata
  })
}

export interface DomWalkerMutableStateData {
  invalidatedPaths: Set<string> // warning: all subtrees under each invalidated path should invalidated
  invalidatedPathsForStylesheetCache: Set<string>
  initComplete: boolean
  mutationObserver: MutationObserver
  resizeObserver: ResizeObserver
}

export function createDomWalkerMutableState(
  editorStoreApi: UtopiaStoreAPI,
  dispatch: EditorDispatch,
): DomWalkerMutableStateData {
  const mutableData: DomWalkerMutableStateData = {
    invalidatedPaths: emptySet(),
    invalidatedPathsForStylesheetCache: emptySet(),
    initComplete: true,
    mutationObserver: null as any,
    resizeObserver: null as any,
  }

  const observers = initDomWalkerObservers(mutableData, editorStoreApi, dispatch)
  mutableData.mutationObserver = observers.mutationObserver
  mutableData.resizeObserver = observers.resizeObserver

  return mutableData
}

export const DomWalkerMutableStateCtx = React.createContext<DomWalkerMutableStateData | null>(null)
function useDomWalkerMutableStateContext() {
  return forceNotNull(
    `DomWalkerMutableStateCtx needs a Provider`,
    React.useContext(DomWalkerMutableStateCtx),
  )
}

interface RunDomWalkerParams {
  // from dom walker props
  selectedViews: Array<ElementPath>
  scale: number
  additionalElementsToUpdate: Array<ElementPath>
  elementsToFocusOn: ElementsToRerender
  domWalkerMutableState: DomWalkerMutableStateData
  rootMetadataInStateRef: { readonly current: ElementInstanceMetadataMap }
}

interface DomWalkerInternalGlobalProps {
  validPaths: Array<ElementPath>
  rootMetadataInStateRef: React.MutableRefObject<ElementInstanceMetadataMap>
  invalidatedPaths: Set<string>
  invalidatedPathsForStylesheetCache: Set<string>
  selectedViews: Array<ElementPath>
  forceInvalidated: boolean
  scale: number
  containerRectLazy: () => CanvasRectangle
  additionalElementsToUpdate: Array<ElementPath>
  pathsCollectedMutable: Array<ElementPath>
}

function runSelectiveDomWalker(
  elementsToFocusOn: Array<ElementPath>,
  globalProps: DomWalkerInternalGlobalProps,
): { metadata: ElementInstanceMetadataMap; cachedPaths: ElementPath[] } {
  let workingMetadata: ElementInstanceMetadataMap = {}

  const canvasRootContainer = document.getElementById(CanvasContainerID)
  if (canvasRootContainer != null) {
    const parentPoint = canvasPoint({ x: 0, y: 0 })

    elementsToFocusOn.forEach((path) => {
      /**
       * if a elementToFocusOn path points to a component instance, such as App/card-instance, the DOM will
       * only contain an element with the path App/card-instance:card-root. To be able to quickly find the "rootest" element
       * that belongs to a path, we use the ^= prefix search in querySelector.
       * The assumption is that querySelector will return the "topmost" DOM-element with the matching prefix,
       * which is the same as the "rootest" element we are looking for
       */
      const foundElement = document.querySelector(
        `[${UTOPIA_PATH_KEY}^="${EP.toString(path)}"]`,
      ) as HTMLElement | null

      if (foundElement != null) {
        const collectForElement = (element: Node) => {
          if (element instanceof HTMLElement) {
            const pathsWithStrings = getPathWithStringsOnDomElement(element)
            if (pathsWithStrings.length == 0) {
              // Keep walking until we find an element with a path
              element.childNodes.forEach(collectForElement)
            } else {
              const foundValidPaths = pathsWithStrings.filter((pathWithString) => {
                const staticPath = EP.makeLastPartOfPathStatic(pathWithString.path)
                return globalProps.validPaths.some((vp) =>
                  EP.isDescendantOfOrEqualTo(staticPath, vp),
                )
              })
              globalProps.pathsCollectedMutable.push(
                ...foundValidPaths.map((pathWithString) => pathWithString.path),
              )

              const { collectedMetadata } = collectAndCreateMetadataForElement(
                element,
                parentPoint,
                path,
                foundValidPaths.map((p) => p.path),
                globalProps,
              )

              mergeMetadataMaps_MUTATE(workingMetadata, collectedMetadata)
            }
          }
        }

        collectForElement(foundElement)
        foundElement.childNodes.forEach(collectForElement)
      }
    })
    const otherElementPaths = Object.keys(globalProps.rootMetadataInStateRef.current).filter(
      (path) =>
        Object.keys(workingMetadata).find((updatedPath) =>
          EP.isDescendantOfOrEqualTo(EP.fromString(path), EP.fromString(updatedPath)),
        ) == null,
    )
    const rootMetadataForOtherElements = pick(
      otherElementPaths,
      globalProps.rootMetadataInStateRef.current,
    )
    mergeMetadataMaps_MUTATE(rootMetadataForOtherElements, workingMetadata)

    return {
      metadata: rootMetadataForOtherElements,
      cachedPaths: otherElementPaths.map(EP.fromString),
    }
  }

  return {
    metadata: globalProps.rootMetadataInStateRef.current,
    cachedPaths: Object.values(globalProps.rootMetadataInStateRef.current).map(
      (p) => p.elementPath,
    ),
  }
}

export interface BackfillDomMetadataResult {
  updatedMetadata: ElementInstanceMetadataMap
  reconstructedMetadata: ElementInstanceMetadataMap
}

export function backfillDomMetadata(
  metadata: ElementInstanceMetadataMap,
): BackfillDomMetadataResult {
  // Find the paths missing from the metadata, which are ancestors of paths in the metadata which are not present in the metadata.
  const missingPaths = new Set<string>()
  let parentsAndChildrenToRebuild: { [parent: string]: Array<string> } = {}
  function addPathToParentsAndChildren(pathToAdd: ElementPath): void {
    const parentPath = EP.parentPath(pathToAdd)

    const parentPathString = EP.toString(parentPath)
    // Build up parentsAndChildrenToRebuild.
    let pathsToFillChildren: Array<string>
    if (parentPathString in parentsAndChildrenToRebuild) {
      pathsToFillChildren = parentsAndChildrenToRebuild[parentPathString]
    } else {
      pathsToFillChildren = []
      parentsAndChildrenToRebuild[parentPathString] = pathsToFillChildren
    }
    pathsToFillChildren.push(EP.toString(pathToAdd))
  }
  function fillPath(pathToFill: ElementPath): void {
    addPathToParentsAndChildren(pathToFill)
    if (!EP.isEmptyPath(pathToFill)) {
      const pathStringToFill = EP.toString(pathToFill)
      if (!missingPaths.has(pathStringToFill) && !(pathStringToFill in metadata)) {
        missingPaths.add(pathStringToFill)
        const parentPath = EP.parentPath(pathToFill)
        if (parentPath != null) {
          fillPath(parentPath)
        }
      }
    }
  }
  for (const elementMetadata of Object.values(metadata)) {
    const metadataPath = elementMetadata.elementPath
    addPathToParentsAndChildren(metadataPath)
    fillPath(EP.parentPath(metadataPath))
  }

  // Work from the bottommost up the paths to the topmost, filling in the metadata as we go.
  let updatedMetadata: ElementInstanceMetadataMap = { ...metadata }
  const pathsToFill = Array.from(missingPaths).sort().reverse()
  for (const pathToFill of pathsToFill) {
    const pathToFillPath = EP.fromString(pathToFill)
    const childPaths = parentsAndChildrenToRebuild[pathToFill] ?? []
    const children = mapDropNulls((childPath) => updatedMetadata[childPath], childPaths)

    function getBoundingFrameFromChildren<C extends CoordinateMarker>(
      childrenFrames: Array<Rectangle<C> | InfinityRectangle<C>>,
    ) {
      const childrenNonInfinityFrames = childrenFrames.filter(isFiniteRectangle)
      const childrenBoundingFrame =
        childrenNonInfinityFrames.length === childrenFrames.length
          ? boundingRectangleArray(childrenNonInfinityFrames)
          : (infinityRectangle as InfinityRectangle<C>)

      return childrenBoundingFrame
    }

    const childrenBoundingGlobalFrame = getBoundingFrameFromChildren(
      mapDropNulls((c) => c.globalFrame, children),
    )

    const childrenBoundingGlobalFrameWithTextContent = getBoundingFrameFromChildren(
      mapDropNulls((c) => c.specialSizeMeasurements.globalFrameWithTextContent, children),
    )

    // Insert a default entry in for this.
    if (!(pathToFill in updatedMetadata)) {
      updatedMetadata[pathToFill] = elementInstanceMetadata(
        pathToFillPath,
        left('unknown'),
        null,
        null,
        false,
        false,
        emptySpecialSizeMeasurements,
        emptyComputedStyle,
        emptyAttributeMetadata,
        null,
        null,
        'not-a-conditional',
        null,
        null,
        null,
      )
    }

    // Update the frames.
    const currentMetadata = updatedMetadata[pathToFill]
    updatedMetadata[pathToFill] = {
      ...currentMetadata,
      globalFrame: childrenBoundingGlobalFrame,
      nonRoundedGlobalFrame: childrenBoundingGlobalFrame,
      specialSizeMeasurements: {
        ...currentMetadata.specialSizeMeasurements,
        globalFrameWithTextContent: childrenBoundingGlobalFrameWithTextContent,
      },
    }
  }

  let updatedMetadataToReturn: ElementInstanceMetadataMap = {}
  let reconstructedMetadata: ElementInstanceMetadataMap = {}
  for (const [metadataKey, metadataValue] of Object.entries(updatedMetadata)) {
    // Either updating existing values or squirrelling away the entries in the reconstructed metadata.
    if (metadataKey in metadata) {
      updatedMetadataToReturn[metadataKey] = metadataValue
    } else {
      reconstructedMetadata[metadataKey] = metadataValue
    }
  }

  return {
    updatedMetadata: updatedMetadataToReturn,
    reconstructedMetadata: reconstructedMetadata,
  }
}

export function resubscribeObservers(domWalkerMutableState: {
  mutationObserver: MutationObserver
  resizeObserver: ResizeObserver
}) {
  const canvasRootContainer = document.getElementById(CanvasContainerID)
  if (
    ObserversAvailable &&
    canvasRootContainer != null &&
    domWalkerMutableState.resizeObserver != null &&
    domWalkerMutableState.mutationObserver != null
  ) {
    document.querySelectorAll(`#${CanvasContainerID} *`).forEach((elem) => {
      domWalkerMutableState.resizeObserver.observe(elem)
    })
    domWalkerMutableState.mutationObserver.observe(canvasRootContainer, MutationObserverConfig)
  }
}

// Dom walker has 3 modes for performance reasons:
// Fastest is the selective mode, this runs when elementsToFocusOn is not 'rerender-all-elements'. In this case it only collects the metadata of the elements in elementsToFocusOn
// Middle speed is when initComplete is true, in this case it traverses the full dom but only collects the metadata for the not invalidated elements (stored in invalidatedPaths)
// Slowest is the full run, when elementsToFocusOn is 'rerender-all-elements' and initComplete is false
export function runDomWalker({
  domWalkerMutableState,
  selectedViews,
  elementsToFocusOn,
  scale,
  additionalElementsToUpdate,
  rootMetadataInStateRef,
}: RunDomWalkerParams): {
  metadata: ElementInstanceMetadataMap
  reconstructedMetadata: ElementInstanceMetadataMap
  cachedPaths: ElementPath[]
  invalidatedPaths: string[]
} | null {
  const needsWalk =
    !domWalkerMutableState.initComplete || domWalkerMutableState.invalidatedPaths.size > 0

  if (!needsWalk) {
    return null // early return to save performance
  }

  const LogDomWalkerPerformance =
    (isFeatureEnabled('Debug – Performance Marks (Fast)') ||
      isFeatureEnabled('Debug – Performance Marks (Slow)')) &&
    PERFORMANCE_MARKS_ALLOWED

  const canvasRootContainer = document.getElementById(CanvasContainerID)

  if (canvasRootContainer != null) {
    if (LogDomWalkerPerformance) {
      performance.mark('DOM_WALKER_START')
    }

    const invalidatedPaths = Array.from(domWalkerMutableState.invalidatedPaths)

    resubscribeObservers(domWalkerMutableState)

    // getCanvasRectangleFromElement is costly, so I made it lazy. we only need the value inside globalFrameForElement
    const containerRect = lazyValue(() => {
      return getCanvasRectangleFromElement(
        canvasRootContainer,
        scale,
        'without-text-content',
        'nearest-half',
      )
    })

    const validPaths: Array<ElementPath> | null = optionalMap(
      (paths) => paths.split(' ').map(EP.fromString),
      canvasRootContainer.getAttribute(UTOPIA_VALID_PATHS),
    )

    if (validPaths == null) {
      throw new Error(
        'Utopia Internal Error: Running DOM-walker without canvasRootPath or validRootPaths',
      )
    }

    const globalProps: DomWalkerInternalGlobalProps = {
      validPaths: validPaths,
      rootMetadataInStateRef: rootMetadataInStateRef,
      invalidatedPaths: domWalkerMutableState.invalidatedPaths,
      invalidatedPathsForStylesheetCache: domWalkerMutableState.invalidatedPathsForStylesheetCache,
      selectedViews: selectedViews,
      forceInvalidated: !domWalkerMutableState.initComplete, // TODO do we run walkCanvasRootFragment with initComplete=true anymore? // TODO _should_ we ever run walkCanvasRootFragment with initComplete=false EVER, or instead can we set the canvas root as the invalidated path?
      scale: scale,
      containerRectLazy: containerRect,
      additionalElementsToUpdate: [...additionalElementsToUpdate, ...selectedViews],
      pathsCollectedMutable: [],
    }

    // This assumes that the canvas root is rendering a Storyboard fragment.
    // The necessary validPaths and the root fragment's template path comes from props,
    // because the fragment is invisible in the DOM.
    const { metadata, cachedPaths } =
      // when we don't rerender all elements we just run the dom walker in selective mode: only update the metatdata
      // of the currently rendered elements (for performance reasons)
      elementsToFocusOn === 'rerender-all-elements'
        ? walkCanvasRootFragment(canvasRootContainer, globalProps)
        : runSelectiveDomWalker(elementsToFocusOn, globalProps)

    if (LogDomWalkerPerformance) {
      performance.mark('DOM_WALKER_END')
      performance.measure(
        `DOM WALKER - cached paths: [${cachedPaths.map(EP.toString).join(', ')}]`,
        'DOM_WALKER_START',
        'DOM_WALKER_END',
      )
    }
    domWalkerMutableState.initComplete = true // Mutation!

    const { updatedMetadata, reconstructedMetadata } = backfillDomMetadata(metadata)

    return {
      metadata: updatedMetadata,
      reconstructedMetadata: reconstructedMetadata,
      cachedPaths: cachedPaths,
      invalidatedPaths: invalidatedPaths,
    }
  } else {
    // TODO flip if-else
    return null
  }
}

function selectCanvasInteractionHappening(store: EditorStorePatched): boolean {
  const interactionSessionActive = store.editor.canvas.interactionSession != null
  return interactionSessionActive
}

export function initDomWalkerObservers(
  domWalkerMutableState: DomWalkerMutableStateData,
  editorStore: UtopiaStoreAPI,
  dispatch: EditorDispatch,
): { resizeObserver: ResizeObserver; mutationObserver: MutationObserver } {
  // Warning: I modified this code so it runs in all modes, not just in live mode. We still don't trigger
  // the DOM walker during canvas interactions, so the performance impact doesn't seem that bad. But it is
  // necessary, because after remix navigation, and after dynamic changes coming from loaders sometimes the
  // dom walker was not executed after all the changes.
  //
  // This was the original comment here when this only ran in live mode:
  //
  // Warning: These observers only trigger the DOM walker whilst in live mode to ensure metadata is up to date
  // when interacting with the actual running application / components. There are likely edge cases where we
  // also want these to trigger the DOM walker whilst in select mode, but if we find such a case we need to
  // adequately assess the performance impact of doing so, and ideally find a way to only do so when the observed
  // change was not triggered by a user interaction
  const resizeObserver = new ResizeObserver((entries: ResizeObserverEntry[]) => {
    const canvasInteractionHappening = selectCanvasInteractionHappening(editorStore.getState())
    const selectedViews = editorStore.getState().editor.selectedViews
    if (canvasInteractionHappening) {
      // Warning this only adds the selected views instead of the observed element
      fastForEach(selectedViews, (v) => {
        domWalkerMutableState.invalidatedPaths.add(EP.toString(v))
      })
    } else {
      let shouldRunDOMWalker = false
      for (let entry of entries) {
        const sceneID = findParentScene(entry.target)
        if (sceneID != null) {
          domWalkerMutableState.invalidatedPaths.add(sceneID) // warning this invalidates the entire scene instead of just the observed element.
          shouldRunDOMWalker = true
        }
      }
      if (shouldRunDOMWalker) {
        dispatch([runDOMWalker()])
      }
    }
  })

  const mutationObserver = new window.MutationObserver((mutations: MutationRecord[]) => {
    const canvasInteractionHappening = selectCanvasInteractionHappening(editorStore.getState())
    const selectedViews = editorStore.getState().editor.selectedViews

    if (canvasInteractionHappening) {
      // Warning this only adds the selected views instead of the observed element
      fastForEach(selectedViews, (v) => {
        domWalkerMutableState.invalidatedPaths.add(EP.toString(v))
      })
    } else {
      let shouldRunDOMWalker = false
      for (let mutation of mutations) {
        if (
          mutation.attributeName === 'style' ||
          mutation.addedNodes.length > 0 ||
          mutation.removedNodes.length > 0
        ) {
          if (mutation.target instanceof HTMLElement) {
            const sceneID = findParentScene(mutation.target)
            if (sceneID != null) {
              domWalkerMutableState.invalidatedPaths.add(sceneID) // warning this invalidates the entire scene instead of just the observed element.
              shouldRunDOMWalker = true
            }
          }
        }
      }
      if (shouldRunDOMWalker) {
        dispatch([runDOMWalker()])
      }
    }
  })

  return { resizeObserver, mutationObserver }
}

export function invalidateDomWalkerIfNecessary(
  domWalkerMutableState: DomWalkerMutableStateData,
  oldEditorState: EditorState,
  newEditorState: EditorState,
): void {
  // invalidate initComplete on mountCount increase
  if (
    newEditorState.canvas.domWalkerInvalidateCount >
      oldEditorState.canvas.domWalkerInvalidateCount ||
    newEditorState.canvas.mountCount > oldEditorState.canvas.mountCount
  ) {
    domWalkerMutableState.initComplete = false // Mutation!
    domWalkerMutableState.invalidatedPaths.clear() // Mutation!
  }

  // invalidate scenes when selectedViews change
  if (!shallowEqual(oldEditorState.selectedViews, newEditorState.selectedViews)) {
    newEditorState.selectedViews.forEach((sv) => {
      const scenePath = EP.createBackwardsCompatibleScenePath(sv)
      if (scenePath != null) {
        const sceneID = EP.toString(scenePath)
        domWalkerMutableState.invalidatedPaths.add(sceneID) // Mutation!
        domWalkerMutableState.invalidatedPathsForStylesheetCache.add(EP.toString(sv))
      }
    })
  }
}

export function useDomWalkerInvalidateCallbacks(): [UpdateMutableCallback<Set<string>>] {
  const domWalkerMutableState = useDomWalkerMutableStateContext()
  // For invalidating specific paths only
  const updateInvalidatedPaths: UpdateMutableCallback<Set<string>> = React.useCallback(
    (callback) => {
      callback(domWalkerMutableState.invalidatedPaths)
    },
    [domWalkerMutableState],
  )

  return [updateInvalidatedPaths]
}

function collectMetadataForElement(
  element: HTMLElement,
  closestOffsetParentPath: ElementPath | null,
  scale: number,
  containerRectLazy: CanvasPoint | (() => CanvasPoint),
): {
  tagName: string
  globalFrame: CanvasRectangle
  nonRoundedGlobalFrame: CanvasRectangle
  specialSizeMeasurementsObject: SpecialSizeMeasurements
  textContentsMaybe: string | null
} {
  const tagName: string = element.tagName.toLowerCase()
  const globalFrame = globalFrameForElement(
    element,
    scale,
    containerRectLazy,
    'without-text-content',
    'nearest-half',
  )
  const nonRoundedGlobalFrame = globalFrameForElement(
    element,
    scale,
    containerRectLazy,
    'without-text-content',
    'no-rounding',
  )

  const textContentsMaybe = element.children.length === 0 ? element.textContent : null

  const specialSizeMeasurementsObject = getSpecialMeasurements(
    element,
    closestOffsetParentPath,
    scale,
    containerRectLazy,
  )

  return {
    tagName: tagName,
    globalFrame: globalFrame,
    nonRoundedGlobalFrame: nonRoundedGlobalFrame,
    specialSizeMeasurementsObject: specialSizeMeasurementsObject,
    textContentsMaybe: textContentsMaybe,
  }
}

function isAnyPathInvalidated(
  stringPathsForElement: Array<string>,
  invalidatedPaths: ReadonlySet<string>,
): boolean {
  return invalidatedPaths.size > 0 && stringPathsForElement.some((p) => invalidatedPaths.has(p))
}

function collectMetadata(
  element: HTMLElement,
  originalElementPaths: Array<PathWithString>,
  pathsForElement: Array<ElementPath>,
  stringPathsForElement: Array<string>,
  parentPoint: CanvasPoint,
  closestOffsetParentPath: ElementPath,
  allUnfilteredChildrenPaths: Array<ElementPath>,
  invalidated: boolean, // TODO rename invalidated from globalProps?
  globalProps: DomWalkerInternalGlobalProps,
): {
  collectedMetadata: ElementInstanceMetadataMap
  cachedPaths: Array<ElementPath>
  collectedPaths: Array<ElementPath>
} {
  // Determine if the parent has been visited so far.
  // When a child element of another element is found, we want to collect the metadata for it if
  // the DOM walker hasn't visited its parent (by element path). As it still forms part of the parent's
  // frame, so we want to include it.
  const parentVisited = originalElementPaths.some((originalElementPath) => {
    const parentPath = EP.parentPath(originalElementPath.path)
    return EP.containsPath(parentPath, globalProps.pathsCollectedMutable)
  })

  if (pathsForElement.length === 0 && parentVisited) {
    return {
      collectedMetadata: {},
      cachedPaths: [],
      collectedPaths: [],
    }
  }
  const shouldCollect =
    !parentVisited ||
    invalidated ||
    isAnyPathInvalidated(stringPathsForElement, globalProps.invalidatedPaths) ||
    pathsForElement.some((pathForElement) => {
      return globalProps.additionalElementsToUpdate.some((additionalElementToUpdate) =>
        EP.pathsEqual(pathForElement, additionalElementToUpdate),
      )
    })
  if (shouldCollect) {
    return collectAndCreateMetadataForElement(
      element,
      parentPoint,
      closestOffsetParentPath,
      parentVisited ? pathsForElement : originalElementPaths.map((path) => path.path),
      globalProps,
    )
  } else {
    const cachedMetadata = pick(stringPathsForElement, globalProps.rootMetadataInStateRef.current)

    if (Object.keys(cachedMetadata).length === pathsForElement.length) {
      return {
        collectedMetadata: cachedMetadata,
        cachedPaths: pathsForElement,
        collectedPaths: pathsForElement,
      }
    } else {
      // If any path is missing cached metadata we must forcibly invalidate the element
      return collectMetadata(
        element,
        originalElementPaths,
        pathsForElement,
        stringPathsForElement,
        parentPoint,
        closestOffsetParentPath,
        allUnfilteredChildrenPaths,
        true, // forcing the invalidation
        globalProps,
      )
    }
  }
}

function collectAndCreateMetadataForElement(
  element: HTMLElement,
  parentPoint: CanvasPoint,
  closestOffsetParentPath: ElementPath,
  pathsForElement: ElementPath[],
  globalProps: DomWalkerInternalGlobalProps,
) {
  const {
    tagName,
    globalFrame,
    nonRoundedGlobalFrame,
    specialSizeMeasurementsObject,
    textContentsMaybe,
  } = collectMetadataForElement(
    element,
    closestOffsetParentPath,
    globalProps.scale,
    globalProps.containerRectLazy,
  )

  const { computedStyle, attributeMetadata } = getComputedStyle(
    element,
    pathsForElement,
    globalProps.invalidatedPathsForStylesheetCache,
    globalProps.selectedViews,
  )

  const collectedMetadata: ElementInstanceMetadataMap = {}
  pathsForElement.forEach((path) => {
    const pathStr = EP.toString(path)
    globalProps.invalidatedPaths.delete(pathStr) // global mutation!

    collectedMetadata[pathStr] = elementInstanceMetadata(
      path,
      left(tagName),
      globalFrame,
      nonRoundedGlobalFrame,
      false,
      false,
      specialSizeMeasurementsObject,
      computedStyle,
      attributeMetadata,
      null,
      null,
      'not-a-conditional',
      textContentsMaybe,
      null,
      null,
    )
  })

  return {
    collectedMetadata: collectedMetadata,
    cachedPaths: [],
    collectedPaths: pathsForElement,
  }
}

export function collectDomElementMetadataForElement(
  element: HTMLElement,
  scale: number,
  containerRectX: number,
  containerRectY: number,
): DomElementMetadata {
  const closestOffsetParentPath: ElementPath | null = findNearestElementWithPath(
    element.offsetParent,
  )

  const {
    tagName,
    globalFrame,
    nonRoundedGlobalFrame,
    specialSizeMeasurementsObject,
    textContentsMaybe,
  } = collectMetadataForElement(
    element,
    closestOffsetParentPath,
    scale,
    canvasPoint({ x: containerRectX, y: containerRectY }),
  )

  return domElementMetadata(
    left(tagName),
    globalFrame,
    nonRoundedGlobalFrame,
    specialSizeMeasurementsObject,
    textContentsMaybe,
  )
}

function getComputedStyle(
  element: HTMLElement,
  paths: Array<ElementPath>,
  invalidatedPathsForStylesheetCache: Set<string>,
  selectedViews: Array<ElementPath>,
): {
  computedStyle: ComputedStyle | null
  attributeMetadata: StyleAttributeMetadata | null
} {
  const isSelectedOnAnyPaths = selectedViews.some((sv) =>
    paths.some((path) => EP.pathsEqual(sv, path)),
  )
  if (!isSelectedOnAnyPaths) {
    // the element is not among the selected views, skip computing the style
    return {
      computedStyle: null,
      attributeMetadata: null,
    }
  }
  const elementStyle = window.getComputedStyle(element)
  const attributesSetByStylesheet = getCachedAttributesComingFromStyleSheets(
    invalidatedPathsForStylesheetCache,
    paths[0], // TODO is this sufficient to use the first path element for caching?
    element,
  )
  let computedStyle: ComputedStyle = {}
  let attributeMetadata: StyleAttributeMetadata = {}
  if (elementStyle != null) {
    computedStyleKeys.forEach((key) => {
      // Accessing the value directly often doesn't work, and using `getPropertyValue` requires
      // using dashed case rather than camel case
      const caseCorrectedKey = camelCaseToDashed(key)
      const propertyValue = elementStyle.getPropertyValue(caseCorrectedKey)
      if (propertyValue != '') {
        computedStyle[key] = propertyValue
        const isSetFromStyleSheet = attributesSetByStylesheet.has(key)
        if (isSetFromStyleSheet) {
          attributeMetadata[key] = { fromStyleSheet: true }
        }
      }
    })
  }

  return {
    computedStyle: computedStyle,
    attributeMetadata: attributeMetadata,
  }
}

function getGridContainerProperties(
  elementStyle: CSSStyleDeclaration | null,
): GridContainerProperties {
  if (elementStyle == null) {
    return {
      gridTemplateColumns: null,
      gridTemplateRows: null,
      gridAutoColumns: null,
      gridAutoRows: null,
      gridAutoFlow: null,
    }
  }
  const gridTemplateColumns = defaultEither(
    gridAutoOrTemplateFallback(elementStyle.gridTemplateColumns),
    parseGridAutoOrTemplateBase(elementStyle.gridTemplateColumns),
  )
  const gridTemplateRows = defaultEither(
    gridAutoOrTemplateFallback(elementStyle.gridTemplateRows),
    parseGridAutoOrTemplateBase(elementStyle.gridTemplateRows),
  )
  const gridAutoColumns = defaultEither(
    gridAutoOrTemplateFallback(elementStyle.gridAutoColumns),
    parseGridAutoOrTemplateBase(elementStyle.gridAutoColumns),
  )
  const gridAutoRows = defaultEither(
    gridAutoOrTemplateFallback(elementStyle.gridAutoRows),
    parseGridAutoOrTemplateBase(elementStyle.gridAutoRows),
  )
  return gridContainerProperties(
    gridTemplateColumns,
    gridTemplateRows,
    gridAutoColumns,
    gridAutoRows,
    parseGridAutoFlow(elementStyle.gridAutoFlow),
  )
}

function getGridElementProperties(
  container: GridContainerProperties,
  elementStyle: CSSStyleDeclaration,
): GridElementProperties {
  const gridColumn = defaultEither(
    null,
    parseGridRange(container, 'column', elementStyle.gridColumn),
  )

  const gridColumnStart =
    gridColumn?.start ??
    defaultEither(
      null,
      parseGridPosition(
        container,
        'column',
        'start',
        gridColumn?.start ?? null,
        elementStyle.gridColumnStart,
      ),
    ) ??
    null
  const gridColumnEnd =
    gridColumn?.end ??
    defaultEither(
      null,
      parseGridPosition(
        container,
        'column',
        'end',
        gridColumn?.end ?? null,
        elementStyle.gridColumnEnd,
      ),
    ) ??
    null
  const adjustedColumnEnd =
    isCSSKeyword(gridColumnEnd) && gridColumn?.end != null ? gridColumn.end : gridColumnEnd

  const gridRow = defaultEither(null, parseGridRange(container, 'row', elementStyle.gridRow))
  const gridRowStart =
    gridRow?.start ??
    defaultEither(
      null,
      parseGridPosition(
        container,
        'row',
        'start',
        gridRow?.start ?? null,
        elementStyle.gridRowStart,
      ),
    ) ??
    null
  const gridRowEnd =
    gridRow?.end ??
    defaultEither(
      null,
      parseGridPosition(container, 'row', 'end', gridRow?.end ?? null, elementStyle.gridRowEnd),
    ) ??
    null
  const adjustedRowEnd = isCSSKeyword(gridRowEnd) && gridRow?.end != null ? gridRow.end : gridRowEnd

  const result = gridElementProperties(
    gridColumnStart,
    adjustedColumnEnd,
    gridRowStart,
    adjustedRowEnd,
  )
  return result
}

function getSpecialMeasurements(
  element: HTMLElement,
  closestOffsetParentPath: ElementPath | null,
  scale: number,
  containerRectLazy: CanvasPoint | (() => CanvasPoint),
): SpecialSizeMeasurements {
  const elementStyle = window.getComputedStyle(element)
  const layoutSystemForChildren = elementLayoutSystem(elementStyle)
  const position = getPosition(elementStyle)

  const offset = {
    x: roundToNearestHalf(element.offsetLeft),
    y: roundToNearestHalf(element.offsetTop),
  } as LocalPoint

  const coordinateSystemBounds =
    element.offsetParent instanceof HTMLElement
      ? globalFrameForElement(
          element.offsetParent,
          scale,
          containerRectLazy,
          'without-text-content',
          'nearest-half',
        )
      : null

  const immediateParentBounds =
    element.parentElement instanceof HTMLElement
      ? globalFrameForElement(
          element.parentElement,
          scale,
          containerRectLazy,
          'without-text-content',
          'nearest-half',
        )
      : null

  const parentElementStyle =
    element.parentElement == null ? null : window.getComputedStyle(element.parentElement)
  const isParentNonStatic = isElementNonStatic(parentElementStyle)

  const providesBoundsForAbsoluteChildren = isElementAContainingBlockForAbsolute(elementStyle)

  const parentLayoutSystem = elementLayoutSystem(parentElementStyle)
  const parentProvidesLayout = element.parentElement === element.offsetParent
  const parentFlexDirection = eitherToMaybe(
    parseFlexDirection(parentElementStyle?.flexDirection, null),
  )
  const parentJustifyContent = getFlexJustifyContent(parentElementStyle?.justifyContent ?? null)

  const sizeMainAxis = parentFlexDirection === 'row' ? 'width' : 'height'
  const parentHugsOnMainAxis =
    parentLayoutSystem === 'flex' &&
    element.parentElement != null &&
    element.parentElement.style[sizeMainAxis] === MaxContent

  const flexDirection = eitherToMaybe(parseFlexDirection(elementStyle.flexDirection, null))
  const parentTextDirection = eitherToMaybe(parseDirection(parentElementStyle?.direction, null))

  const justifyContent = getFlexJustifyContent(elementStyle.justifyContent)
  const alignItems = getFlexAlignment(elementStyle.alignItems)

  const margin = applicative4Either(
    applicativeSidesPxTransform,
    parseCSSLength(elementStyle.marginTop),
    parseCSSLength(elementStyle.marginRight),
    parseCSSLength(elementStyle.marginBottom),
    parseCSSLength(elementStyle.marginLeft),
  )

  const padding = applicative4Either(
    applicativeSidesPxTransform,
    parseCSSLength(elementStyle.paddingTop),
    parseCSSLength(elementStyle.paddingRight),
    parseCSSLength(elementStyle.paddingBottom),
    parseCSSLength(elementStyle.paddingLeft),
  )

  const parentPadding = applicative4Either(
    applicativeSidesPxTransform,
    parseCSSLength(parentElementStyle?.paddingTop),
    parseCSSLength(parentElementStyle?.paddingRight),
    parseCSSLength(parentElementStyle?.paddingBottom),
    parseCSSLength(parentElementStyle?.paddingLeft),
  )

  let naturalWidth: number | null = null
  let naturalHeight: number | null = null
  if (element.tagName === 'IMG') {
    naturalWidth = roundToNearestHalf((element as HTMLImageElement).naturalWidth)
    naturalHeight = roundToNearestHalf((element as HTMLImageElement).naturalHeight)
  }

  let clientWidth = roundToNearestHalf(element.clientWidth)
  let clientHeight = roundToNearestHalf(element.clientHeight)

  const childrenCount = element.childElementCount

  const borderTopWidth = parseCSSLength(elementStyle.borderTopWidth)
  const borderRightWidth = parseCSSLength(elementStyle.borderRightWidth)
  const borderBottomWidth = parseCSSLength(elementStyle.borderBottomWidth)
  const borderLeftWidth = parseCSSLength(elementStyle.borderLeftWidth)
  const border = {
    top: isRight(borderTopWidth) ? borderTopWidth.value.value : 0,
    right: isRight(borderRightWidth) ? borderRightWidth.value.value : 0,
    bottom: isRight(borderBottomWidth) ? borderBottomWidth.value.value : 0,
    left: isRight(borderLeftWidth) ? borderLeftWidth.value.value : 0,
  }

  const offsetParent = getClosestOffsetParent(element) as HTMLElement | null
  const elementOrContainingParent =
    providesBoundsForAbsoluteChildren || offsetParent == null ? element : offsetParent

  const globalFrame = globalFrameForElement(
    elementOrContainingParent,
    scale,
    containerRectLazy,
    'without-text-content',
    'nearest-half',
  )

  const globalFrameWithTextContent = globalFrameForElement(
    element,
    scale,
    containerRectLazy,
    'with-text-content',
    'nearest-half',
  )

  const globalContentBoxForChildren = canvasRectangle({
    x: globalFrame.x + border.left,
    y: globalFrame.y + border.top,
    width: globalFrame.width - border.left - border.right,
    height: globalFrame.height - border.top - border.bottom,
  })

  function positionValueIsDefault(value: string) {
    return value === 'auto' || value === '0px'
  }

  const hasPositionOffset =
    !positionValueIsDefault(elementStyle.top) ||
    !positionValueIsDefault(elementStyle.right) ||
    !positionValueIsDefault(elementStyle.bottom) ||
    !positionValueIsDefault(elementStyle.left)
  const hasTransform = elementStyle.transform !== 'none'

  const gap = defaultEither(
    null,
    mapEither((n) => n.value, parseCSSLength(elementStyle.gap)),
  )

  const rowGap = defaultEither(
    null,
    mapEither((n) => n.value, parseCSSLength(elementStyle.rowGap)),
  )

  const columnGap = defaultEither(
    null,
    mapEither((n) => n.value, parseCSSLength(elementStyle.columnGap)),
  )

  const flexGapValue = parseCSSLength(parentElementStyle?.gap)
  const parsedFlexGapValue = isRight(flexGapValue) ? flexGapValue.value.value : 0

  const borderRadius = defaultEither(
    null,
    applicative4Either(
      applicativeSidesPxTransform,
      parseCSSLength(elementStyle.borderTopLeftRadius),
      parseCSSLength(elementStyle.borderTopRightRadius),
      parseCSSLength(elementStyle.borderBottomLeftRadius),
      parseCSSLength(elementStyle.borderBottomRightRadius),
    ),
  )

  const fontSize = elementStyle.fontSize
  const fontWeight = elementStyle.fontWeight
  const fontStyle = elementStyle.fontStyle
  const textDecorationLine = elementStyle.textDecorationLine

  const textBounds = elementContainsOnlyText(element)
    ? stretchRect(
        getCanvasRectangleFromElement(element, scale, 'only-text-content', 'nearest-half'),
        {
          w:
            maybeValueFromComputedStyle(elementStyle.paddingLeft) +
            maybeValueFromComputedStyle(elementStyle.paddingRight) +
            maybeValueFromComputedStyle(elementStyle.marginLeft) +
            maybeValueFromComputedStyle(elementStyle.marginRight),
          h:
            maybeValueFromComputedStyle(elementStyle.paddingTop) +
            maybeValueFromComputedStyle(elementStyle.paddingBottom) +
            maybeValueFromComputedStyle(elementStyle.marginTop) +
            maybeValueFromComputedStyle(elementStyle.marginBottom),
        },
      )
    : null

  const computedStyleMap =
    typeof element.computedStyleMap === 'function' ? element.computedStyleMap() : null // TODO: this is for jest tests, no computedStyleMap in jsdom :()
  const computedHugProperty = hugPropertiesFromStyleMap(
    (styleProp: string) => computedStyleMap?.get(styleProp)?.toString() ?? null,
    globalFrame,
  )

  const parentContainerGridProperties = getGridContainerProperties(parentElementStyle)

  const containerGridProperties = getGridContainerProperties(elementStyle)
  const containerElementProperties = getGridElementProperties(
    parentContainerGridProperties,
    elementStyle,
  )
  const containerGridPropertiesFromProps = getGridContainerProperties(element.style)
  const containerElementPropertiesFromProps = getGridElementProperties(
    parentContainerGridProperties,
    element.style,
  )

  return specialSizeMeasurements(
    offset,
    coordinateSystemBounds,
    immediateParentBounds,
    globalFrameWithTextContent,
    parentProvidesLayout,
    closestOffsetParentPath,
    isParentNonStatic,
    parentLayoutSystem,
    layoutSystemForChildren,
    providesBoundsForAbsoluteChildren,
    elementStyle.display,
    position,
    isRight(margin) ? margin.value : sides(undefined, undefined, undefined, undefined),
    isRight(padding) ? padding.value : sides(undefined, undefined, undefined, undefined),
    naturalWidth,
    naturalHeight,
    clientWidth,
    clientHeight,
    parentFlexDirection,
    parentJustifyContent,
    parsedFlexGapValue,
    isRight(parentPadding)
      ? parentPadding.value
      : sides(undefined, undefined, undefined, undefined),
    parentHugsOnMainAxis,
    gap,
    flexDirection,
    justifyContent,
    alignItems,
    element.localName,
    childrenCount,
    globalContentBoxForChildren,
    elementStyle.float,
    hasPositionOffset,
    parentTextDirection,
    hasTransform,
    borderRadius,
    fontSize,
    fontWeight,
    fontStyle,
    textDecorationLine,
    textBounds,
    computedHugProperty,
    containerGridProperties,
    containerElementProperties,
    containerGridPropertiesFromProps,
    containerElementPropertiesFromProps,
    rowGap,
    columnGap,
  )
}

function elementContainsOnlyText(element: HTMLElement): boolean {
  if (element.childNodes.length === 0) {
    return false
  }
  for (const node of element.childNodes) {
    const isForText =
      node.nodeType === Node.TEXT_NODE ||
      (node.nodeType === Node.ELEMENT_NODE && node.nodeName === 'BR')
    if (!isForText) {
      return false
    }
  }
  return true
}

function maybeValueFromComputedStyle(property: string): number {
  const parsed = parseCSSPx(property)
  return isRight(parsed) ? parsed.value.value : 0
}

function globalFrameForElement(
  element: HTMLElement,
  scale: number,
  containerRectLazy: CanvasPoint | (() => CanvasPoint),
  withContent: 'without-text-content' | 'with-text-content',
  rounding: 'nearest-half' | 'no-rounding',
) {
  const elementRect = getCanvasRectangleFromElement(element, scale, withContent, rounding)

  return Utils.offsetRect(
    elementRect,
    Utils.negate(typeof containerRectLazy === 'function' ? containerRectLazy() : containerRectLazy),
  )
}

function walkCanvasRootFragment(
  canvasRoot: HTMLElement,
  globalProps: DomWalkerInternalGlobalProps,
): {
  metadata: ElementInstanceMetadataMap
  cachedPaths: Array<ElementPath>
} {
  const canvasRootPath: ElementPath | null = optionalMap(
    EP.fromString,
    canvasRoot.getAttribute('data-utopia-root-element-path'),
  )

  if (canvasRootPath == null) {
    throw new Error('Utopia Internal Error: Running DOM-walker without canvasRootPath')
  }

  globalProps.invalidatedPaths.delete(EP.toString(canvasRootPath)) // global mutation!
  globalProps.pathsCollectedMutable.push(canvasRootPath)

  if (
    ObserversAvailable &&
    globalProps.invalidatedPaths.size === 0 &&
    Object.keys(globalProps.rootMetadataInStateRef.current).length > 0 &&
    globalProps.additionalElementsToUpdate.length === 0 &&
    !globalProps.forceInvalidated
  ) {
    // no mutation happened on the entire canvas, just return the old metadata
    return {
      metadata: globalProps.rootMetadataInStateRef.current,
      cachedPaths: [canvasRootPath],
    }
  } else {
    const { rootMetadata, cachedPaths } = walkSceneInner(canvasRoot, canvasRootPath, globalProps)
    // The Storyboard root being a fragment means it is invisible to us in the DOM walker,
    // so walkCanvasRootFragment will create a fake root ElementInstanceMetadata
    // to provide a home for the the (really existing) childMetadata
    const metadata: ElementInstanceMetadata = elementInstanceMetadata(
      canvasRootPath,
      left('Storyboard'),
      infinityCanvasRectangle,
      infinityCanvasRectangle,
      false,
      false,
      emptySpecialSizeMeasurements,
      emptyComputedStyle,
      emptyAttributeMetadata,
      null,
      null, // this comes from the Spy Wrapper
      'not-a-conditional',
      null,
      null,
      null,
    )

    rootMetadata[EP.toString(canvasRootPath)] = metadata

    return { metadata: rootMetadata, cachedPaths: cachedPaths }
  }
}

function walkScene(
  scene: HTMLElement,
  globalProps: DomWalkerInternalGlobalProps,
): {
  metadata: ElementInstanceMetadataMap
  cachedPaths: Array<ElementPath>
} {
  if (scene instanceof HTMLElement) {
    // Right now this assumes that only UtopiaJSXComponents can be rendered via scenes,
    // and that they can only have a single root element
    const sceneIndexAttr = scene.attributes.getNamedItemNS(null, UTOPIA_SCENE_ID_KEY)
    const sceneID = sceneIndexAttr?.value ?? null
    const instancePath = sceneID == null ? null : EP.fromString(sceneID)

    if (sceneID != null && instancePath != null && EP.isElementPath(instancePath)) {
      const invalidatedScene =
        globalProps.forceInvalidated ||
        (ObserversAvailable &&
          globalProps.invalidatedPaths.size > 0 &&
          globalProps.invalidatedPaths.has(sceneID))

      globalProps.invalidatedPaths.delete(sceneID) // global mutation!

      const {
        childPaths: rootElements,
        rootMetadata,
        cachedPaths,
      } = walkSceneInner(scene, instancePath, {
        ...globalProps,
        forceInvalidated: invalidatedScene,
      })
      globalProps.pathsCollectedMutable.push(instancePath)

      const { collectedMetadata: sceneMetadata, cachedPaths: sceneCachedPaths } = collectMetadata(
        scene,
        [{ path: instancePath, asString: sceneID }],
        [instancePath],
        [sceneID],
        canvasPoint({ x: 0, y: 0 }),
        instancePath,
        rootElements,
        invalidatedScene,
        globalProps,
      )

      mergeMetadataMaps_MUTATE(rootMetadata, sceneMetadata)

      return {
        metadata: rootMetadata,
        cachedPaths: [...cachedPaths, ...sceneCachedPaths],
      }
    }
  }
  return { metadata: {}, cachedPaths: [] } // verify
}

function walkSceneInner(
  scene: HTMLElement,
  closestOffsetParentPath: ElementPath,
  globalProps: DomWalkerInternalGlobalProps,
): {
  childPaths: Array<ElementPath>
  rootMetadata: ElementInstanceMetadataMap
  cachedPaths: Array<ElementPath>
} {
  const globalFrame: CanvasRectangle = globalFrameForElement(
    scene,
    globalProps.scale,
    globalProps.containerRectLazy,
    'without-text-content',
    'nearest-half',
  )

  let childPaths: Array<ElementPath> = []
  let rootMetadataAccumulator: ElementInstanceMetadataMap = {}
  let cachedPathsAccumulator: Array<ElementPath> = []

  scene.childNodes.forEach((childNode) => {
    const {
      childPaths: childNodePaths,
      rootMetadata,
      cachedPaths,
    } = walkElements(childNode, globalFrame, closestOffsetParentPath, globalProps)

    childPaths.push(...childNodePaths)
    mergeMetadataMaps_MUTATE(rootMetadataAccumulator, rootMetadata)
    cachedPathsAccumulator.push(...cachedPaths)
  })

  return {
    childPaths: childPaths,
    rootMetadata: rootMetadataAccumulator,
    cachedPaths: cachedPathsAccumulator,
  }
}

// Walks through the DOM producing the structure and values from within.
function walkElements(
  element: Node,
  parentPoint: CanvasPoint,
  closestOffsetParentPath: ElementPath,
  globalProps: DomWalkerInternalGlobalProps,
): {
  childPaths: ReadonlyArray<ElementPath>
  rootMetadata: ElementInstanceMetadataMap
  cachedPaths: Array<ElementPath>
} {
  if (isScene(element)) {
    // we found a nested scene, restart the walk
    const { metadata, cachedPaths: cachedPaths } = walkScene(element, globalProps)

    const result = {
      childPaths: [],
      rootMetadata: metadata,
      cachedPaths: cachedPaths,
    }
    return result
  }
  if (element instanceof HTMLElement) {
    let closestOffsetParentPathInner: ElementPath = closestOffsetParentPath
    // If this element provides bounds for absolute children, we want to update the closest offset parent path
    if (isElementAContainingBlockForAbsolute(window.getComputedStyle(element))) {
      const deepestPath = getDeepestPathOnDomElement(element)
      if (deepestPath != null) {
        closestOffsetParentPathInner = deepestPath
      }
    }

    let invalidatedElement = false

    const pathsWithStrings = getPathWithStringsOnDomElement(element)
    for (const pathWithString of pathsWithStrings) {
      invalidatedElement =
        globalProps.forceInvalidated ||
        (ObserversAvailable &&
          globalProps.invalidatedPaths.size > 0 &&
          globalProps.invalidatedPaths.has(pathWithString.asString))

      globalProps.invalidatedPaths.delete(pathWithString.asString) // global mutation!
    }

    const doNotTraverseAttribute = getDOMAttribute(element, UTOPIA_DO_NOT_TRAVERSE_KEY)
    const traverseChildren: boolean = doNotTraverseAttribute !== 'true'

    const globalFrame = globalFrameForElement(
      element,
      globalProps.scale,
      globalProps.containerRectLazy,
      'without-text-content',
      'nearest-half',
    )

    // Check this is a path we're interested in, otherwise skip straight to the children
    const foundValidPaths = pathsWithStrings.filter((pathWithString) => {
      const staticPath = EP.makeLastPartOfPathStatic(pathWithString.path)
      return globalProps.validPaths.some((validPath) => {
        return EP.pathsEqual(staticPath, validPath)
      })
    })
    globalProps.pathsCollectedMutable.push(
      ...foundValidPaths.map((pathWithString) => pathWithString.path),
    )

    // Build the metadata for the children of this DOM node.
    let childPaths: Array<ElementPath> = []
    let rootMetadataAccumulator: ElementInstanceMetadataMap = {}
    let cachedPathsAccumulator: Array<ElementPath> = []
    // TODO: we should not traverse the children when all elements of this subtree will be retrieved from cache anyway
    // WARNING: we need to retrieve the metadata of all elements of the subtree from the cache, because the SAVE_DOM_REPORT
    // action replaces (and not merges) the full metadata map
    if (traverseChildren) {
      element.childNodes.forEach((child) => {
        const {
          childPaths: childNodePaths,
          rootMetadata: rootMetadataInner,
          cachedPaths,
        } = walkElements(child, globalFrame, closestOffsetParentPathInner, globalProps)
        childPaths.push(...childNodePaths)
        mergeMetadataMaps_MUTATE(rootMetadataAccumulator, rootMetadataInner)
        cachedPathsAccumulator.push(...cachedPaths)
      })
    }

    const uniqueChildPaths = uniqBy(childPaths, EP.pathsEqual)

    const { collectedMetadata, cachedPaths, collectedPaths } = collectMetadata(
      element,
      pathsWithStrings,
      pluck(foundValidPaths, 'path'),
      pluck(foundValidPaths, 'asString'),
      parentPoint,
      closestOffsetParentPath,
      uniqueChildPaths,
      invalidatedElement,
      globalProps,
    )

    mergeMetadataMaps_MUTATE(rootMetadataAccumulator, collectedMetadata)
    cachedPathsAccumulator = [...cachedPathsAccumulator, ...cachedPaths]
    return {
      rootMetadata: rootMetadataAccumulator,
      childPaths: collectedPaths,
      cachedPaths: cachedPathsAccumulator,
    }
  } else {
    return { childPaths: [], rootMetadata: {}, cachedPaths: [] }
  }
}

function getClosestOffsetParent(element: HTMLElement): Element | null {
  let currentElement: HTMLElement | null = element

  while (currentElement != null) {
    if (currentElement.offsetParent != null) {
      return currentElement.offsetParent
    }
    currentElement = currentElement.parentElement
  }
  return null
}
