import { Hierarchy, type Class, type Doc, type Ref, type TxOperations } from '@hcengineering/core'
import { leadId, type Customer, type Lead } from '@hcengineering/lead'
import { getClient } from '@hcengineering/presentation'
import { getCurrentResolvedLocation, getPanelURI, type Location, type ResolvedLocation } from '@hcengineering/ui'
import view from '@hcengineering/view'
import { accessDeniedStore } from '@hcengineering/view-resources'
import lead from './plugin'

export async function getLeadTitle (client: TxOperations, ref: Ref<Doc>, doc?: Lead): Promise<string> {
  const object = doc ?? (await client.findOne(lead.class.Lead, { _id: ref as Ref<Lead> }))
  if (object === undefined) throw new Error(`Lead not found, _id: ${ref}`)
  return `LEAD-${object.number}`
}

export async function getLeadId (client: TxOperations, ref: Ref<Lead>, doc?: Lead): Promise<string> {
  const object = doc ?? (await client.findOne(lead.class.Lead, { _id: ref }))
  if (object === undefined) throw new Error(`Lead not found, _id: ${ref}`)
  return object.identifier
}

function isShortId (shortLink: string): boolean {
  return /^\w+-\d+$/.test(shortLink)
}

export async function resolveLocation (loc: Location): Promise<ResolvedLocation | undefined> {
  if (loc.path[2] !== leadId) {
    return undefined
  }

  const shortLink = loc.path[3]

  // shortlink
  if (isShortId(shortLink)) {
    return await generateLocation(loc, shortLink)
  } else if (shortLink !== undefined) {
    return await generateIdLocation(loc, shortLink)
  }
}

async function generateIdLocation (loc: Location, shortLink: string): Promise<ResolvedLocation | undefined> {
  const tokens = shortLink.split('-')
  if (tokens.length < 2) {
    return undefined
  }
  const client = getClient()
  const hierarchy = client.getHierarchy()

  const classLabel = tokens[0]
  const _id = tokens.slice(1).join('-')
  const classes = [lead.mixin.Customer]
  let _class: Ref<Class<Doc>> | undefined
  for (const clazz of classes) {
    if (hierarchy.getClass(clazz).shortLabel === classLabel) {
      _class = clazz
      break
    }
  }
  if (_class === undefined) {
    console.error(`Not found class with short label ${classLabel}`)
    return undefined
  }
  const doc = await client.findOne(_class, { _id: _id as Ref<Doc> }, { showArchived: true })
  if (doc === undefined) {
    accessDeniedStore.set(true)
    console.error(`Could not find ${_class} with id ${_id}.`)
    return undefined
  }
  const appComponent = loc.path[0] ?? ''
  const workspace = loc.path[1] ?? ''
  // Customer is a mixin on Contact (Person/Organization) and has no own ObjectPanel;
  // resolve the panel from the real doc class so it opens in EditOrganizationPanel/EditPerson.
  const objectPanel = hierarchy.classHierarchyMixin(doc._class, view.mixin.ObjectPanel)

  const component = objectPanel?.component ?? view.component.EditDoc
  const defaultPath = [appComponent, workspace, leadId, 'customers']

  return {
    loc: {
      path: [appComponent, workspace],
      fragment: getPanelURI(component, doc._id, doc._class, 'content')
    },
    defaultLocation: {
      path: defaultPath,
      fragment: getPanelURI(component, doc._id, doc._class, 'content')
    }
  }
}

export async function parseLinkId (id: string): Promise<Ref<Doc> | undefined> {
  if (isShortId(id)) {
    const client = getClient()
    const hierarchy = client.getHierarchy()
    const data = getShortLinkData(hierarchy, id)

    if (data === undefined) {
      return id as Ref<Doc>
    }

    const [_class, , number] = data

    if (_class === undefined) {
      return id as Ref<Doc>
    }

    const doc = await client.findOne(_class, { number }, { projection: { _id: 1 } })

    return doc?._id
  }

  return id as Ref<Doc>
}

function getShortLinkData (
  hierarchy: Hierarchy,
  shortLink: string
): [Ref<Class<Doc>> | undefined, string, number] | undefined {
  const tokens = shortLink.split('-')
  if (tokens.length < 2) {
    return undefined
  }
  const classLabel = tokens[0]
  const number = Number(tokens[1])

  const classes = [lead.class.Lead]
  let _class: Ref<Class<Doc>> | undefined
  for (const clazz of classes) {
    if (hierarchy.getClass(clazz).shortLabel === classLabel) {
      _class = clazz
      break
    }
  }

  return [_class, classLabel, number]
}

async function generateLocation (loc: Location, shortLink: string): Promise<ResolvedLocation | undefined> {
  const client = getClient()
  const hierarchy = client.getHierarchy()
  const data = getShortLinkData(hierarchy, shortLink)

  if (data === undefined) {
    return
  }

  const [_class, classLabel, number] = data

  if (_class === undefined) {
    console.error(`Not found class with short label ${classLabel}`)
    return undefined
  }
  const doc = await client.findOne(_class, { number }, { showArchived: true })
  if (doc === undefined) {
    accessDeniedStore.set(true)
    console.error(`Could not find ${_class} with number ${number}.`)
    return undefined
  }
  const appComponent = loc.path[0] ?? ''
  const workspace = loc.path[1] ?? ''
  const objectPanel = hierarchy.classHierarchyMixin(_class, view.mixin.ObjectPanel)
  const component = objectPanel?.component ?? view.component.EditDoc
  const defaultPath = [appComponent, workspace, leadId]
  return {
    loc: {
      path: [appComponent, workspace],
      fragment: getPanelURI(component, doc._id, doc._class, 'content')
    },
    defaultLocation: {
      path: defaultPath,
      fragment: getPanelURI(component, doc._id, doc._class, 'content')
    }
  }
}

export async function getSequenceLink (doc: Lead): Promise<Location> {
  const loc = getCurrentResolvedLocation()
  loc.path.length = 2
  loc.fragment = undefined
  loc.query = undefined
  loc.path[2] = leadId
  loc.path[3] = getSequenceId(doc)

  return loc
}

export async function getObjectLink (doc: Customer): Promise<Location> {
  const _class = Hierarchy.mixinOrClass(doc)
  const client = getClient()
  const clazz = client.getHierarchy().getClass(_class)
  const loc = getCurrentResolvedLocation()
  loc.path.length = 2
  loc.fragment = undefined
  loc.query = undefined
  loc.path[2] = leadId
  loc.path[3] = clazz.shortLabel !== undefined ? `${clazz.shortLabel}-${doc._id}` : doc._id

  return loc
}

export function getSequenceId (doc: Lead): string {
  return doc.identifier
}
