import * as React from 'react'
import * as PP from '../../../../../core/shared/property-path'
import { PropertyLabel } from '../../../widgets/property-label'
import {
  betterReactMemo,
  NewInspectorContextMenuItems,
  NewInspectorContextMenuWrapper,
  SelectOption,
} from 'uuiui-deps'
import { useInspectorStyleInfo } from '../../../new-inspector/new-inspector-hooks'
import { GridRow } from '../../../widgets/grid-row'
import { PopupList } from '../../../../../uuiui'

const blendModeOptions = [
  { value: 'normal', label: 'Normal' },
  { value: 'multiply', label: 'Multiply' },
  { value: 'screen', label: 'Screen' },
  { value: 'darken', label: 'Darken' },
]

const blendModeProp = [PP.create(['style', 'mixBlendMode'])]

export const BlendModeRow = betterReactMemo('BlendModeRow', () => {
  const blendModeMetadata = useInspectorStyleInfo('mixBlendMode')
  const [onSubmitBlendModeOption] = blendModeMetadata.useSubmitValueFactory(
    (selectedOption: SelectOption) => selectedOption.value,
  )
  const blendMode = blendModeMetadata.value

  const whichBlendModeOption = blendModeOptions.find((option) => option.value === blendMode)

  const blendModeContextMenuItems = NewInspectorContextMenuItems.optionalAddOnUnsetValues(
    blendMode != null,
    ['mixBlendMode'],
    blendModeMetadata.onUnsetValues,
  )

  return (
    <NewInspectorContextMenuWrapper
      id='blendmode-row-context-menu'
      items={blendModeContextMenuItems}
      data={null}
    >
      <GridRow padded={true} type='<---1fr--->|------172px-------|'>
        <PropertyLabel target={blendModeProp}>Blendmode</PropertyLabel>
        <PopupList
          containerMode='default'
          value={whichBlendModeOption}
          options={blendModeOptions}
          onSubmitValue={onSubmitBlendModeOption}
          controlStyles={blendModeMetadata.controlStyles}
        />
      </GridRow>
    </NewInspectorContextMenuWrapper>
  )
})
