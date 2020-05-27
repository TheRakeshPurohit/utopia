import { Placement } from '@tippyjs/react/node_modules/tippy.js'
import * as React from 'react'
import { betterReactMemo } from 'uuiui-deps'
import { getPossiblyHashedURL } from '../utils/hashed-assets'
import { Tooltip } from './tooltip'

export type IcnColor =
  | 'white'
  | 'gray'
  | 'darkgray'
  | 'lightgray'
  | 'black'
  | 'blue'
  | 'purple'
  | 'red'
  | 'orange'

export interface IcnProps {
  category?: string
  type: string
  color?: IcnColor
  width?: number
  height?: number
  style?: React.CSSProperties
  className?: string
  isDisabled?: boolean
  tooltipText?: string
  tooltipPlacement?: Placement
  onMouseDown?: (event: React.MouseEvent<HTMLImageElement>) => void
  onClick?: (event: React.MouseEvent<HTMLImageElement>) => void
  onDoubleClick?: (event: React.MouseEvent<HTMLImageElement>) => void
  onMouseUp?: (event: React.MouseEvent<HTMLImageElement>) => void
  onMouseOver?: (event: React.MouseEvent<HTMLImageElement>) => void
  onMouseLeave?: (event: React.MouseEvent<HTMLImageElement>) => void
}

export const Icn = betterReactMemo(
  'Icn',
  ({
    category = 'semantic',
    width = 16,
    height = 16,
    color = 'darkgray',
    isDisabled = false,
    ...props
  }: IcnProps) => {
    const theme = 'light'

    const disabledStyle = isDisabled ? { opacity: 0.5 } : undefined

    const { onMouseDown: propsOnMouseDown, onClick } = props
    const onMouseDown = React.useCallback(
      (e: React.MouseEvent<HTMLImageElement>) => {
        if (propsOnMouseDown) {
          propsOnMouseDown(e)
        }
        if (onClick != null) {
          e.stopPropagation()
        }
      },
      [propsOnMouseDown, onClick],
    )

    const imageElement = (
      <img
        style={{
          userSelect: 'none',
          ...props.style,
          ...disabledStyle,
        }}
        className={props.className}
        width={width}
        height={height}
        src={getPossiblyHashedURL(
          `/editor/icons/${theme}/${category}/${props.type}-${color}-${width}x${height}@2x.png`,
        )}
        draggable={false}
        onClick={isDisabled ? undefined : props.onClick}
        onDoubleClick={isDisabled ? undefined : props.onDoubleClick}
        onMouseDown={onMouseDown}
        onMouseUp={isDisabled ? undefined : props.onMouseUp}
        onMouseOver={props.onMouseOver}
        onMouseLeave={props.onMouseLeave}
      />
    )
    if (props.tooltipText == null) {
      return imageElement
    } else {
      return (
        <Tooltip title={props.tooltipText} placement={props.tooltipPlacement}>
          {imageElement}
        </Tooltip>
      )
    }
  },
)
Icn.displayName = 'Icon'

export const IcnSpacer = betterReactMemo(
  'Icn Spacer',
  ({ width = 16, height = 16 }: { width?: number; height?: number }) => {
    return <div style={{ width, height }} />
  },
)
