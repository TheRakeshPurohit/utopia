import * as React from 'react'
import { MapLike } from 'typescript'
import { EmptyScenePathForStoryboard } from '../../../core/model/scene-utils'
import { right } from '../../../core/shared/either'
import {
  ElementInstanceMetadata,
  emptyAttributeMetadatada,
  emptyComputedStyle,
  emptySpecialSizeMeasurements,
  getJSXElementNameNoPathName,
  JSXElement,
} from '../../../core/shared/element-template'
import {
  ElementPath,
  InstancePath,
  ScenePath,
  TemplatePath,
} from '../../../core/shared/project-file-types'
import { makeCanvasElementPropsSafe } from '../../../utils/canvas-react-utils'
import { UiJsxCanvasContextData } from '../ui-jsx-canvas'
import * as TP from '../../../core/shared/template-path'
import { renderComponentUsingJsxFactoryFunction } from './ui-jsx-canvas-element-renderer-utils'
import { getTopLevelElementName, useGetValidTemplatePaths } from './scene-root'
import { UTOPIA_UID_KEY } from '../../../core/model/utopia-constants'
import { getUtopiaID } from '../../../core/model/element-template-utils'
import { ComponentRendererComponent } from './ui-jsx-canvas-component-renderer'
import { dropLast, last } from '../../../core/shared/array-utils'

export function buildSpyWrappedElement(
  jsx: JSXElement,
  finalProps: any,
  templatePath: InstancePath,
  extendedTemplatePath: ElementPath,
  metadataContext: UiJsxCanvasContextData,
  childrenTemplatePaths: Array<InstancePath>,
  childrenElements: Array<React.ReactNode>,
  Element: any,
  inScope: MapLike<any>,
  jsxFactoryFunctionName: string | null,
  shouldIncludeCanvasRootInTheSpy: boolean,
  focusedElementTemplatePath: ElementPath | null,
  validPathsForCurrentScene: Array<InstancePath>,
): React.ReactElement {
  let props = {
    ...finalProps,
    key: TP.toComponentId(templatePath),
  }

  if (TP.elementPathsEqual(extendedTemplatePath, focusedElementTemplatePath)) {
    // Replace the instance's UID with the definition's
    const originalComponent = inScope[jsx.name.baseVariable]
    const originalUID = (originalComponent as ComponentRendererComponent)?.originalUID
    props[UTOPIA_UID_KEY] = originalUID ?? getUtopiaID(jsx)
  }

  let topLevelElementName = ''

  let scenePath: ScenePath | null = null

  const fixedChildrenTemplatePaths = childrenTemplatePaths.map((childTemplatePath, index) => {
    const originalUid = (childrenElements[index] as React.ReactElement)?.props?.elementToRender
      ?.originalUID

    if (TP.elementPathsEqual(extendedTemplatePath, dropLast(focusedElementTemplatePath ?? []))) {
      // ERROR: this is not correct, because if you drilling into an element inside a component inside a component, that will totally TOTALLY not show up in childrenTemplatePaths
      // FFFFFUUUUU
      // we probably need to move data-utopia-valid-paths onto the spied element itself, instead of designating its parent as a "scene"

      topLevelElementName = (childrenElements[index] as React.ReactElement)?.props?.elementToRender
        ?.topLevelElementName // THIS IS A SPIKE, RELAX

      scenePath = TP.scenePath([
        ...TP.scenePathForPath(templatePath).sceneElementPath,
        ...TP.elementPathForPath(templatePath),
        TP.toUid(childTemplatePath),
      ])

      const fixedTemplatePath = TP.instancePath(scenePath, [originalUid])

      return fixedTemplatePath
    } else {
      return childTemplatePath
    }
  })

  const childrenElementsOrNull = childrenElements.length > 0 ? childrenElements : null
  const spyCallback = (reportedProps: any) => {
    const instanceMetadata: ElementInstanceMetadata = {
      element: right(jsx),
      templatePath: templatePath,
      props: makeCanvasElementPropsSafe(reportedProps),
      globalFrame: null,
      localFrame: null,
      children: fixedChildrenTemplatePaths,
      componentInstance: false,
      specialSizeMeasurements: emptySpecialSizeMeasurements, // This is not the nicest, but the results from the DOM walker will override this anyways
      computedStyle: emptyComputedStyle,
      attributeMetadatada: emptyAttributeMetadatada,
    }
    const isChildOfRootScene = TP.pathsEqual(
      TP.scenePathForPath(templatePath),
      EmptyScenePathForStoryboard,
    )
    if (!isChildOfRootScene || shouldIncludeCanvasRootInTheSpy) {
      metadataContext.current.spyValues.metadata[TP.toComponentId(templatePath)] = instanceMetadata
    }
  }

  const spyWrapperProps: SpyWrapperProps = {
    elementToRender: Element,
    spyCallback: spyCallback,
    inScope: inScope,
    jsxFactoryFunctionName: jsxFactoryFunctionName,
    scenePath: scenePath,
    topLevelElementName: topLevelElementName,
    validPathsForCurrentScene: validPathsForCurrentScene,
  }

  return renderComponentUsingJsxFactoryFunction(
    inScope,
    jsxFactoryFunctionName,
    SpyWrapper,
    {
      ...props,
      ...spyWrapperProps,
    },
    childrenElementsOrNull,
  )
}

interface SpyWrapperProps {
  spyCallback: (finalProps: any) => void
  elementToRender: React.ComponentType<any>
  inScope: MapLike<any>
  jsxFactoryFunctionName: string | null
  topLevelElementName: string | null
  scenePath: ScenePath | null
  validPathsForCurrentScene: Array<InstancePath>
}
const SpyWrapper: React.FunctionComponent<SpyWrapperProps> = (props) => {
  const {
    spyCallback,
    elementToRender: ElementToRender,
    inScope,
    jsxFactoryFunctionName,
    topLevelElementName,
    scenePath,
    validPathsForCurrentScene,
    ...passThroughProps
  } = props
  const validPaths = useGetValidTemplatePaths(topLevelElementName, scenePath ?? TP.scenePath([]))

  const cumulativeValidPathsAsString = [...validPathsForCurrentScene, ...validPaths]
    .map(TP.toString)
    .join(' ')

  spyCallback(passThroughProps)
  const result = renderComponentUsingJsxFactoryFunction(
    inScope,
    jsxFactoryFunctionName,
    ElementToRender,
    passThroughProps,
  )
  if (scenePath == null) {
    return result
  } else {
    // this element is promoted to be a temporary Scene
    return React.cloneElement(result, {
      'data-utopia-valid-paths': cumulativeValidPathsAsString,
      'data-utopia-scene-id': TP.elementPathToString(scenePath?.sceneElementPath),
    })
  }
}
SpyWrapper.displayName = 'SpyWapper'
