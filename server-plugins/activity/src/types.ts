import { AccountUuid, Class, Doc } from '@hcengineering/core'
import { Asset, IntlString, Resource } from '@hcengineering/platform'
import { TriggerControl } from '@hcengineering/server-core'

export type PresenterControl = Pick<
TriggerControl,
'hierarchy' | 'ctx' | 'modelDb' | 'findAll' | 'branding' | 'workspace'
>

export interface PresenterOptions {
  account?: AccountUuid
}

export interface Icon {
  asset?: Asset
  emoji?: number | number[]
  props?: Record<string, any>
}

export type StringPresenterFn<T extends Doc = Doc> = (
  doc: T,
  control: PresenterControl,
  options?: PresenterOptions
) => Promise<string | undefined>
export type IntlStringPresenterFn<T extends Doc = Doc> = (
  doc: T,
  control: PresenterControl,
  options?: PresenterOptions
) => Promise<IntlString | undefined>

export type IconPresenterFn<T extends Doc = Doc> = (
  doc: T,
  control: PresenterControl,
  options?: PresenterOptions
) => Promise<Icon>

export interface TitlePresenter<T extends Doc = Doc> extends Class<T> {
  presenter: Resource<StringPresenterFn<T>>
  triggerFields: string[]
  personalized?: boolean
}

export interface LabelPresenter<T extends Doc = Doc> extends Class<T> {
  presenter: Resource<IntlStringPresenterFn<T>>
  triggerFields: string[]
}

export interface IdentifierPresenter<T extends Doc = Doc> extends Class<T> {
  presenter: Resource<StringPresenterFn<T>>
  triggerFields: string[]
}

export interface UrlPresenter<T extends Doc = Doc> extends Class<T> {
  presenter: Resource<StringPresenterFn<T>>
}

export interface IconPresenter<T extends Doc = Doc> extends Class<T> {
  presenter: Resource<IconPresenterFn<T>>
  triggerFields: string[]
  personalized?: boolean
}
