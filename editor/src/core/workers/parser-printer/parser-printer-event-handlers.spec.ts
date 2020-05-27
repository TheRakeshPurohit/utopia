import { printCode, printCodeOptions } from './parser-printer'
import { applyPrettier } from './prettier-utils'
import { isRight } from '../../shared/either'
import { testParseCode } from './parser-printer-test-utils'
import { BakedInStoryboardUID, BakedInStoryboardVariableName } from '../../model/scene-utils'

describe('JSX parser', () => {
  it('should preserve arrow functions in printed code', () => {
    const code = applyPrettier(
      `
import * as React from "react";
import {
  Ellipse,
  Image,
  Rectangle,
  Scene,
  Storyboard,
  Text,
  UtopiaUtils,
  View
} from "utopia-api";
export var App = props => {
  return (
    <View data-uid={'aaa'} onClick={() => {console.log('hat')}}/>
  )
}
export var ${BakedInStoryboardVariableName} = (props) => {
  return (
    <Storyboard data-uid={'${BakedInStoryboardUID}'}>
      <Scene
        style={{ left: 0, top: 0, width: 400, height: 400 }}
        component={App}
        layout={{ layoutSystem: 'pinSystem' }}
        props={{ layout: { bottom: 0, left: 0, right: 0, top: 0 } }}
        data-uid={'scene-aaa'}
      />
    </Storyboard>
  )
}`,
      false,
    ).formatted
    const parseResult = testParseCode(code)
    if (isRight(parseResult)) {
      const printedCode = printCode(
        printCodeOptions(false, true, true),
        parseResult.value.imports,
        parseResult.value.topLevelElements,
        parseResult.value.jsxFactoryFunction,
      )

      const expectedCode = applyPrettier(
        `import * as React from "react";
import {
  Ellipse,
  Image,
  Rectangle,
  Scene,
  Storyboard,
  Text,
  UtopiaUtils,
  View
} from "utopia-api";
export var App = props => {
  return (
    <View
      data-uid={"aaa"}
      onClick={() => {
        console.log("hat");
      }}
    />
  );
};
export var ${BakedInStoryboardVariableName} = (props) => {
  return (
    <Storyboard data-uid={'${BakedInStoryboardUID}'}>
      <Scene
        style={{ left: 0, top: 0, width: 400, height: 400 }}
        component={App}
        layout={{ layoutSystem: 'pinSystem' }}
        props={{ layout: { bottom: 0, left: 0, right: 0, top: 0 } }}
        data-uid={'scene-aaa'}
      />
    </Storyboard>
  )
}
`,
        false,
      ).formatted
      expect(printedCode).toEqual(expectedCode)
    } else {
      fail(parseResult.value)
    }
  })
})
