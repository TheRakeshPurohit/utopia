/** @jsxRuntime classic */
/** @jsx jsx */
import { jsx } from '@emotion/react'
import React from 'react'
import { Icn, type IcnProps } from '../../../uuiui'
import { dark } from '../../../uuiui/styles/theme/dark'
import type { JSXElementChild } from '../../../core/shared/element-template'
import { type Imports } from '../../../core/shared/project-file-types'
import { elementFromInsertMenuItem } from '../../editor/insert-callbacks'
import { type ComponentElementToInsert } from '../../custom-code/code-file'
import type { InsertMenuItemGroup } from '../../canvas/ui/floating-insert-menu'
import { UIGridRow } from '../../../components/inspector/widgets/ui-grid-row'
import { FlexRow, type Icon } from 'utopia-api'
import { assertNever } from '../../../core/shared/utils'

export interface ComponentPickerProps {
  insertionTargetName: string
  allComponents: Array<InsertMenuItemGroup>
  onItemClick: (elementToInsert: ElementToInsert) => React.MouseEventHandler
  onClickCloseButton?: React.MouseEventHandler
}

export interface ElementToInsert {
  elementToInsert: (uid: string) => JSXElementChild
  additionalImports: Imports
}

export function componentPickerTestIdForProp(prop: string): string {
  return `component-picker-${prop}`
}

export const componentPickerCloseButtonTestId = `component-picker-close-button`
export const componentPickerFilterInputTestId = `component-picker-filter-input`

export function componentPickerOptionTestId(componentName: string, variant?: string): string {
  const variantSuffix = variant == null ? '' : `-${variant}`
  return `component-picker-option-${componentName}${variantSuffix}`
}

export const ComponentPicker = React.memo((props: ComponentPickerProps) => {
  const [filter, setFilter] = React.useState<string>('')

  const allComponentsToShow: InsertMenuItemGroup[] = []

  props.allComponents.forEach((c) => {
    allComponentsToShow.push({
      ...c,
      options: c.options.filter((o) =>
        o.label.toLocaleLowerCase().includes(filter.toLocaleLowerCase().trim()),
      ),
    })
  })

  const componentsToShow = allComponentsToShow

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 0,
        width: '100%',
        height: '100%',
        padding: 0,
        color: dark.fg3.value,
        borderRadius: 10,
      }}
      data-testId={componentPickerTestIdForProp(props.insertionTargetName)}
    >
      <ComponentPickerTopSection onFilterChange={setFilter} />
      <ComponentPickerComponentSection
        components={componentsToShow}
        onItemClick={props.onItemClick}
      />
    </div>
  )
})

interface ComponentPickerTopSectionProps {
  onFilterChange: (filter: string) => void
}

const ComponentPickerTopSection = React.memo((props: ComponentPickerTopSectionProps) => {
  const { onFilterChange } = props

  return (
    <div
      style={{
        padding: '8px 8px',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <FilterBar onFilterChange={onFilterChange} />
    </div>
  )
})

interface FilterBarProps {
  onFilterChange: (filter: string) => void
}

const FilterBar = React.memo((props: FilterBarProps) => {
  const { onFilterChange } = props

  const [filter, setFilterState] = React.useState<string>('')
  const setFilter = React.useCallback(
    (s: string) => {
      setFilterState(s)
      onFilterChange(s)
    },
    [onFilterChange],
  )

  const handleFilterKeydown = React.useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        ;(e.target as HTMLInputElement).blur() // Not sure why I need the cast here
      } else if (e.key === 'Escape') {
        setFilter('')
        ;(e.target as HTMLInputElement).blur()
      }
      e.stopPropagation()
    },
    [setFilter],
  )
  const handleFilterChange = React.useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setFilter(e.target.value)
    },
    [setFilter],
  )

  return (
    <input
      css={{
        height: 25,
        paddingLeft: 8,
        paddingRight: 8,
        background: 'transparent',
        // border: `1px solid ${dark.fg3.value}`, --> doesn't work because uses the css var
        border: `1px solid #888`,
        color: `#888`,
        borderRadius: 4,
        width: '100%',
        '&:focus': {
          color: '#ccc',
          borderColor: '#ccc',
        },
      }}
      placeholder='Filter...'
      autoComplete='off'
      autoFocus={true}
      spellCheck={false}
      onKeyDown={handleFilterKeydown}
      onChange={handleFilterChange}
      value={filter}
      data-testId={componentPickerFilterInputTestId}
    />
  )
})

interface ComponentPickerComponentSectionProps {
  components: Array<InsertMenuItemGroup>
  onItemClick: (elementToInsert: ElementToInsert) => React.MouseEventHandler
}

const ComponentPickerComponentSection = React.memo(
  (props: ComponentPickerComponentSectionProps) => {
    const { components, onItemClick } = props
    return (
      <div style={{ maxHeight: 250, overflowY: 'scroll' }}>
        {components.map((comp) => {
          return (
            <ComponentPickerOption
              key={`${comp.label}-label`}
              component={comp}
              onItemClick={onItemClick}
            />
          )
        })}
      </div>
    )
  },
)

// FIXME Copy pasted from component-picker-context-menu.tsx
function iconPropsForIcon(icon: Icon): IcnProps {
  switch (icon) {
    case 'column':
      return {
        category: 'navigator-element',
        type: 'flex-column',
        color: 'white',
      }
    case 'row':
      return {
        category: 'navigator-element',
        type: 'flex-row',
        color: 'white',
      }
    case 'regular':
      return {
        category: 'navigator-element',
        type: 'component',
        color: 'white',
      }
    default:
      assertNever(icon)
  }
}

interface ComponentInfoWithIcon {
  insertMenuLabel: string
  elementToInsert: () => ComponentElementToInsert
  importsToAdd: Imports
  icon: Icon
}

function componentInfoWithIcon(
  insertMenuLabel: string,
  elementToInsert: () => ComponentElementToInsert,
  importsToAdd: Imports,
  icon: Icon,
): ComponentInfoWithIcon {
  return {
    insertMenuLabel: insertMenuLabel,
    elementToInsert: elementToInsert,
    importsToAdd: importsToAdd,
    icon: icon,
  }
}

interface ComponentPickerOptionProps {
  component: InsertMenuItemGroup
  onItemClick: (elementToInsert: ElementToInsert) => React.MouseEventHandler
}

function variantsForComponent(component: InsertMenuItemGroup): ComponentInfoWithIcon[] {
  return component.options.map((v) =>
    componentInfoWithIcon(
      v.label,
      v.value.element,
      v.value.importsToAdd,
      v.value.icon ?? 'regular',
    ),
  )
}

const ComponentPickerOption = React.memo((props: ComponentPickerOptionProps) => {
  const { component, onItemClick } = props

  const variants = variantsForComponent(component)

  const name = component.label

  return (
    <div>
      {variants.map((v) => (
        <FlexRow
          key={`${name}-${v.insertMenuLabel}`}
          css={{
            marginLeft: 8,
            marginRight: 8,
            borderRadius: 4,
            // indentation!
            paddingLeft: 8,
            color: '#EEE',
            '&:hover': {
              background: '#007aff',
              color: 'white',
            },
          }}
          onClick={onItemClick({
            elementToInsert: (uid) => elementFromInsertMenuItem(v.elementToInsert(), uid),
            additionalImports: v.importsToAdd,
          })}
        >
          <UIGridRow
            variant='|--32px--|<--------auto-------->'
            padded={false}
            // required to overwrite minHeight on the bloody thing
            style={{ minHeight: 29 }}
            css={{
              height: 27,
            }}
          >
            <Icn {...iconPropsForIcon(v.icon)} width={12} height={12} />
            <label>{v.insertMenuLabel}</label>
          </UIGridRow>
        </FlexRow>
      ))}
    </div>
  )
})
