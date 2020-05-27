/** @jsx jsx */
import { jsx } from '@emotion/core'
import styled from '@emotion/styled'

import * as React from 'react'
import { colorTheme, UtopiaStyles, SimpleFlexRow } from 'uuiui'
import { H1, H2, PrettyKeys, EM, CalloutPrimary, A } from './documentation-components'

import { renderedGettingStarted } from './getting-started'

export function ReleaseNotesContent() {
  return (
    <div
      css={{
        label: 'ReleaseNotesContainer',
        backgroundColor: colorTheme.emphasizedBackground.value,
        padding: '26px 43px',
        fontSize: '16px',
        lineHeight: '26px',
        paddingBottom: 18,
        cursor: 'text',
        userSelect: 'text',
        WebkitUserSelect: 'text',
        overflow: 'scroll',
        whiteSpace: 'pre-wrap',
        maxWidth: 800,
        marginLeft: 'auto',
        marginRight: 'auto',
        '&  *': {
          userSelect: 'text',
          WebkitUserSelect: 'text',
        },
      }}
    >
      {renderedGettingStarted}
    </div>
  )
}
