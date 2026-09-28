//
// Copyright © 2023 Hardcore Engineering Inc.
//

import { type Doc } from '@hcengineering/core'
import { type ViewActionAvailabilityFunction, type ViewActionFunction } from '@hcengineering/view'

// TODO: Move to platform?
export interface ActionWithAvailability<T extends Doc, P = never> {
  isAvailable: ViewActionAvailabilityFunction<T>
  action: ViewActionFunction<T, P>
}

export function focusActionWithAvailability<T extends Doc, E extends Event = Event, P = never> (
  isAvailable: (doc: T) => Promise<boolean>,
  action: (doc: T, event?: E, params?: P) => Promise<any>
): ActionWithAvailability<T, P> {
  return {
    isAvailable: async function (doc: T | T[] | undefined): Promise<boolean> {
      if (doc === undefined) {
        return false
      }
      if (Array.isArray(doc) && doc.length !== 1) {
        return false
      }
      doc = Array.isArray(doc) ? doc[0] : doc
      return await isAvailable(doc)
    },
    action: async function (doc: T | T[] | undefined, evt?: Event, params?: P): Promise<void> {
      if (doc === undefined) {
        throw new Error('Action requires a document')
      }
      if (Array.isArray(doc) && doc.length !== 1) {
        throw new Error('Action requires exactly one document')
      }
      doc = Array.isArray(doc) ? doc[0] : doc
      if (!(await isAvailable(doc))) {
        throw new Error('Action not available')
      }
      await action(doc, evt as E, params)
    }
  }
}

export function noneActionWithAvailability<T extends Doc = Doc, E extends Event = Event, P = never> (
  isAvailable: () => Promise<boolean>,
  action: (event?: E, params?: P) => Promise<any>
): ActionWithAvailability<T, P> {
  return {
    isAvailable: async function (doc: T | T[] | undefined): Promise<boolean> {
      return await isAvailable()
    },
    action: async function (doc: T | T[] | undefined, evt?: Event, params?: P): Promise<void> {
      if (!(await isAvailable())) {
        throw new Error('Action not available')
      }
      await action(evt as E, params)
    }
  }
}

export function anyActionWithAvailability<T extends Doc, E extends Event = Event, P = never> (
  isAvailable: (doc: T | T[]) => Promise<boolean>,
  action: (doc: T | T[], event?: E, params?: P) => Promise<any>
): ActionWithAvailability<T, P> {
  return {
    isAvailable: async function (doc: T | T[] | undefined): Promise<boolean> {
      if (doc === undefined) {
        return false
      }
      return await isAvailable(doc)
    },
    action: async function (doc: T | T[] | undefined, evt?: Event, params?: P): Promise<void> {
      if (doc === undefined) {
        throw new Error('Action requires at least one document')
      }
      if (!(await isAvailable(doc))) {
        throw new Error('Action not available')
      }
      await action(doc, evt as E, params)
    }
  }
}

/**
 * Performs individual operation on each item only if available for all. If different iteration
 * logic is needed, use anyActionWithAvailability.
 */
export function eachItemActionWithAvailability<T extends Doc, E extends Event = Event, P = never> (
  isAvailable: (doc: T) => Promise<boolean>,
  action: (doc: T, event?: E, params?: P) => Promise<any>,
  isParallel: boolean
): ActionWithAvailability<T, P> {
  return {
    isAvailable: async function (doc: T | T[] | undefined): Promise<boolean> {
      if (doc === undefined) {
        return false
      }
      if (Array.isArray(doc) && doc.length < 1) {
        return false
      }
      const docs = Array.isArray(doc) ? doc : [doc]
      const results = await Promise.all(docs.map(async (doc) => await isAvailable(doc)))
      return results.every(Boolean)
    },
    action: async function (doc: T | T[] | undefined, evt?: Event, params?: P): Promise<void> {
      if (doc === undefined) {
        throw new Error('Action requires a document')
      }
      if (Array.isArray(doc) && doc.length < 1) {
        throw new Error('Action requires at least one document')
      }
      const docs = Array.isArray(doc) ? doc : [doc]
      if (isParallel) {
        await Promise.all(
          docs.map(async (doc) => {
            if (!(await isAvailable(doc))) {
              throw new Error('Action not available')
            }
            await action(doc, evt as E, params)
          })
        )
      } else {
        for (const doc of docs) {
          if (!(await isAvailable(doc))) {
            throw new Error('Action not available')
          }
          await action(doc, evt as E, params)
        }
      }
    }
  }
}
