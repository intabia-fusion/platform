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

import type { AnyAttribute, Class, Client, Doc, Ref, Type } from '@hcengineering/core'

const presenterStub = { name: 'stub-presenter' }

jest.mock('@hcengineering/platform', () => ({
  ...jest.requireActual('@hcengineering/platform'),
  getResource: jest.fn(async () => presenterStub),
  getMetadata: jest.fn(() => undefined),
  translate: jest.fn(async (id: string) => id),
  getEmbeddedLabel: jest.fn((value: string) => value)
}))

jest.mock('@hcengineering/presentation', () => ({
  __esModule: true,
  default: { class: {}, mixin: {}, string: {}, component: {} },
  createQuery: jest.fn(() => ({ query: jest.fn(), unsubscribe: jest.fn() })),
  getClient: jest.fn(),
  getFiltredKeys: jest.fn(),
  getRawLiveQuery: jest.fn(),
  hasResource: jest.fn(() => true),
  isCollectionAttr: jest.fn(() => false),
  // Types only carry their own class here, so the category stays 'attribute'.
  getAttributePresenterClass: (hierarchy: unknown, type: Type<any>) => ({
    attrClass: type._class,
    category: 'attribute'
  })
}))

jest.mock('@hcengineering/ui', () => ({
  ErrorPresenter: { name: 'error-presenter' },
  getColorNumberByText: jest.fn(),
  getCurrentResolvedLocation: jest.fn(),
  getPanelURI: jest.fn(),
  getPlatformColorForText: jest.fn(),
  locationToUrl: jest.fn(),
  navigate: jest.fn(),
  resolvedLocationStore: { subscribe: jest.fn(() => () => {}) }
}))

jest.mock('@hcengineering/contact', () => ({
  getAllSocialStringsByPersonRef: jest.fn(),
  getCurrentEmployee: jest.fn()
}))

describe('buildModel descendant attributes', () => {
  const parentClass = 'test:class.Parent' as Ref<Class<Doc>>
  const childClass = 'test:class.Child' as Ref<Class<Doc>>
  const typeRef = 'test:class.TypeString' as Ref<Class<Doc>>

  const childAttribute: AnyAttribute = {
    _id: 'test:attribute:Child.childName',
    name: 'childName',
    label: 'Child name',
    type: { _class: typeRef },
    attributeOf: childClass,
    hidden: false,
    readonly: false,
    typeOf: []
  } as unknown as AnyAttribute

  const hierarchy = {
    isDerived: jest.fn(() => false),
    getAttribute: jest.fn((_class: Ref<Class<Doc>>, key: string) => {
      if (_class === childClass && key === 'childName') return childAttribute
      throw new Error(`attribute not found: ${_class}.${key}`)
    }),
    findAttribute: jest.fn((_class: Ref<Class<Doc>>, key: string) => {
      return _class === childClass && key === 'childName' ? childAttribute : undefined
    }),
    classHierarchyMixin: jest.fn(() => ({ presenter: 'test:resource:Presenter' })),
    getClass: jest.fn(() => ({ label: 'Child' }))
  }

  const client = {
    getHierarchy: () => hierarchy,
    getModel: () => ({ findAllSync: () => [] })
  } as unknown as Client

  beforeEach(() => {
    jest.clearAllMocks()
  })

  beforeAll(() => {
    // utils.ts reads saved viewlets from localStorage on import
    Object.defineProperty(globalThis, 'localStorage', {
      value: {
        getItem: jest.fn(() => null),
        setItem: jest.fn(),
        removeItem: jest.fn(),
        clear: jest.fn()
      },
      configurable: true,
      writable: true
    })
  })

  it('resolves the presenter for the descendant class from displayProps._class', async () => {
    const { buildModel } = await import('../utils')
    const model = await buildModel({
      client,
      _class: parentClass,
      keys: [{ key: 'childName', displayProps: { _class: childClass } }]
    })

    expect(model).toHaveLength(1)
    expect(model[0].key).toBe('childName')
    expect(model[0].presenter).toBe(presenterStub)
    expect(hierarchy.getAttribute).toHaveBeenCalledWith(childClass, 'childName')
    expect(hierarchy.getAttribute).not.toHaveBeenCalledWith(parentClass, 'childName')
    expect(model[0].castRequest).toBeUndefined()
  })

  it('skips a descendant attribute the model cannot render', async () => {
    const { buildModel } = await import('../utils')
    const model = await buildModel({
      client,
      _class: parentClass,
      keys: [
        { key: 'childName', displayProps: { _class: childClass } },
        // No presenter on the class and no attribute with that name on it
        { key: 'parent', displayProps: { _class: childClass } }
      ]
    })

    expect(model).toHaveLength(1)
    expect(model[0].key).toBe('childName')
  })
})
