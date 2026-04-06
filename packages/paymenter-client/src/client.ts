/**
  Copyright © 2026 Intabia Fusion.

  Licensed under the Eclipse Public License, Version 2.0 (the "License");
  you may not use this file except in compliance with the License. You may
  obtain a copy of the License at https://www.eclipse.org/legal/epl-2.0
  
  Unless required by applicable law or agreed to in writing, software
  distributed under the License is distributed on an "AS IS" BASIS,
  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
  
  See the License for the specific language governing permissions and
  limitations under the License.
*/

import { concatLink } from '@hcengineering/core'
import { NetworkError, PaymenterError } from './error'
import type {
  PaymenterProduct,
  PaymenterPlanInfo,
  PaymenterProductsResponse,
  PaymenterProductFilters
} from './types'

/** @public */
export function getClient (paymenterUrl?: string, token?: string): PaymenterClient {
  if (paymenterUrl === undefined || paymenterUrl == null || paymenterUrl === '') {
    throw new Error('Paymenter URL not specified')
  }
  if (token === undefined || token == null || token === '') {
    throw new Error('Paymenter API token not specified')
  }

  return new PaymenterClient(paymenterUrl, token)
}

/**
 * Client for the Paymenter billing API.
 * Fetches products, plans and pricing from https://paymenter.org
 */
export class PaymenterClient {
  private readonly headers: Record<string, string>

  constructor (
    private readonly endpoint: string,
    private readonly token: string
  ) {
    this.headers = {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json'
    }
  }

  /**
   * Fetch all products with their plans and prices.
   * Supports optional category filtering and pagination.
   */
  async getProducts (filters?: PaymenterProductFilters): Promise<PaymenterProduct[]> {
    const params = new URLSearchParams()
    if (filters?.category !== undefined) params.set('category', filters.category)
    if (filters?.include !== undefined) params.set('include', filters.include)
    if (filters?.page !== undefined) params.set('page', String(filters.page))

    const query = params.toString()
    const path = `/api/v1/admin/products${query !== '' ? `?${query}` : ''}`
    const url = new URL(concatLink(this.endpoint, path))

    const response = await fetchSafe(url, { headers: { ...this.headers } })
    const raw = (await response.json()) as PaymenterProductsResponse

    return parseProducts(raw)
  }

  /**
   * Fetch a single product by ID with its plans and prices.
   */
  async getProduct (productId: string): Promise<PaymenterProduct> {
    const path = `/api/v1/admin/products/${productId}`
    const url = new URL(concatLink(this.endpoint, path))

    const response = await fetchSafe(url, { headers: { ...this.headers } })
    const raw = (await response.json()) as PaymenterProductsResponse

    const products = parseProducts(raw)
    if (products.length === 0) {
      throw new PaymenterError(`Product ${productId} not found`)
    }
    return products[0]
  }

  /**
   * Fetch products and flatten them into a simple list of plan info objects.
   * Useful for rendering a pricing table.
   */
  async getPlans (category?: string): Promise<PaymenterPlanInfo[]> {
    const products = await this.getProducts({ category, include: 'plans.prices' })

    const plans: PaymenterPlanInfo[] = []
    for (const product of products) {
      for (const plan of product.plans) {
        const primaryPrice = plan.prices[0]
        if (primaryPrice !== undefined) {
          plans.push({
            productId: product.id,
            productName: product.name,
            productSlug: product.slug,
            productDescription: product.description,
            planId: plan.id,
            planName: plan.name,
            planType: plan.type,
            price: parseFloat(primaryPrice.price),
            currencyCode: primaryPrice.currencyCode,
            billingPeriod: plan.billingPeriod,
            billingUnit: plan.billingUnit
          })
        }
      }
    }
    return plans
  }
}

/**
 * Parse the JSON:API-style response from Paymenter into a flat array of PaymenterProduct.
 * Paymenter uses `included` array for relations, we need to stitch it together.
 */
function parseProducts (response: PaymenterProductsResponse): PaymenterProduct[] {
  // Index plans and prices from included
  const planMap = new Map<string, {
    id: string
    name: string
    type: 'recurring' | 'one-time'
    billingPeriod: number | null
    billingUnit: string | null
    sort: number
    priceIds: string[]
  }>()

  const priceMap = new Map<string, { price: string, setupFee: string | null, currencyCode: string }>()

  for (const item of response.included) {
    if (item.type === 'plans' && item.attributes.name !== undefined) {
      const priceIds = item.relationships?.prices?.data.map((p) => p.id) ?? []
      planMap.set(item.id, {
        id: item.id,
        name: item.attributes.name,
        type: item.attributes.type ?? 'one-time',
        billingPeriod: item.attributes.billing_period ?? null,
        billingUnit: item.attributes.billing_unit ?? null,
        sort: item.attributes.sort ?? 0,
        priceIds
      })
    }
    if (item.type === 'prices' && item.attributes.price !== undefined) {
      priceMap.set(item.id, {
        price: item.attributes.price,
        setupFee: item.attributes.setup_fee ?? null,
        currencyCode: item.attributes.currency_code ?? 'RUB'
      })
    }
  }

  return response.data.map((item) => {
    const planIds = item.relationships.plans.data.map((p) => p.id)
    const plans: PaymenterProduct['plans'] = planIds.map((planId) => {
      const plan = planMap.get(planId)
      if (plan === undefined) {
        return {
          id: planId,
          name: '',
          type: 'one-time',
          billingPeriod: null,
          billingUnit: null,
          sort: 0,
          prices: []
        }
      }
      const prices = plan.priceIds
        .map((pid) => priceMap.get(pid))
        .filter((p): p is NonNullable<typeof p> => p !== undefined)
        .map((p) => ({
          id: p.price,
          price: p.price,
          setupFee: p.setupFee,
          currencyCode: p.currencyCode
        }))

      return {
        id: plan.id,
        name: plan.name,
        type: plan.type,
        billingPeriod: plan.billingPeriod,
        billingUnit: plan.billingUnit,
        sort: plan.sort,
        prices
      }
    })

    return {
      id: item.id,
      name: item.attributes.name,
      description: item.attributes.description,
      slug: item.attributes.slug,
      image: item.attributes.image,
      stock: item.attributes.stock,
      perUserLimit: item.attributes.per_user_limit,
      allowQuantity: item.attributes.allow_quantity,
      hidden: item.attributes.hidden,
      plans,
      createdAt: item.attributes.created_at,
      updatedAt: item.attributes.updated_at
    }
  })
}

async function fetchSafe (url: string | URL, init?: RequestInit): Promise<Response> {
  let response
  try {
    response = await fetch(url, init)
  } catch (err: any) {
    throw new NetworkError(`Network error: ${String(err)}`)
  }

  if (!response.ok) {
    const text = await response.text()
    try {
      const error = JSON.parse(text)
      throw new PaymenterError(error.error ?? error.message ?? text)
    } catch {
      throw new PaymenterError(`Paymenter API error: ${response.status} ${text}`)
    }
  }

  return response
}
