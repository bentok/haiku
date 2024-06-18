import React from 'react'
import { DocsThemeConfig } from 'nextra-theme-docs'

const config: DocsThemeConfig = {
  logo: <span>Nephesh</span>,
  footer: {
    text: 'Copyright © 2024 Ben Copeland',
  },
  feedback: {
    content: () => <></>
  },
  editLink: {
    component: () => <></>
  },
  toc: {
    component: () => <></>
  },
  gitTimestamp: () => <></>,
  search: {
    placeholder: 'Search',
  },
}

export default config
