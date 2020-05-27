import * as React from 'react'
import { H2 } from '../../../../../uuiui'
import { betterReactMemo } from '../../../../../uuiui-deps'
import { SeeMoreButton, SeeMoreHOC, useToggle } from '../../../widgets/see-more'
import { GridRow } from '../../../widgets/grid-row'
import { BlendModeRow } from './blendmode-row'
import { OpacityRow } from './opacity-row'
import { OverflowRow } from './overflow-row'
import { RadiusRow } from './radius-row'

export const ContainerSubsection = betterReactMemo('ContainerSubsection', () => {
  const [seeMoreVisible, toggleSeeMoreVisible] = useToggle(false)
  return (
    <>
      <GridRow padded={true} type='<--------auto-------->||22px|'>
        <H2>Container</H2>
        <SeeMoreButton
          seeMoreVisible={seeMoreVisible}
          toggleSeeMoreVisible={toggleSeeMoreVisible}
        />
      </GridRow>
      <OpacityRow />
      <OverflowRow />
      <RadiusRow />
      <SeeMoreHOC visible={seeMoreVisible}>
        <BlendModeRow />
      </SeeMoreHOC>
    </>
  )
})
