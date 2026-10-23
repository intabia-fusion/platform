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

/* eslint-disable @typescript-eslint/no-explicit-any */
// Recording kit: the same `kit.*` API as dev/design/kit, but it builds a tree of nodes instead of Penpot shapes.
// Screen scripts of dev/design/screens run unchanged. Component nodes carry domain props of the Storybook kit
// (src/design/kit); primitives (box, text) stay layout nodes. No imports: runs in the browser and in Node (type stripping).

export interface RNode {
  id: string
  // Component name of src/design/kit, or a primitive: box, text, slot
  c: string
  // Layer name the Penpot kit gives the shape
  name: string
  props: Record<string, any>
  children: RNode[]
  // Named slot of the parent component
  slot?: string
  // Position of a screen frame on the page canvas, as the Penpot kit places it
  pos?: { x: number, y: number }
  // Absolute position inside the parent, set by kit.at
  at?: { x: number, y: number }
  width: number
  height: number
  [key: string]: any
}

export interface RPage {
  name: string
  frames: RNode[]
}

export interface RecordInput {
  tokens: string
  demo: unknown
  // Scripts of one build entry of design.json: path -> source
  scripts: Array<{ path: string, source: string }>
}

const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor

const RAIL_W = 68
const NAV_W = 280
const SIDE_W = 57

function clean (o: Record<string, any>): Record<string, any> {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined))
}

// A token color keeps its CSS variable, any other value is used as written
function col (v: any): string | undefined {
  if (v === undefined || v === null || v === '') return undefined
  return v instanceof String && (v as any).token !== undefined ? `var(--${(v as any).token})` : String(v)
}

const flat = (kids: any[]): RNode[] => kids.flat(Infinity).filter((k) => k !== undefined && k !== null && k !== false)

// Pages persist across the build entries of a file, as pages of a Penpot file do
export function createRecorder (tokensText: string): { pages: RPage[], run: (input: RecordInput) => Promise<unknown> } {
  const TOKENS = JSON.parse(tokensText.slice(tokensText.indexOf('{')))
  const pages: RPage[] = []
  let current: RPage = { name: '', frames: [] }
  let seq = 0

  const node = (c: string, name: string, props: Record<string, any>, width = 10, height = 10): RNode => ({
    id: `n${++seq}`,
    c,
    name,
    props: clean(props),
    children: [],
    width,
    height
  })
  const slot = (name: string, width: number, height: number): RNode => ({
    ...node('slot', name, {}, width, height),
    slot: name
  })
  const inSlot = (n: RNode, name: string): RNode => ({ ...n, slot: name })

  const T = (name: string): string => {
    const v = TOKENS.colors.light[name]
    if (v === undefined) throw new Error(`Unknown color token: ${name}`)
    const s: any = new String(v) // eslint-disable-line no-new-wrappers
    s.token = name
    return s
  }
  const D = (name: string): number => {
    const v = TOKENS.dimensions[name]
    if (v === undefined) throw new Error(`Unknown dimension token: ${name}`)
    return v
  }
  const P = (name: string): string => TOKENS.palette.light[name]

  const kit: Record<string, any> = {
    mode: 'light',
    CATEGORY: { backlog: 'Cloud', todo: 'Porpoise', active: 'Cerulean', won: 'Grass', lost: 'Coin' }
  }

  // ---- Primitives -------------------------------------------------------------
  kit.box = (name: string, o: Record<string, any> = {}) =>
    node(
      'box',
      name,
      {
        w: o.w ?? 10,
        h: o.h ?? 10,
        fill: col(o.fill),
        stroke: col(o.stroke),
        strokeW: o.strokeW,
        strokeStyle: o.strokeStyle,
        radius: o.radius,
        dir: o.dir,
        gap: o.gap,
        pad: o.pad,
        align: o.align,
        justify: o.justify,
        wrap: o.wrap,
        hs: o.hs,
        vs: o.vs,
        clip: o.clip
      },
      o.w ?? 10,
      o.h ?? 10
    )
  kit.row = (name: string, gap = 0, o: Record<string, any> = {}) =>
    kit.box(name, { dir: 'row', gap, align: 'center', hs: 'auto', vs: 'auto', ...o })
  kit.col = (name: string, gap = 0, o: Record<string, any> = {}) =>
    kit.box(name, { dir: 'column', gap, hs: 'auto', vs: 'auto', ...o })
  kit.spacer = (w: number, h: number) => kit.box('spacer', { w, h })
  kit.divider = (w: number, h = 1) => kit.box('divider', { w, h, fill: T('theme-divider-color') })
  kit.text = (chars: string, o: Record<string, any> = {}) => {
    if (chars === '') return kit.spacer(1, 1)
    return node('text', o.name ?? chars.slice(0, 40), {
      chars,
      size: o.size,
      weight: o.weight,
      lh: o.lh,
      color: col(o.color),
      upper: o.upper,
      w: o.w,
      align: o.align
    })
  }
  kit.add = (parent: RNode, ...kids: any[]) => {
    parent.children.push(...flat(kids))
    return parent
  }
  kit.at = (parent: RNode, s: RNode, x: number, y: number) => {
    s.at = { x, y }
    parent.children.push(s)
    return s
  }
  kit.icon = (name: string, color?: any, size = 16) =>
    node('Icon', 'icon/' + name, { name, color: col(color), size }, size, size)

  // ---- Components: kit signature in, domain props out -------------------------------
  const person = (initials: string, color: string, name?: string): { initials: string, color: string, name?: string } =>
    clean({ initials, color, name }) as any
  const toIssue = (d: Record<string, any>): Record<string, any> =>
    clean({
      id: d.id,
      title: d.title,
      status: clean({ category: d.cat, color: d.color, name: d.statusName }),
      priority: d.priority ?? 'none',
      assignee: d.assignee !== undefined ? person(d.assignee[0], d.assignee[1], d.assignee[2]) : undefined,
      parent: d.parent,
      sub: d.sub !== undefined ? String(d.sub).split('/').map(Number) : undefined,
      component: d.component,
      milestone: d.milestone,
      labels: d.labels,
      estimation: d.est !== undefined ? parseFloat(d.est) : undefined,
      due: d.due,
      overdue: d.overdue,
      attachments: d.att,
      comments: d.com,
      unread: d.unread,
      accent: col(d.accent),
      created: d.created,
      modified: d.modified
    })
  const toColumn = (name: string, cat: string, count: number, o: Record<string, any>): Record<string, any> =>
    clean({
      name,
      status: clean({ category: cat, color: o.color }),
      count,
      limit: o.limit,
      over: o.over,
      tools: o.tools,
      action: o.action !== undefined ? clean({ label: o.action, icon: o.actionIcon }) : undefined,
      statuses: o.statuses?.map(([n, c]: [string, string]) => ({ status: { name: n, category: c } })),
      issues: o.cards?.map(toIssue)
    })

  kit.Button = (o: Record<string, any> = {}) =>
    node('Button', o.name ?? 'Button', {
      kind: o.kind,
      size: o.size,
      icon: o.icon,
      label: o.label,
      menu: o.menu,
      pressed: o.pressed
    })
  kit.IconButton = (icon: string, o: Record<string, any> = {}) => kit.Button({ ...o, icon, label: undefined })
  kit.StatusIcon = (cat: string, _size?: number, palette?: string) =>
    node('StatusIcon', 'StatusIcon/' + cat, { status: clean({ category: cat, color: palette }) })
  kit.PriorityIcon = (level: string) => node('PriorityIcon', 'PriorityIcon/' + level, { priority: level })
  kit.Avatar = (initials: string, color = 'Blueberry', size = 20) =>
    node('Avatar', 'Avatar/' + size, { person: person(initials, color), size })
  kit.AvatarEmpty = (size = 20) => node('Avatar', 'Avatar/empty', { size })
  kit.Chip = (content: any, o: Record<string, any> = {}) => kit.add(node('Chip', o.name ?? 'Chip', {}), content)
  kit.Label = (name: string, color = 'Sky') => node('Tag', 'Label', { label: [name, color] })
  kit.Count = (n: number) => node('Count', 'Count', { value: n })
  kit.StatusChip = (name: string, cat: string, o: Record<string, any> = {}) =>
    node('StatusChip', 'StatusChip/' + name, {
      status: { name, category: cat },
      count: o.count,
      draggable: o.drag,
      block: o.w !== undefined ? true : undefined
    })
  kit.Input = (o: Record<string, any> = {}) => {
    const w = o.w ?? 240
    return node('Input', 'Input', {
      label: o.label,
      value: o.value,
      placeholder: o.placeholder,
      icon: o.icon,
      menu: o.menu,
      error: o.error,
      size: w <= 160 ? 'narrow' : w <= 240 ? 'medium' : 'wide',
      lines: o.h !== undefined && o.h > 40 ? Math.round((o.h - 8) / 24) : undefined
    })
  }
  kit.Checkbox = (checked: boolean, label?: string) => node('Checkbox', 'Checkbox', { checked, label })
  kit.Toggle = (on: boolean, label?: string) => node('Toggle', 'Toggle', { on, label })
  kit.Radio = (on: boolean, label: string, hint?: string) => node('Radio', 'Radio ' + label, { on, label, hint })
  kit.Menu = (items: any[], o: Record<string, any> = {}) =>
    node('Menu', o.name ?? 'Menu', { items: items.map((it) => (it === '-' ? { divider: true } : it)), width: o.w })
  kit.Notice = (text: string, kind = 'warning', o: Record<string, any> = {}) =>
    node('Notice', 'Notice/' + kind, { text, kind, pill: o.pill, block: o.w !== undefined ? true : undefined })
  kit.QuickFilter = (label: string, on?: boolean) => node('QuickFilter', 'QuickFilter/' + label, { label, on })
  kit.FilterChip = (attribute: string, operator: string, value: string) =>
    node('FilterChip', 'FilterChip/' + attribute, { attribute, operator, value })
  kit.Swatch = (color: any) => node('Swatch', 'Swatch', { color: col(color) })
  kit.SectionTitle = (title: string, hint?: string) => node('SectionTitle', 'Section ' + title, { title, hint })
  kit.FormRow = (label: string, control: any, o: Record<string, any> = {}) =>
    kit.add(
      node('FormRow', 'Row ' + label, { label, hint: o.hint, alignTop: o.alignTop, padded: o.padded, last: o.last }),
      control
    )
  kit.Table = (cols: Array<{ title: string, w: number }>, rows: any[][], o: Record<string, any> = {}) =>
    node('Table', o.name ?? 'Table', { columns: cols.map((c) => ({ title: c.title, width: c.w })), rows })
  kit.ColumnHeader = (name: string, cat: string, count: number, _w: number, o: Record<string, any> = {}) =>
    node('ColumnHeader', 'ColumnHeader ' + name, { column: toColumn(name, cat, count, o) })
  kit.IssueCard = (d: Record<string, any>) => node('IssueCard', 'IssueCard ' + d.id, { issue: toIssue(d) })
  kit.IssuePage = (d: Record<string, any>, w = 1515, h = 967) =>
    node(
      'IssuePage',
      'Issue page ' + d.id,
      clean({
        issue: toIssue(d),
        project: d.project,
        creator: d.creator !== undefined ? person(d.creator[0], d.creator[1], d.creator[2]) : undefined,
        description: d.description,
        subIssues: d.subIssues?.map(toIssue),
        activity: d.activity,
        created: d.created
      }),
      w,
      h
    )
  kit.NewIssuePopup = (o: Record<string, any> = {}) =>
    node(
      'NewIssuePopup',
      'New issue popup',
      clean({
        project: o.project,
        status: o.statusName !== undefined ? clean({ name: o.statusName, category: o.cat, color: o.color }) : undefined
      }),
      720,
      391
    )
  kit.IssueRow = (d: Record<string, any>) => node('IssueRow', 'IssueRow ' + d.id, { issue: toIssue(d) })
  const toGroup = (g: Record<string, any>): Record<string, any> =>
    clean({
      name: g.name,
      status: clean({ category: g.cat, color: g.color }),
      estimation: g.estimation,
      issues: g.issues?.map(toIssue)
    })
  kit.IssueGroup = (g: Record<string, any>) => node('IssueGroup', 'Group ' + g.name, toGroup(g))
  kit.IssueList = (groups: Array<Record<string, any>>, w = 1481) =>
    node('IssueList', 'Issue list', { groups: groups.map(toGroup), width: w })
  kit.KanbanColumn = (c: Record<string, any>) =>
    node('KanbanColumn', 'Column ' + c.name, { column: toColumn(c.name, c.cat, c.count, c) })

  const navProps = (o: Record<string, any>): Record<string, any> => ({
    title: o.title ?? 'Tracker',
    newLabel: o.newLabel === null ? undefined : (o.newLabel ?? 'New issue'),
    entries: o.nav ?? [],
    footer: o.footer,
    tools: o.tools
  })

  // Standalone elements of the workbench, each a frame of its own on the canvas
  kit.TopBar = (w: number, o: Record<string, any> = {}) =>
    node('TopBar', 'Top bar', { tab: { label: o.tab ?? 'Tracker', icon: o.tabIcon ?? 'tracker/tracker' } }, w, 36)
  kit.AppRail = (h: number, o: Record<string, any> = {}) =>
    node(
      'AppRail',
      'App rail',
      clean({
        workspace: o.workspace ?? 'S',
        account: person(o.account ?? 'AJ', 'Blueberry'),
        app: o.app ?? 'tracker',
        apps: o.apps
      }),
      RAIL_W,
      h
    )
  kit.Navigator = (h: number, o: Record<string, any> = {}) => node('Navigator', 'Navigator', navProps(o), NAV_W, h)
  kit.Sidebar = (h: number, o: Record<string, any> = {}) =>
    node('Sidebar', 'Sidebar', clean({ widgets: o.widgets, selected: o.selected }), SIDE_W, h)
  kit.Frame = (name: string, x: number, y: number, w: number, h: number, o: Record<string, any> = {}) => {
    const frame = kit.box(name, { w, h, fill: o.fill ?? '#FFFFFF' })
    frame.pos = { x, y }
    current.frames.push(frame)
    return frame
  }

  // Workbench: frame with the content panel (and an optional side panel) as slots
  kit.Workbench = (name: string, x: number, y: number, o: Record<string, any> = {}) => {
    const W = o.w ?? 1920
    const H = o.h ?? 1080
    const pw = o.panel !== undefined ? o.panel.w : 0
    const frame = node(
      'Workbench',
      name,
      clean({
        tab: { label: o.tab ?? 'Tracker', icon: o.tabIcon ?? 'tracker/tracker' },
        workspace: o.workspace ?? 'S',
        account: person(o.account ?? 'AJ', 'Blueberry'),
        app: o.app ?? 'tracker',
        apps: o.apps,
        widgets: o.widgets,
        selected: o.selected,
        nav: navProps(o)
      }),
      W,
      H
    )
    const main = slot('main', W - RAIL_W - NAV_W - SIDE_W - pw, H - 36)
    frame.children.push(main)
    let panel: RNode | undefined
    if (pw > 0) {
      panel = slot('panel', pw, H - 36)
      frame.children.push(panel)
    }
    frame.pos = { x, y }
    current.frames.push(frame)
    return { frame, main, panel }
  }
  kit.SpaceHeader = (main: RNode, o: Record<string, any> = {}) => {
    const n = node('SpaceHeader', 'Space header', {
      view: o.view,
      title: o.title,
      titleIcon: o.titleIcon,
      tabs: o.tabs,
      tab: o.tab
    })
    if (o.titleNode !== undefined) n.children.push(inSlot(o.titleNode, 'title'))
    for (const a of flat([o.actions ?? []])) n.children.push(inSlot(a, 'actions'))
    for (const f of flat([o.filters ?? []])) n.children.push(inSlot(f, 'filters'))
    main.children.push(n)
    return 113
  }
  kit.PanelHeader = (main: RNode, o: Record<string, any> = {}) => {
    const n = node('PanelHeader', 'Panel header', { title: o.title, icon: o.icon, divided: o.divided }, main.width, 57)
    for (const a of flat([o.actions ?? []])) n.children.push(inSlot(a, 'actions'))
    main.children.push(n)
    return 57
  }
  kit.ClassicButton = (o: Record<string, any> = {}) =>
    kit.add(
      node('ClassicButton', o.name ?? 'ClassicButton', {
        kind: o.kind,
        size: o.size,
        icon: o.icon,
        iconSize: o.iconSize,
        label: o.label,
        disabled: o.disabled,
        menu: o.menu
      }),
      o.content ?? []
    )
  kit.EditBox = (value: string, o: Record<string, any> = {}) =>
    node('EditBox', 'EditBox', { value, kind: o.kind, width: o.w })
  kit.GridRow = (label: string, control: any, o: Record<string, any> = {}) =>
    kit.add(
      node('GridRow', 'Row ' + label, { label, hint: o.hint, alignTop: o.alignTop, padded: o.padded, last: o.last }),
      control
    )
  // The modal is its own body: content is added to the returned node
  kit.Modal = (title: string, o: Record<string, any> = {}) => {
    const modal = node('Modal', 'Modal ' + title, { title, okLabel: o.okLabel }, o.w ?? 600, o.h ?? 400)
    return { modal, body: modal }
  }
  kit.DateSeparator = (label: string, w = 100) => node('DateSeparator', 'Date ' + label, { label }, w, 33)
  kit.NewMarker = (w = 100) => node('NewMarker', 'New messages', { label: 'New' }, w, 16)
  kit.Message = (o: Record<string, any> = {}) =>
    node(
      'Message',
      'Message ' + o.author,
      {
        author: o.author,
        time: o.time,
        text: o.text,
        person: o.initials !== undefined ? person(o.initials, o.color) : undefined
      },
      o.w ?? 100,
      62
    )
  kit.MessageInput = (o: Record<string, any> = {}) =>
    node('MessageInput', 'Message input', { placeholder: o.placeholder }, o.w ?? 100, 88)
  kit.SettingsLayout = (main: RNode, o: Record<string, any> = {}) => {
    const n = node('SettingsLayout', 'Settings', {
      back: o.back,
      title: o.title ?? '',
      close: o.close,
      tabs: o.tabs,
      tab: o.tab,
      subtabs: o.subtabs,
      subtab: o.subtab
    })
    for (const a of flat([o.actions ?? []])) n.children.push(inSlot(a, 'actions'))
    if (o.subLead !== undefined) n.children.push(inSlot(o.subLead, 'subLead'))
    const top = o.subtabs !== undefined ? 106 : 57
    const content = slot('content', main.width - 233, main.height - top)
    content.slot = undefined
    n.children.push(content)
    main.children.push(n)
    return content
  }

  kit.page = async (name: string, o: Record<string, any> = {}) => {
    let page = pages.find((p) => p.name === name)
    if (page === undefined) {
      page = { name, frames: [] }
      pages.push(page)
    } else if (o.keep !== true) page.frames = []
    current = page
    return page
  }
  kit.settle = async () => {}

  const penpot = { root: { appendChild: () => {} } }

  async function run (input: RecordInput): Promise<unknown> {
    const code = input.scripts.map((s) => s.source).join('\n')
    const fn = new AsyncFunction('kit', 'T', 'D', 'P', 'TOKENS', 'DEMO', 'penpot', code)
    return await fn(kit, T, D, P, TOKENS, input.demo, penpot)
  }
  return { pages, run }
}
