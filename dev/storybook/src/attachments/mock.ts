//
// Copyright © 2026 Intabia Fusion.
//
// Licensed under the Eclipse Public License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License. You may
// obtain a copy of the License at https://www.eclipse.org/legal/epl-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
//
// See the License for the specific language governing permissions and
// limitations under the License.
//

import { getCurrentAccount, Hierarchy, ModelDb, setCurrentAccount, type Client } from '@hcengineering/core'
import { addLocation, addStringsLoader, setMetadata, type Plugin } from '@hcengineering/platform'
import presentation, { previewTypes, setClient } from '@hcengineering/presentation'
import registerPresentationStrings from '@hcengineering/presentation/src/lang'
import view from '@hcengineering/view'
import { readable } from 'svelte/store'

import kitSprite from '../../../../packages/ui/assets/icons.svg?url'
import { addEmojiLocation } from '../emoji'
import HighlightStub from './HighlightStub.svelte'

let ready: Promise<void> | undefined
let client: Client | undefined

function useViewer (): void {
  setCurrentAccount({
    uuid: 'storybook',
    role: 'USER',
    primarySocialId: 'storybook',
    socialIds: ['storybook']
  } as any)
}

// The assets packages export their compiled loaders only, so the strings come from the files.
const attachmentStrings = import.meta.glob('../../../../plugins/attachment-assets/lang/*.json')
const viewStrings = import.meta.glob('../../../../plugins/view-assets/lang/*.json')

function addStrings (plugin: string, files: Record<string, () => Promise<unknown>>): void {
  const load = (lang: string): (() => Promise<unknown>) | undefined =>
    Object.entries(files).find(([path]) => path.endsWith(`/${lang}.json`))?.[1]
  addStringsLoader(plugin as Plugin, async (lang: string) => await ((load(lang) ?? load('en')) as () => Promise<any>)())
}

export async function setupAttachmentMocks (): Promise<void> {
  ready ??= (async () => {
    addStrings('attachment', attachmentStrings)
    addStrings('view', viewStrings)
    setMetadata(view.icon.Open, `${kitSprite}#open-file`)
    setMetadata(view.icon.Sidebar, `${kitSprite}#arrow-in-square`)
    registerPresentationStrings()
    // Fixtures carry their files as addresses; one given by id stands for a file the storage cannot serve.
    setMetadata(presentation.metadata.FileStorage, {
      getFileUrl: (_: string, file: string) => `${window.location.origin}/__missing/${file}`
    } as any)
    // Everyone may remove everything, so the remove controls show.
    const permissions = readable({ whitelist: new Set(), ps: {} })
    addLocation('contact' as Plugin, async () => ({ default: async () => ({ store: { Permissions: permissions } }) }))
    // A transcript is rendered as a message, which looks for emoji in its text.
    addEmojiLocation()
    // A code block of a Markdown file asks for the highlighter.
    addLocation('diffview' as Plugin, async () => ({
      default: async () => ({ component: { Highlight: HighlightStub } })
    }))
    useViewer()
    const hierarchy = new Hierarchy()
    const model = new ModelDb(hierarchy)
    // The editor asks the model for its extensions; a class missing from the empty model has none.
    const findAllSync = model.findAllSync.bind(model)
    model.findAllSync = ((...args: Parameters<typeof findAllSync>) => {
      try {
        return findAllSync(...args)
      } catch {
        return []
      }
    }) as typeof findAllSync
    const mockClient: Client = {
      getHierarchy: () => hierarchy,
      getModel: () => model,
      findAll: async () => Object.assign([], { total: 0 }) as any,
      findOne: async () => undefined,
      searchFulltext: async () => ({ docs: [], total: 0 }),
      tx: async () => ({}),
      close: async () => {},
      domainRequest: async () => ({ domain: '', value: undefined }) as any
    } as any
    client = mockClient
    await setClient(mockClient)
    addLocation('view' as Plugin, async () => await import('@hcengineering/view-resources'))
    const viewer = (contentType: string | string[], component: string, alignment = 'centered'): any => ({
      _id: component,
      _class: 'presentation:class:FilePreviewExtension',
      contentType,
      alignment,
      component,
      extension: 'presentation:extension:FilePreviewExtension'
    })
    const viewers = [
      viewer(['audio/*'], 'view:component:AudioViewer'),
      viewer('image/*', 'view:component:ImageViewer'),
      viewer(['video/*', 'application/x-mpegURL'], 'view:component:VideoViewer'),
      viewer(['application/pdf'], 'view:component:PDFViewer', 'float'),
      viewer(['application/json', 'text/*'], 'view:component:TextViewer', 'float')
    ]
    // The query of the platform finds nothing in the empty model and would clear the list when it answers.
    previewTypes.subscribe((current) => {
      if (current.length === 0) previewTypes.set(viewers)
    })
  })()
  await ready
  // The poll stories put their own client and account into the same preview document.
  if (getCurrentAccount()?.uuid !== 'storybook' && client != null) {
    useViewer()
    await setClient(client)
  }
}
