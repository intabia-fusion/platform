//
// Copyright © 2024 Hardcore Engineering Inc.
//
//

import type { Plugin } from '@intabiafusion/platform'
import products from '@intabiafusion/products'

import core from '@intabiafusion/core'
import { type Builder } from '@intabiafusion/model'
import serverCore from '@intabiafusion/server-core'

export const serverProductsId = 'server-products' as Plugin

export function createModel (builder: Builder): void {
  builder.mixin(products.class.Product, core.class.Class, serverCore.mixin.SearchPresenter, {
    iconConfig: {
      component: products.component.ProductSearchIcon,
      fields: [['icon'], ['color']]
    },
    title: [['name']]
  })
}
