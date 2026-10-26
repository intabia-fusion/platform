// Login pages (plugins/login-resources). The Intabia login theme is fixed: its colors
// do not follow the platform theme, so they are plain hex. Geometry is measured on the
// sanity stand at 1920x1080 (card 460, form 396).

const LG = {
  heading: '#000061',
  text: '#201240',
  label: '#333333',
  link: '#6E48CE',
  pink: '#CF13A2',
  input: '#F3E5F5',
  border: '#E5E7EB',
  disabled: '#F3EAFB',
  disabledText: '#9CA3AF',
  black: '#07040F',
  white: '#FFFFFF',
  page: '#F1F1F4'
}
const LG_ERROR = '#EE7A7A'

// Logo of the top left corner (IntabiaIcon.svelte), viewBox 235x50
const LOGIN_LOGO = [["M19.469 27.9642C17.8289 27.9642 16.5013 26.6366 16.5013 25.0356C16.5013 23.3955 17.8289 22.1069 19.469 22.1069C21.07 22.1069 22.3976 23.3955 22.3976 25.0356C22.3976 26.6366 21.07 27.9642 19.469 27.9642Z", "#CF13A2"], ["M15.7203 32.2206V29.37H23.1396V32.2206H22.0071V38.898H24.272V43.5057H14.5879V38.898H16.8137V32.2206H15.7203Z", "#CF13A2"], ["M36.299 35.5788V43.3495H41.4925V33.3921C41.4925 30.971 40.0867 28.9796 36.8457 28.9796C34.3856 28.9796 32.8237 29.9948 32.0427 30.932V29.331H26.8101V43.3495H32.0427V34.6807C32.4722 34.2121 33.058 33.5873 34.2685 33.5873C35.518 33.5873 36.299 34.134 36.299 35.5788Z", "#CF13A2"], ["M5.63094 16.0006C4.86473 17.1762 4.37346 18.0019 4.37346 18.0019L0 14.5266C0 14.5266 1.83528 11.4417 3.94392 8.74735C5.93541 6.17012 8.20023 3.94434 8.20023 3.94434L12.5737 7.41968C12.5737 7.41968 12.4667 7.52484 12.2788 7.71551C13.8925 8.108 16.8214 9.49243 19.1798 10.6072C19.8661 10.9316 20.5041 11.2332 21.0473 11.4808C22.0235 11.8713 22.7654 13.0428 23.8198 14.7609C24.9131 16.5181 25.8893 18.1191 25.9284 19.5249C25.9428 19.7992 26.0533 20.7673 26.1849 21.9201C26.4093 23.8857 26.6949 26.3882 26.6703 26.9051C26.5922 27.6861 24.5617 27.8423 23.7026 25.3431C23.5074 24.0936 22.8045 20.1497 22.5702 19.5639C22.3749 19.0172 19.8758 16.4791 17.4158 16.2838C16.5567 16.2057 15.5024 16.2838 15.3071 16.5181C14.6433 17.1429 14.2138 18.041 13.9795 18.7439C13.8693 19.809 14.7608 23.3265 14.9647 24.131C14.9776 24.1819 14.9878 24.2219 14.9947 24.2498C15.6195 26.9441 13.628 27.4518 13.3937 27.2565C13.2319 27.0515 13.0074 26.6467 12.7178 26.1244C11.9595 24.7569 10.7548 22.5845 9.05932 21.0868C8.20024 20.3449 7.10687 19.2515 6.67734 18.7829C6.22991 18.2759 5.78248 16.9713 5.63094 16.0006Z", "#FFFFFF"], ["M51.1185 37.7549C51.1185 38.4968 51.587 39.0825 52.2899 39.0825C52.7585 39.0825 53.2271 38.9263 53.3442 38.8092L54.2424 42.7531C53.6957 43.2217 52.4852 43.6903 50.728 43.6903C47.6431 43.6903 45.925 42.2064 45.925 39.2778V33.85H43.6211V29.3203H45.925V25.4936H51.1185V29.3203H53.969V33.85H51.1185V37.7549ZM65.137 43.3388V42.0112C64.356 42.9874 62.6769 43.6903 60.9197 43.6903C58.8501 43.6903 56.1167 42.2455 56.1167 39.0825C56.1167 35.5681 58.8501 34.5919 60.9197 34.5919C62.755 34.5919 64.395 35.1776 65.137 36.1539V34.67C65.137 33.6938 64.2388 32.9519 62.5597 32.9519C61.2321 32.9519 59.7482 33.4595 58.6549 34.3186L56.8977 31.0775C58.772 29.5937 61.3883 28.9689 63.4969 28.9689C66.9723 28.9689 70.3695 30.1794 70.3695 34.8653V43.3388H65.137ZM65.137 38.7311C64.7855 38.2625 63.8874 37.9892 63.1064 37.9892C62.2083 37.9892 61.2711 38.2625 61.2711 39.1606C61.2711 40.0197 62.2083 40.293 63.1064 40.293C63.8874 40.293 64.7855 40.0197 65.137 39.5121V38.7311ZM81.8108 43.6903C80.405 43.6903 79.0774 43.1827 77.9059 41.855V43.3388H72.6734V23.9707H77.9059V30.8042C78.9993 29.4765 80.405 28.9689 81.8108 28.9689C85.2861 28.9689 87.9805 31.6633 87.9805 36.3101C87.9805 41.1131 85.208 43.6903 81.8108 43.6903ZM80.0536 33.5766C79.3507 33.5766 78.3745 33.9281 77.9059 34.5529V38.1454C78.3745 38.7311 79.3507 39.0825 80.0536 39.0825C81.4594 39.0825 82.6699 38.0673 82.6699 36.3101C82.6699 34.5529 81.4594 33.5766 80.0536 33.5766ZM92.5492 28.3051C90.9092 28.3051 89.6205 27.0165 89.6205 25.3764C89.6205 23.7364 90.9092 22.4478 92.5492 22.4478C94.1502 22.4478 95.4779 23.7364 95.4779 25.3764C95.4779 27.0165 94.1502 28.3051 92.5492 28.3051ZM95.1264 43.3388H89.9329V29.3203H95.1264V43.3388ZM106.685 43.3388V42.0112C105.904 42.9874 104.225 43.6903 102.468 43.6903C100.398 43.6903 97.6646 42.2455 97.6646 39.0825C97.6646 35.5681 100.398 34.5919 102.468 34.5919C104.303 34.5919 105.943 35.1776 106.685 36.1539V34.67C106.685 33.6938 105.787 32.9519 104.108 32.9519C102.78 32.9519 101.296 33.4595 100.203 34.3186L98.4456 31.0775C100.32 29.5937 102.936 28.9689 105.045 28.9689C108.52 28.9689 111.917 30.1794 111.917 34.8653V43.3388H106.685ZM106.685 38.7311C106.333 38.2625 105.435 37.9892 104.654 37.9892C103.756 37.9892 102.819 38.2625 102.819 39.1606C102.819 40.0197 103.756 40.293 104.654 40.293C105.435 40.293 106.333 40.0197 106.685 39.5121V38.7311Z", "#FFFFFF", "evenodd"]]

// Provider icons (providers/*.svelte): viewBox size and colored paths
const LOGIN_ICONS = {
  google: {
    vb: 48,
    paths: [
      ['M43.611,20.083H42V20H24v8h11.303c-1.649,4.657-6.08,8-11.303,8c-6.627,0-12-5.373-12-12c0-6.627,5.373-12,12-12c3.059,0,5.842,1.154,7.961,3.039l5.657-5.657C34.046,6.053,29.268,4,24,4C12.955,4,4,12.955,4,24c0,11.045,8.955,20,20,20c11.045,0,20-8.955,20-20C44,22.659,43.862,21.35,43.611,20.083z', '#FFC107'],
      ['M6.306,14.691l6.571,4.819C14.655,15.108,18.961,12,24,12c3.059,0,5.842,1.154,7.961,3.039l5.657-5.657C34.046,6.053,29.268,4,24,4C16.318,4,9.656,8.337,6.306,14.691z', '#FF3D00'],
      ['M24,44c5.166,0,9.86-1.977,13.409-5.192l-6.19-5.238C29.211,35.091,26.715,36,24,36c-5.202,0-9.619-3.317-11.283-7.946l-6.522,5.025C9.505,39.556,16.227,44,24,44z', '#4CAF50'],
      ['M43.611,20.083H42V20H24v8h11.303c-0.792,2.237-2.231,4.166-4.087,5.571c0.001-0.001,0.002-0.001,0.003-0.002l6.19,5.238C36.971,39.205,44,34,44,24C44,22.659,43.862,21.35,43.611,20.083z', '#1976D2']
    ]
  },
  github: {
    vb: 72,
    paths: [['M36,12c13.255,0,24,10.745,24,24c0,10.656-6.948,19.685-16.559,22.818c0.003-0.009,0.007-0.022,0.007-0.022s-1.62-0.759-1.586-2.114c0.038-1.491,0-4.971,0-6.248c0-2.193-1.388-3.747-1.388-3.747s10.884,0.122,10.884-11.491c0-4.481-2.342-6.812-2.342-6.812s1.23-4.784-0.426-6.812c-1.856-0.2-5.18,1.774-6.6,2.697c0,0-2.25-0.922-5.991-0.922c-3.742,0-5.991,0.922-5.991,0.922c-1.419-0.922-4.744-2.897-6.6-2.697c-1.656,2.029-0.426,6.812-0.426,6.812s-2.342,2.332-2.342,6.812c0,11.613,10.884,11.491,10.884,11.491s-1.097,1.239-1.336,3.061c-0.76,0.258-1.877,0.576-2.78,0.576c-2.362,0-4.159-2.296-4.817-3.358c-0.649-1.048-1.98-1.927-3.221-1.927c-0.817,0-1.216,0.409-1.216,0.876s1.146,0.793,1.902,1.659c1.594,1.826,1.565,5.933,7.245,5.933c0.617,0,1.876-0.152,2.823-0.279c-0.006,1.293-0.007,2.657,0.013,3.454c0.034,1.355-1.586,2.114-1.586,2.114s0.004,0.013,0.007,0.022C18.948,55.685,12,46.656,12,36C12,22.745,22.745,12,36,12z', '#FFFFFF']]
  },
  openid: {
    vb: 512,
    paths: [
      ['M64,0H448A64,64 0 0 1 512,64V448A64,64 0 0 1 448,512H64A64,64 0 0 1 0,448V64A64,64 0 0 1 64,0Z', '#F68423'],
      ['m 416.99957,216.95084 c -39.2625,-22.18682 -78.9827,-34.64025 -117.0052,-39.52028 V 73.776502 l -60.66712,39.049158 v 63.02711 c -188.010218,14.68899 -295.068752,208.65924 0,262.37073 l 60.66712,-39.04916 V 218.28862 c 24.3468,4.22226 50.4759,12.17342 78.0094,24.69351 l -34.6758,21.70238 h 112.6719 v -73.76497 l -39.0003,26.0313 z m -177.67682,-1.66668 v 183.89018 c -182.841238,-23.72461 -140.809838,-171.94788 0,-183.89018 z', '#FFFFFF']
    ]
  }
}

// Colored vector of several paths as a Penpot SVG import; the pen backend draws path nodes
const loginSvg = (vb, w, h, paths, name) => kit.svg(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${vb[0]} ${vb[1]}">${paths.map(([d, c, rule]) => `<path d="${d}" fill="${c}"${rule ? ` fill-rule="${rule}"` : ''}/>`).join('')}</svg>`, name)

kit.LoginLogo = () => loginSvg([235, 50], 235, 50, LOGIN_LOGO, 'Logo')

// Provider icon, 32x32 as in the buttons: name google | github | openid
kit.LoginIcon = (name, size = 32) => loginSvg([LOGIN_ICONS[name].vb, LOGIN_ICONS[name].vb], size, size, LOGIN_ICONS[name].paths, 'icon/' + name)

// Dark page with the light oval and the balls (GradiantBack.svelte); the pin is simplified
kit.LoginBackground = (w = 1920, h = 1080) => {
  const sy = h / 1036
  const ellipse = [(-552.07 + 3055.18 / 2) * (w / 1920), (726.35 + 193) * sy + 32, 3055.18 * (w / 1920) / 2, 193 * sy]
  const ball = (id, cx, cy, r, a, b, o = 1) => `<defs><linearGradient id="${id}" x1="0.2" y1="0" x2="0.8" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs><circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#${id})" opacity="${o}"/>`
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
<defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0B0123"/><stop offset="0.33" stop-color="#170134"/><stop offset="0.66" stop-color="#250932"/><stop offset="1" stop-color="#100118"/></linearGradient>
<linearGradient id="pink" x1="0.2" y1="0" x2="0.8" y2="1"><stop offset="0" stop-color="#F760D3"/><stop offset="1" stop-color="#A50F7E"/></linearGradient></defs>
<rect x="0" y="32" width="${w}" height="1080" fill="url(#sky)"/>
${ball('bt', 357, -10, 125, '#2E0F52', '#1A0630')}
${ball('br', 1364, 238, 72, '#4A2070', '#26104A', 0.5)}
${ball('bb', 1625, 585, 213, '#431870', '#1C0636')}
<ellipse cx="${ellipse[0]}" cy="${ellipse[1]}" rx="${ellipse[2]}" ry="${ellipse[3]}" fill="#F5F4F5"/>
${ball('bl', 290, 807, 72, '#6B1F8A', '#2D0A52')}
<ellipse cx="1500" cy="860" rx="105" ry="22" fill="#3C1250" opacity="0.5"/>
<path d="M1500 628L1640 668L1585 830L1445 775Z" fill="url(#pink)"/>
<ellipse cx="1572" cy="648" rx="72" ry="26" transform="rotate(20 1572 648)" fill="#D43CB0"/>
<ellipse cx="1503" cy="795" rx="86" ry="40" transform="rotate(25 1503 795)" fill="#C0289C"/>
<circle cx="1602" cy="568" r="59" fill="url(#pink)"/>
</svg>`
  return kit.svg(svg, 'Login background')
}

// Full page: background, logo, copyright and the card in the middle. Returns { frame, card }.
// o: w h copyright [year, owner]
kit.LoginPage = (name, x, y, o = {}) => {
  const W = o.w || 1920
  const H = o.h || 1080
  const f = kit.box(name, { w: W, h: H, fill: LG.page })
  f.x = x
  f.y = y
  penpot.root.appendChild(f)
  kit.at(f, kit.LoginBackground(W, H), 0, 0)
  kit.at(f, kit.LoginLogo(), 44, 48)
  const [year, owner] = o.copyright || ['© 2026,', 'Intabia Fusion']
  kit.at(f, kit.add(kit.row('Copyright', 4), kit.text(year, { size: 14, lh: 1.3, color: T('content-color') }), kit.text(owner, { size: 14, lh: 1.3, color: LG.label })), 28, H - 34.5)
  // The panel is centered in the viewport, the status bar is drawn over it
  const slot = kit.box('Card slot', { w: W, h: H, dir: 'row', align: 'center', justify: 'center', clip: false })
  kit.at(f, slot, 0, 0)
  const card = kit.LoginCard()
  kit.add(slot, card)
  kit.at(f, kit.TopBar(W, { tab: null }), 0, 0)
  return { frame: f, card }
}

// White panel (460 wide), the forms go inside
kit.LoginCard = () => {
  const c = kit.box('Login card', { w: 460, h: 10, dir: 'column', pad: [16, 0, 32, 0], vs: 'auto', radius: 16, fill: '#FAFAFA' })
  c.shadows = [{ style: 'drop-shadow', offsetX: -30, offsetY: 1.5, blur: 174, spread: 0, color: { color: '#121437', opacity: 1 } }]
  return c
}

// Padded container of one form inside the card: o.pad [top, right, bottom, left], 32 by default
kit.LoginForm = (card, o = {}) => {
  const f = kit.box('Login form', { w: 460, h: 10, dir: 'column', pad: o.pad || [32, 32, 32, 32], vs: 'auto' })
  kit.add(card, f)
  return f
}

// Platform title above the Sign up / Log In tabs. tabs: [label], selected: label
kit.LoginTabs = (heading, tabs, selected, w = 396) => {
  const c = kit.box('Tabs', { w, h: 10, dir: 'column', align: 'center', vs: 'auto' })
  const title = kit.box('heading', { w, h: 36, dir: 'row', align: 'center', justify: 'center' })
  if (heading) kit.add(title, kit.text(heading, { size: 28, lh: 1.3, color: LG.heading }))
  const row = kit.box('tabs', { w, h: 34, dir: 'row', gap: 28, align: 'start', justify: 'center' })
  for (const t of tabs) {
    const on = t === selected
    const tab = kit.box('Tab/' + t, { w: 10, h: 34, dir: 'column', gap: 6, hs: 'auto' })
    const line = kit.box('underline', { w: 10, h: 2, fill: on ? LG.pink : null })
    kit.add(tab, kit.text(t, { size: 20, weight: on ? 600 : 500, lh: 1.3, color: LG.label }), line)
    line.layoutChild.horizontalSizing = 'fill'
    kit.add(row, tab)
  }
  return kit.add(c, heading ? title : [], row)
}

// Caption of a form without tabs; subtitle (workspace or person) above it
kit.LoginTitle = (text, o = {}) => {
  const c = kit.box('Title', { w: 396, h: 10, dir: 'column', vs: 'auto' })
  if (o.subtitle) kit.add(c, kit.text(o.subtitle, { size: 14, lh: 1.3, color: LG.text }))
  return kit.add(c, kit.text(text, { size: 28, weight: 700, lh: 1.3, color: LG.label }))
}

// Input with the label inside: it moves up when there is a value. o: w value password error
kit.LoginField = (label, o = {}) => {
  const w = o.w || 396
  const b = kit.box('Field ' + label, { w, h: 52, radius: 12, fill: LG.input, stroke: o.error ? LG_ERROR + '99' : LG.border })
  const has = o.value !== undefined && o.value !== ''
  kit.at(b, kit.text(label, { size: 12, lh: 1.3, color: LG.label + 'CC' }), 21, has ? 9 : 17)
  if (has) kit.at(b, kit.text(o.password ? '•'.repeat(o.value.length) : o.value, { size: 14, lh: 1.3, color: LG.text }), 21, 24)
  return b
}

// Message above the button: kind info | error. Without a text only the 16 px gap stays, as in the product.
kit.LoginStatus = (text, o = {}) => {
  const c = kit.box('Status', { w: 396, h: 16, dir: 'column', pad: [16, 0, 0, 0], vs: 'auto' })
  if (text === undefined || text === null) return c
  const error = o.kind === 'error'
  const col = error ? LG_ERROR : LG.text
  const b = kit.box('message', { w: 396, h: 44, dir: 'row', gap: 8, pad: [12, 16, 12, 16], align: 'start', vs: 'auto', radius: 8, fill: LG.white, stroke: error ? LG_ERROR + '99' : LG.border })
  const icon = kit.box('icon', { w: 16, h: 18, dir: 'column', pad: [2, 0, 0, 0] })
  kit.add(icon, kit.icon('kit/InfoCircle', col, 16))
  return kit.add(c, kit.add(b, icon, kit.text(text, { size: 12, lh: 1.5, color: col, w: 338 })))
}

// Form button: kind primary | default | provider (black, with the icon of o.icon). o: w disabled icon
kit.LoginButton = (label, o = {}) => {
  const kind = o.kind || 'primary'
  const off = o.disabled === true
  const fill = off ? LG.disabled : { primary: LG.pink, default: LG.white, provider: LG.black }[kind]
  const color = off ? LG.disabledText : { primary: LG.white, default: LG.text, provider: LG.white }[kind]
  const b = kit.box('Button ' + label, { w: o.w || 396, h: 56, dir: 'row', gap: 8, pad: [0, 24, 0, 24], align: 'center', justify: 'center', radius: 8, fill, stroke: kind === 'default' && !off ? LG.border : null })
  if (o.icon) kit.add(b, kit.LoginIcon(o.icon))
  return kit.add(b, kit.text(label, { size: 16, weight: kind === 'provider' ? 400 : 600, lh: 1, color }))
}

// Provider buttons in a grid: two columns for an even count, one otherwise. names: google | github | openid
kit.LoginProviders = (items, width = 396) => {
  const cols = items.length % 2 === 0 ? 2 : 1
  const g = kit.box('Providers', { w: width, h: 10, dir: 'column', gap: 16, pad: [16, 0, 0, 0], vs: 'auto' })
  const w = (width - 16 * (cols - 1)) / cols
  for (let i = 0; i < items.length; i += cols) {
    const row = kit.box('row', { w: width, h: 56, dir: 'row', gap: 16 })
    for (const [icon, label] of items.slice(i, i + cols)) kit.add(row, kit.LoginButton(label, { kind: 'provider', icon, w }))
    kit.add(g, row)
  }
  return g
}

// Consent or option line: a 18 px box and the text that wraps at 363. o: invalid
kit.LoginCheckbox = (checked, label, o = {}) => {
  const r = kit.box('Check ' + label.slice(0, 24), { w: 396, h: 24, dir: 'row', gap: 11, pad: [0, 0, 0, 4], align: 'start', vs: 'auto' })
  const holder = kit.box('box holder', { w: 18, h: 24, dir: 'column', pad: [3, 0, 0, 0] })
  const box = kit.box('box', { w: 18, h: 18, dir: 'row', align: 'center', justify: 'center', radius: 3.2, fill: checked ? LG.pink : LG.white, stroke: checked ? LG.pink : o.invalid ? LG_ERROR : '#00000066', strokeW: 2 })
  if (checked) kit.add(box, kit.icon('tick', LG.white, 12))
  return kit.add(r, kit.add(holder, box), kit.text(label, { size: 15.2, lh: 1.3, color: LG.text, w: 363 }))
}

// Rows under the button: [caption, link] pairs. Centered, or o.accent: left, blue links (workspace list).
kit.LoginLinks = (rows, o = {}) => {
  const w = o.w || 396
  const accent = o.accent === true
  const c = kit.box('Links', { w, h: 10, dir: 'column', align: accent ? 'start' : 'center', vs: 'auto' })
  for (const [caption, link] of rows) {
    const r = kit.box('link row', { w, h: 16.5, dir: 'row', gap: 3, align: 'center', justify: accent ? 'start' : 'center', wrap: true, vs: 'auto' })
    kit.add(r, caption ? kit.text(caption, { size: 12.8, lh: 1.3, color: accent ? LG.heading + 'CC' : LG.label }) : [], kit.text(link, { size: 12.8, lh: 1.3, color: accent ? LG.link + 'CC' : LG.label }))
    kit.add(c, r)
  }
  return c
}

// Link under the form, outside its padding (Login with code)
kit.LoginAction = (text) => {
  const r = kit.box('Action', { w: 460, h: 18.5, dir: 'row', align: 'center', justify: 'center' })
  return kit.add(r, kit.text(text, { size: 14, lh: 1.3, color: LG.link }))
}

// Header of the code step: back button, title and the address the code was sent to
kit.LoginOtpHeader = (title, sent, email) => {
  const c = kit.box('Header', { w: 412, h: 10, dir: 'column', gap: 8, vs: 'auto' })
  const row = kit.box('title row', { w: 412, h: 36, dir: 'row', align: 'center', justify: 'center', clip: false })
  const back = kit.box('back', { w: 36, h: 36, dir: 'row', align: 'center', justify: 'center', radius: 8 })
  kit.add(back, kit.icon('kit/ChevronLeftLarge', LG.text, 16))
  kit.at(row, back, 0, 0)
  kit.add(row, kit.text(title, { size: 28, weight: 700, lh: 1.3, color: LG.heading }))
  const d = kit.box('description', { w: 412, h: 20, dir: 'row', gap: 8, align: 'center', justify: 'center' })
  kit.add(d, kit.text(sent, { size: 16, lh: 1.3, color: LG.label }), kit.text(email, { size: 16, lh: 1.3, color: LG.heading }))
  return kit.add(c, row, d)
}

// Six cells of the one-time code with a gap after the third. digits: string of up to six characters
kit.LoginCode = (digits = '') => {
  const r = kit.box('Code', { w: 412, h: 78, dir: 'row', gap: 6.4, align: 'center' })
  for (let i = 0; i < 6; i++) {
    if (i === 3) kit.add(r, kit.box('separator', { w: 12, h: 1, fill: LG.border }))
    const cell = kit.box('digit ' + (i + 1), { w: 60, h: 78, dir: 'row', align: 'center', justify: 'center', radius: 12, fill: LG.input, stroke: T('theme-button-border') })
    kit.add(cell, kit.text(digits[i] || '', { size: 32, lh: 1.3, color: LG.text }))
    kit.add(r, cell)
  }
  return r
}

// Row of the workspace list: name and the days since the last visit
kit.LoginWorkspace = (name, note, o = {}) => {
  const w = o.w || 428
  const r = kit.box('Workspace ' + name, { w, h: 10, dir: 'column', pad: [16, 16, 16, 16], align: 'center', vs: 'auto', radius: 16, fill: T('theme-button-default'), stroke: T('theme-button-border') })
  return kit.add(r, kit.text(name, { size: 14, weight: 600, lh: 1.3, color: LG.text }), kit.text(note, { size: 14, lh: 1.3, color: LG.text }))
}

// Heading of the workspace list: back button and the title
kit.LoginBackTitle = (title, o = {}) => {
  const r = kit.box('Back title', { w: o.w || 428, h: 44, dir: 'row', gap: 8, align: 'center' })
  const back = kit.box('back', { w: 48, h: 44, dir: 'row', align: 'center', justify: 'center', radius: 8 })
  kit.add(back, kit.icon('kit/ChevronLeftLarge', LG.text, 16))
  return kit.add(r, back, kit.text(title, { size: 24, weight: 600, lh: 1.3, color: LG.heading }))
}
