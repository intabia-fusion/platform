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

/** A single plan price within a product */
export interface PaymenterPrice {
  id: string
  price: string
  setupFee: string | null
  currencyCode: string
}

/** A billing plan (e.g. monthly, one-time) attached to a product */
export interface PaymenterPlan {
  id: string
  name: string
  type: 'recurring' | 'one-time'
  billingPeriod: number | null
  billingUnit: string | null
  sort: number
  prices: PaymenterPrice[]
}

/** A product from Paymenter (can be a tier or an add-on) */
export interface PaymenterProduct {
  id: string
  name: string
  description: string
  slug: string
  image: string | null
  stock: number | null
  perUserLimit: number | null
  allowQuantity: 'separated' | 'combined' | null
  hidden: boolean
  plans: PaymenterPlan[]
  createdAt: string
  updatedAt: string
}

/** Raw API response shape from Paymenter */
export interface PaymenterProductsResponse {
  data: Array<{
    id: string
    type: 'products'
    attributes: {
      id: number
      name: string
      description: string
      image: string | null
      slug: string
      stock: number | null
      per_user_limit: number | null
      sort: number | null
      allow_quantity: 'separated' | 'combined' | null
      email_template: string | null
      hidden: boolean
      updated_at: string
      created_at: string
    }
    relationships: {
      plans: {
        data: Array<{ type: 'plans', id: string }>
      }
    }
  }>
  included: Array<{
    id: string
    type: 'plans' | 'prices'
    attributes: {
      id?: number
      name?: string
      type?: 'recurring' | 'one-time'
      billing_period?: number | null
      billing_unit?: string | null
      sort?: number
      price?: string
      setup_fee?: string | null
      currency_code?: string
    }
    relationships?: {
      prices?: {
        data: Array<{ type: 'prices', id: string }>
      }
    }
  }>
  links: {
    first: string
  }
  meta: {
    current_page: number
    current_page_url: string
    from: number
    path: string
    per_page: number
    to: number
  }
}

/** Filter options for listing products */
export interface PaymenterProductFilters {
  /** Product category slug (e.g. "platform") */
  category?: string
  /** Include related data: "plans", "plans.prices" */
  include?: string
  /** Page number */
  page?: number
}

/** Normalized plan info ready for UI display */
export interface PaymenterPlanInfo {
  productId: string
  productName: string
  productSlug: string
  productDescription: string
  planId: string
  planName: string
  planType: 'recurring' | 'one-time'
  price: number
  currencyCode: string
  billingPeriod: number | null
  billingUnit: string | null
}
