import { type Resources } from '@intabiafusion/platform'
import { type DefSeparators } from '@intabiafusion/ui'
import CreatePublicLink from './components/CreatePublicLink.svelte'
import GuestApp from './components/GuestApp.svelte'

export default async (): Promise<Resources> => ({
  component: {
    GuestApp,
    CreatePublicLink
  }
})

export const workbenchGuestSeparators: DefSeparators = [null, { minSize: 20, size: 30, maxSize: 50, float: 'aside' }]
