import view from '@intabiafusion/view'
import core from '@intabiafusion/core'
import type { Asset } from '@intabiafusion/platform'

export const iconsLibrary: Asset[] = Object.values(core.icon).concat(Object.values(view.icon))
