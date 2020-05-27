import { v4 as UUID } from 'uuid'
import { Either, flatMapEither, isLeft, left, right } from './either'
import {
  JSXAttributes,
  jsxAttributeValue,
  JSXElement,
  JSXElementChild,
  isJSXElement,
  isJSXAttributeValue,
  isJSXArbitraryBlock,
} from './element-template'
import { shallowEqual } from './equality-utils'
import {
  getModifiableJSXAttributeAtPath,
  jsxSimpleAttributeToValue,
  setJSXValueAtPath,
} from './jsx-attributes'
import * as PP from './property-path'
import { objectMap } from './object-utils'

export const UtopiaIDPropertyPath = PP.create(['data-uid'])

export function generateUID(existingIDs: Array<string>): string {
  const fullUid = UUID().replace(/\-/g, '')
  // trying to find a new 3 character substring from the full uid
  for (let i = 0; i < fullUid.length - 3; i++) {
    const id = fullUid.substring(i, i + 3)
    if (!existingIDs.includes(id)) {
      return id
    }
  }
  // if all the substrings are already used as ids, let's try again with a new full uid
  return generateUID(existingIDs)
}

export function setUtopiaIDOnJSXElement(element: JSXElement, uid: string): JSXElement {
  return {
    ...element,
    props: {
      ...element.props,
      ['data-uid']: jsxAttributeValue(uid),
    },
  }
}

export function parseUID(attributes: JSXAttributes): Either<string, string> {
  const uidAttribute = getModifiableJSXAttributeAtPath(attributes, UtopiaIDPropertyPath)
  const uidValue = flatMapEither(jsxSimpleAttributeToValue, uidAttribute)
  return flatMapEither((uid) => {
    if (typeof uid === 'string') {
      return right(uid)
    } else {
      return left('Unexpected data-uid value.')
    }
  }, uidValue)
}

export function getUtopiaIDFromJSXElement(element: JSXElement): string {
  const possibleUID = parseUID(element.props)
  if (isLeft(possibleUID)) {
    throw new Error('Every Utopia Element must have a valid props.data-uid')
  } else {
    return possibleUID.value
  }
}

export function fixUtopiaElement(
  elementToFix: JSXElementChild,
  uniqueIDs: Array<string>,
): JSXElementChild {
  function fixUtopiaElementInner<T extends JSXElementChild>(element: T): T {
    if (isJSXElement(element)) {
      let fixedChildren = element.children.map((elem) => fixUtopiaElementInner(elem))
      if (shallowEqual(element.children, fixedChildren)) {
        // saving reference equality in case the children didn't need fixing
        fixedChildren = element.children
      }

      if (
        element.props['data-uid'] == null ||
        !isJSXAttributeValue(element.props['data-uid']) ||
        uniqueIDs.includes(element.props['data-uid'].value)
      ) {
        const newUID = generateUID(uniqueIDs)
        const fixedProps = setJSXValueAtPath(
          element.props,
          UtopiaIDPropertyPath,
          jsxAttributeValue(newUID),
        )

        if (isLeft(fixedProps)) {
          console.error(`Failed to add a uid to an element missing one ${fixedProps.value}`)
          return element
        } else {
          uniqueIDs.push(newUID)
          return {
            ...element,
            props: fixedProps.value,
            children: fixedChildren,
          }
        }
      } else if (element.children !== fixedChildren) {
        uniqueIDs.push(element.props['data-uid'].value)
        return {
          ...element,
          children: fixedChildren,
        }
      } else {
        uniqueIDs.push(element.props['data-uid'].value)
        return element
      }
    } else if (isJSXArbitraryBlock(element)) {
      const fixedElementsWithin = objectMap(fixUtopiaElementInner, element.elementsWithin)
      if (shallowEqual(element.elementsWithin, fixedElementsWithin)) {
        return element
      } else {
        return {
          ...element,
          elementsWithin: fixedElementsWithin,
        }
      }
    } else {
      return element
    }
  }

  return fixUtopiaElementInner(elementToFix)
}
