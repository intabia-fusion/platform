//
// Copyright © 2024 Hardcore Engineering Inc.
//

import { type Doc } from '@intabiafusion/core'
import { type IntlString, type Metadata, type Plugin, plugin, type Asset, type Resource } from '@intabiafusion/platform'
import { type AnyComponent } from '@intabiafusion/ui/src/types'

export const printId = 'print' as Plugin

export const print = plugin(printId, {
  string: {
    PrintToPDF: '' as IntlString,
    PrintingDocumentOf: '' as IntlString,
    DownloadAll: '' as IntlString,
    PrintFailed: '' as IntlString
  },
  component: {
    PrintToPDF: '' as AnyComponent,
    PrintBulkToPDF: '' as AnyComponent,
    DOCXViewer: '' as AnyComponent
  },
  icon: {
    Print: '' as Asset
  },
  metadata: {
    PrintURL: '' as Metadata<string>
  },
  function: {
    CanPrint: '' as Resource<(doc?: Doc | Doc[]) => Promise<boolean>>,
    CanConvert: '' as Resource<() => Promise<boolean>>
  }
})

export default print
