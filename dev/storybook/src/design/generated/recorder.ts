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
  // Palette colors keep their name, so the dark theme can swap them through CSS variables (Canvas.svelte)
  const palette =
    (kind: string, table: string) =>
      (name: string): string => {
        const v = TOKENS[table].light[name]
        if (v === undefined) throw new Error(`Unknown palette color: ${name}`)
        const s: any = new String(v) // eslint-disable-line no-new-wrappers
        s.token = `${kind}-${name}`
        return s
      }
  const P = palette('pal', 'palette')
  const PB = palette('palbg', 'paletteBackground')
  const PT = palette('palt', 'paletteTitle')

  const kit: Record<string, any> = {
    mode: 'light',
    CATEGORY: { backlog: 'Cloud', todo: 'Porpoise', active: 'Cerulean', won: 'Grass', lost: 'Coin' }
  }

  // Advance widths of IBM Plex Sans (the product font) per 100px for ASCII 32..126, measured on the stand;
  // Kept consistent with dev/design/kit/40-tracker.js for screen scripts shared with Penpot.
  const PLEX = [
    24, 28, 42, 71, 60, 93, 69, 24, 34, 34, 45, 60, 27, 40, 27, 38, 60, 60, 60, 60, 60, 60, 60, 60, 60, 60, 29, 29, 60,
    60, 60, 48, 89, 64, 65, 62, 67, 58, 56, 70, 71, 40, 51, 63, 50, 81, 71, 71, 61, 71, 64, 58, 57, 68, 61, 89, 61, 59,
    58, 32, 38, 32, 60, 57, 60, 53, 58, 50, 58, 55, 32, 53, 57, 25, 25, 53, 27, 87, 57, 56, 58, 58, 37, 49, 35, 57, 49,
    77, 51, 50, 46, 34, 31, 34, 60
  ]
  kit.textWidth = (s: string, size: number) =>
    Math.ceil(([...String(s)].reduce((sum, ch) => sum + (PLEX[ch.charCodeAt(0) - 32] ?? 55), 0) * size) / 100)

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
        clip: o.clip,
        opacity: o.opacity,
        rot: o.rot
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
  kit.ellipse = (size: number, color?: any, name = 'Ellipse') =>
    kit.box(name, { w: size, h: size, fill: color, radius: size / 2 })
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
      estimationLabel: d.estLabel,
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
  kit.Avatar = (initials: string, color = 'Blueberry', size = 20, round = false) =>
    node('Avatar', 'Avatar/' + size, { person: person(initials, color), size, round: round || undefined })
  kit.AvatarEmpty = (size = 20) => node('Avatar', 'Avatar/empty', { size })
  kit.Chip = (content: any, o: Record<string, any> = {}) => kit.add(node('Chip', o.name ?? 'Chip', {}), content)
  kit.Label = (name: string, color = 'Sky') => node('Tag', 'Label', { label: [name, color] })
  kit.Count = (n: number) => node('Count', 'Count', { value: n })
  kit.StatusChip = (name: string, cat: string, o: Record<string, any> = {}) =>
    node('StatusChip', 'StatusChip/' + name, {
      status: { name, category: cat },
      count: o.count,
      draggable: o.drag,
      block: o.w !== undefined ? true : undefined,
      pill: o.pill,
      width: o.w
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
  kit.Checkbox = (checked: boolean, label?: string, o: Record<string, any> = {}) =>
    node('Checkbox', 'Checkbox', {
      checked,
      label,
      indeterminate: o.indeterminate,
      size: o.size,
      kind: o.kind,
      shape: o.shape,
      disabled: o.disabled,
      error: o.error
    })
  kit.Toggle = (on: boolean, label?: string, o: Record<string, any> = {}) =>
    node('Toggle', 'Toggle', {
      on,
      label,
      size: o.size,
      kind: o.kind,
      description: o.description,
      labelPosition: o.labelPosition,
      disabled: o.disabled
    })
  kit.Radio = (on: boolean, label: string, hint?: string, o: Record<string, any> = {}) =>
    node('Radio', 'Radio ' + label, { on, label, hint, size: o.size, kind: o.kind, disabled: o.disabled })
  kit.Menu = (items: any[], o: Record<string, any> = {}) =>
    node('Menu', o.name ?? 'Menu', { items: items.map((it) => (it === '-' ? { divider: true } : it)), width: o.w })
  kit.TextInput = (o: Record<string, any> = {}) =>
    node('TextInput', 'TextInput', {
      kind: o.kind,
      size: o.size,
      value: o.value,
      placeholder: o.placeholder,
      label: o.label,
      icon: o.icon,
      clearable: o.clearable,
      error: o.error,
      disabled: o.disabled,
      heading: o.heading,
      width: o.w
    })
  kit.TextArea = (o: Record<string, any> = {}) =>
    node('TextArea', 'TextArea', {
      kind: o.kind,
      size: o.size,
      value: o.value,
      placeholder: o.placeholder,
      rows: o.rows,
      error: o.error,
      disabled: o.disabled,
      width: o.w
    })
  kit.SelectButton = (o: Record<string, any> = {}) =>
    node('SelectButton', 'SelectButton', {
      kind: o.kind,
      size: o.size,
      label: o.label,
      placeholder: o.placeholder,
      icon: o.icon,
      chevron: o.chevron,
      pressed: o.pressed,
      disabled: o.disabled,
      field: o.field,
      width: o.w
    })
  kit.Dropdown = (o: Record<string, any> = {}) =>
    node('Dropdown', 'Dropdown', {
      values: o.values,
      placeholder: o.placeholder,
      icon: o.icon,
      kind: o.kind,
      size: o.size,
      chevron: o.chevron,
      width: o.w
    })
  kit.SearchInput = (o: Record<string, any> = {}) =>
    node('SearchInput', 'SearchInput', {
      kind: o.kind,
      size: o.size,
      value: o.value,
      placeholder: o.placeholder,
      collapsed: o.collapsed,
      width: o.w
    })
  kit.SettingRow = (label: string, control: any, o: Record<string, any> = {}) => {
    const n = node('SettingRow', 'SettingRow ' + label, {
      label,
      hint: o.hint,
      stacked: o.stacked,
      alignTop: o.alignTop,
      kind: o.kind,
      fullWidth: o.fill,
      width: o.w
    })
    kit.add(n, control)
    for (const d of flat([o.details ?? []])) n.children.push(inSlot(d, 'details'))
    return n
  }
  kit.Section = (label: string, kids: any, o: Record<string, any> = {}) => {
    const n = node('Section', 'Section ' + label, { label, icon: o.icon, level: o.level, width: o.w })
    kit.add(n, kids)
    for (const a of flat([o.actions ?? []])) n.children.push(inSlot(a, 'actions'))
    return n
  }
  kit.Callout = (text: string, o: Record<string, any> = {}) => {
    const n = node('Callout', 'Callout/' + (o.tone ?? 'info'), { text, tone: o.tone, title: o.title, width: o.w })
    for (const a of flat([o.actions ?? []])) n.children.push(inSlot(a, 'actions'))
    return n
  }
  kit.KitStatusIcon = (tone: string, o: Record<string, any> = {}) =>
    node('KitStatusIcon', 'KitStatusIcon/' + tone, { tone, kind: o.kind, size: o.size, dot: o.dot })
  kit.Steps = (items: string[], selected?: number, _o: Record<string, any> = {}) =>
    node('Steps', 'Steps', { items, selected })
  kit.EmptyState = (label: string, o: Record<string, any> = {}) =>
    node('EmptyState', 'EmptyState ' + label, {
      label,
      description: o.description,
      icon: o.icon,
      size: o.size,
      kind: o.kind,
      action: o.action,
      width: o.w,
      height: o.h
    })
  kit.KitChip = (label: string, o: Record<string, any> = {}) =>
    node('KitChip', 'KitChip ' + label, {
      label,
      kind: o.kind,
      tone: o.tone,
      size: o.size,
      color: col(o.color),
      icon: o.icon,
      removable: o.removable
    })
  kit.Dialog = (title: string, kids: any, o: Record<string, any> = {}) =>
    kit.add(
      node(
        'Dialog',
        'Dialog ' + title,
        {
          title,
          width: o.w,
          submitLabel: o.submitLabel,
          cancelLabel: o.cancelLabel,
          submitKind: o.submitKind,
          canSubmit: o.canSubmit,
          footer: o.footer
        },
        o.w ?? 600,
        o.h ?? 400
      ),
      kids
    )
  kit.KitWizardDialog = (title: string, steps: string[], selected: number, kids: any, o: Record<string, any> = {}) =>
    kit.add(
      node(
        'KitWizardDialog',
        'KitWizardDialog ' + title,
        {
          title,
          steps,
          selected,
          width: o.w,
          submitLabel: o.submitLabel,
          canProceed: o.canProceed,
          canSubmit: o.canSubmit,
          earlySubmit: o.earlySubmit
        },
        o.w ?? 896,
        o.h ?? 600
      ),
      kids
    )
  kit.Tabs = (items: any[], selected?: string, o: Record<string, any> = {}) =>
    node('Tabs', 'Tabs', { items, selected, size: o.size })
  kit.SegmentedControl = (items: any[], selected?: string, o: Record<string, any> = {}) =>
    node('SegmentedControl', 'SegmentedControl', { items, selected, size: o.size, iconOnly: o.iconOnly })
  kit.ButtonGroup = (items: any[], selected?: string, o: Record<string, any> = {}) =>
    node('ButtonGroup', 'ButtonGroup', { items, selected, kind: o.kind, size: o.size })
  kit.KitNavItem = (label: string, o: Record<string, any> = {}) =>
    node('KitNavItem', 'KitNavItem ' + label, {
      label,
      icon: o.icon,
      count: o.count,
      selected: o.selected,
      level: o.level,
      kind: o.kind,
      expandable: o.expandable,
      open: o.open,
      description: o.description,
      identifier: o.identifier,
      width: o.w
    })
  kit.KitNavGroup = (label: string, o: Record<string, any> = {}) =>
    node('KitNavGroup', 'KitNavGroup ' + label, {
      label,
      icon: o.icon,
      kind: o.kind,
      expandable: o.expandable,
      open: o.open,
      divider: o.divider,
      selected: o.selected,
      width: o.w
    })
  kit.Breadcrumbs = (items: any[], _o: Record<string, any> = {}) => node('Breadcrumbs', 'Breadcrumbs', { items })
  kit.Notice = (text: string, kind = 'warning', o: Record<string, any> = {}) =>
    node('Notice', 'Notice/' + kind, { text, kind, pill: o.pill, block: o.w !== undefined ? true : undefined })
  kit.QuickFilter = (label: string, on?: boolean) => node('QuickFilter', 'QuickFilter/' + label, { label, on })
  kit.FilterChip = (attribute: string, operator: string, value: any, o: Record<string, any> = {}) => {
    const chip = node('FilterChip', 'FilterChip/' + attribute, {
      attribute,
      operator,
      value: typeof value === 'string' ? value : undefined,
      plain: o.plain,
      condition: o.condition
    })
    return typeof value === 'string' ? chip : kit.add(chip, value)
  }
  kit.Swatch = (color: any, size?: number) => node('Swatch', 'Swatch', { color: col(color), size })
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
  kit.IssueCard = (d: Record<string, any>) =>
    node('IssueCard', 'IssueCard ' + d.id, {
      issue: toIssue(d),
      density: d.density,
      hover: d.hover,
      dragged: d.dragged,
      lifted: d.lifted,
      focus: d.focus,
      productIcons: d.productIcons
    })
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
    node('KanbanColumn', 'Column ' + c.name, { column: toColumn(c.name, c.cat, c.count, c), density: c.density })

  const navProps = (o: Record<string, any>): Record<string, any> => ({
    title: o.title ?? 'Tracker',
    newLabel: o.newLabel === null ? undefined : (o.newLabel ?? 'New issue'),
    entries: o.nav ?? [],
    footer: o.footer,
    tools: o.tools
  })

  // Standalone elements of the workbench, each a frame of its own on the canvas
  kit.TopBar = (w: number, o: Record<string, any> = {}) =>
    node(
      'TopBar',
      'Top bar',
      { tab: o.tab === null ? undefined : { label: o.tab ?? 'Tracker', icon: o.tabIcon ?? 'tracker/tracker' } },
      w,
      36
    )
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
    for (const a of flat([o.end ?? []])) n.children.push(inSlot(a, 'end'))
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
        menu: o.menu,
        iconRight: o.iconRight
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
  kit.WizardBar = (steps: string[], step: number, o: Record<string, any> = {}) =>
    node('WizardBar', 'WizardBar', { steps, step }, o.w ?? 184, 10)
  kit.WizardDialog = (title: string, steps: string[], step: number, o: Record<string, any> = {}) => {
    const modal = node(
      'WizardDialog',
      'WizardDialog ' + title,
      { title, steps, step, width: o.w, back: o.back, next: o.next, submit: o.submit, canProceed: o.canProceed },
      o.w ?? 896,
      o.h ?? 600
    )
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
      tabsWidth: o.tabsWidth,
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

  // Login page: the card sits in the middle of the frame, forms are added to it
  kit.LoginPage = (name: string, x: number, y: number, o: Record<string, any> = {}) => {
    const frame = node('LoginPage', name, { copyright: o.copyright }, o.w ?? 1920, o.h ?? 1080)
    const card = node('LoginCard', 'Login card', {}, 460, 10)
    frame.children.push(card)
    frame.pos = { x, y }
    current.frames.push(frame)
    return { frame, card }
  }
  kit.LoginForm = (card: RNode, o: Record<string, any> = {}) => {
    const form = node('LoginForm', 'Login form', { pad: o.pad }, 460, 10)
    card.children.push(form)
    return form
  }
  kit.LoginTabs = (heading: string | null, tabs: string[], selected: string, w = 396) =>
    node('LoginTabs', 'Tabs', { heading: heading ?? undefined, tabs, selected, width: w })
  kit.LoginTitle = (text: string, o: Record<string, any> = {}) =>
    node('LoginTitle', 'Title', { text, subtitle: o.subtitle })
  kit.LoginField = (label: string, o: Record<string, any> = {}) =>
    node('LoginField', 'Field ' + label, { label, value: o.value, password: o.password, error: o.error, width: o.w })
  kit.LoginStatus = (text?: string, o: Record<string, any> = {}) =>
    node('LoginStatus', 'Status', { text, kind: o.kind })
  kit.LoginButton = (label: string, o: Record<string, any> = {}) =>
    node('LoginButton', 'Button ' + label, { label, kind: o.kind, disabled: o.disabled, icon: o.icon, width: o.w })
  kit.LoginProviders = (items: any[], width = 396) => node('LoginProviders', 'Providers', { items, width })
  kit.LoginCheckbox = (checked: boolean, label: string, o: Record<string, any> = {}) =>
    node('LoginCheckbox', 'Check ' + label.slice(0, 24), { checked, label, invalid: o.invalid })
  kit.LoginLinks = (rows: any[], o: Record<string, any> = {}) =>
    node('LoginLinks', 'Links', { rows, accent: o.accent, width: o.w })
  kit.LoginAction = (text: string) => node('LoginAction', 'Action', { text })
  kit.LoginOtpHeader = (title: string, sent: string, email: string) =>
    node('LoginOtpHeader', 'Header', { title, sent, email })
  kit.LoginCode = (digits = '') => node('LoginCode', 'Code', { digits })
  kit.LoginWorkspace = (name: string, note: string, o: Record<string, any> = {}) =>
    node('LoginWorkspace', 'Workspace ' + name, { name, note, width: o.w })
  kit.LoginBackTitle = (title: string, o: Record<string, any> = {}) =>
    node('LoginBackTitle', 'Back title', { title, width: o.w })

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
    const fn = new AsyncFunction('kit', 'T', 'D', 'P', 'PB', 'PT', 'TOKENS', 'DEMO', 'penpot', code)
    return await fn(kit, T, D, P, PB, PT, TOKENS, input.demo, penpot)
  }
  return { pages, run }
}
