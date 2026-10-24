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

import { getEmbeddedLabel, translateCB, type Asset } from '@hcengineering/platform'
import { themeStore, ThemeOptions } from '@hcengineering/theme'
import { get } from 'svelte/store'
import { tick, type ComponentProps } from 'svelte'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { closeTooltip, tooltipstore } from '../../tooltips'
import Button from '../../ui-kit/button/Button.svelte'
import ButtonWithContent from './ButtonWithContent.svelte'

vi.mock('@hcengineering/platform', async (importOriginal) => {
  const platform = await importOriginal<typeof import('@hcengineering/platform')>()
  return { ...platform, translateCB: vi.fn(platform.translateCB) }
})

const ICON = 'ui:icon:Check' as Asset
const LABEL = getEmbeddedLabel('Save')

let target: HTMLElement
const mounted: Array<{ $destroy: () => void }> = []

function mount (props: ComponentProps<Button> = {}): { button: HTMLButtonElement, component: Button } {
  const host = document.createElement('div')
  target.appendChild(host)
  const component = new Button({ target: host, props })
  mounted.push(component)
  return { button: host.querySelector('button') as HTMLButtonElement, component }
}

function click (button: HTMLButtonElement): MouseEvent {
  const event = new MouseEvent('click', { bubbles: true, cancelable: true })
  button.dispatchEvent(event)
  return event
}

describe('ui-kit Button', () => {
  beforeEach(() => {
    target = document.createElement('div')
    document.body.appendChild(target)
  })

  afterEach(() => {
    mounted.splice(0).forEach((component) => {
      component.$destroy()
    })
    target.remove()
  })

  describe('rendering', () => {
    it('is a native button of type "button" with secondary, large, rectangle defaults', () => {
      const { button } = mount()
      expect(button.type).toBe('button')
      expect([...button.classList]).toEqual(
        expect.arrayContaining(['button--secondary', 'button--large', 'button--rectangle'])
      )
    })

    it.each([
      'primary',
      'brand',
      'secondary',
      'tertiary',
      'ghost',
      'positive',
      'negative',
      'chip',
      'light',
      'dark'
    ] as const)('renders the %s kind', (kind) => {
      const { button } = mount({ kind })
      expect(button.classList.contains(`button--${kind}`)).toBe(true)
    })

    it('has an extra-large size for the login and onboarding screens', () => {
      const { button } = mount({ label: LABEL, size: 'extra-large' })
      expect(button.classList.contains('button--extra-large')).toBe(true)
    })

    it('passes kind, size, shape and type through', () => {
      const { button } = mount({ kind: 'negative', size: 'extra-small', shape: 'round', type: 'submit' })
      expect([...button.classList]).toEqual(
        expect.arrayContaining(['button--negative', 'button--extra-small', 'button--round'])
      )
      expect(button.type).toBe('submit')
    })

    it('falls back to the defaults when kind, size, shape and type are later set to undefined', async () => {
      const { button, component } = mount({ kind: 'negative', size: 'small', shape: 'round', type: 'submit' })
      component.$set({ kind: undefined, size: undefined, shape: undefined, type: undefined })
      await tick()
      expect(button.type).toBe('button')
      expect([...button.classList]).toEqual(
        expect.arrayContaining(['button--secondary', 'button--large', 'button--rectangle'])
      )
      expect(button.className).not.toContain('undefined')
    })

    it('renders the translated label', async () => {
      const { button } = mount({ label: LABEL })
      await tick()
      expect(button.querySelector('.button__label')?.textContent).toBe('Save')
    })

    it('does not re-translate the label on a theme change other than language', async () => {
      mount({ label: LABEL })
      await tick()
      vi.mocked(translateCB).mockClear()

      const theme = get(themeStore)
      themeStore.set(new ThemeOptions(theme.fontSize, !theme.dark, theme.language, theme.emoji, theme.accent))
      await tick()
      expect(translateCB).not.toHaveBeenCalled()
      themeStore.set(theme)
    })

    it('renders default slot content and is not icon-only then', () => {
      const host = document.createElement('div')
      target.appendChild(host)
      mounted.push(new ButtonWithContent({ target: host, props: { icon: ICON } }))
      const button = host.querySelector('button') as HTMLButtonElement
      expect(button.querySelector('.content')?.textContent).toBe('Custom')
      expect(button.classList.contains('button--icon-only')).toBe(false)
    })
  })

  describe('icon', () => {
    it('is icon-only with an icon and no label, with a small icon', () => {
      const { button } = mount({ icon: ICON })
      expect(button.classList.contains('button--icon-only')).toBe(true)
      expect(button.querySelector('svg.svg-small')).not.toBeNull()
    })

    it('uses a medium icon next to a label and a small one in a menu button', async () => {
      const { button, component } = mount({ icon: ICON, label: LABEL, hasMenu: false })
      expect(button.classList.contains('button--icon-only')).toBe(false)
      expect(button.querySelector('svg.svg-medium')).not.toBeNull()

      component.$set({ hasMenu: true })
      await tick()
      expect(button.querySelector('svg.svg-small')).not.toBeNull()
    })

    it('lets iconSize override the default', () => {
      const { button } = mount({ icon: ICON, iconSize: 'large' })
      expect(button.querySelector('svg.svg-large')).not.toBeNull()
    })
  })

  describe('tooltip', () => {
    afterEach(() => {
      closeTooltip()
      vi.useRealTimers()
    })

    it('shows after 500 ms by default', () => {
      vi.useFakeTimers()
      const { button } = mount({ icon: ICON, tooltip: { label: getEmbeddedLabel('Settings') } })
      button.dispatchEvent(new MouseEvent('mousemove'))

      vi.advanceTimersByTime(499)
      expect(get(tooltipstore).label).toBeUndefined()
      vi.advanceTimersByTime(1)
      expect(get(tooltipstore).label).toBeDefined()
    })

    it('keeps a timeout given by the caller', () => {
      vi.useFakeTimers()
      const { button } = mount({ icon: ICON, tooltip: { label: getEmbeddedLabel('Settings'), timeout: 100 } })
      button.dispatchEvent(new MouseEvent('mousemove'))

      vi.advanceTimersByTime(100)
      expect(get(tooltipstore).label).toBeDefined()
    })
  })

  describe('accessible name', () => {
    it('names an icon-only button after its tooltip', async () => {
      const { button } = mount({ icon: ICON, tooltip: { label: getEmbeddedLabel('Settings') } })
      await tick()
      expect(button.getAttribute('aria-label')).toBe('Settings')
    })

    it('does not re-translate for a recreated tooltip object or a theme change', async () => {
      const { component } = mount({ icon: ICON, tooltip: { label: getEmbeddedLabel('Settings') } })
      await tick()
      vi.mocked(translateCB).mockClear()

      component.$set({ tooltip: { label: getEmbeddedLabel('Settings') } })
      const theme = get(themeStore)
      themeStore.set(new ThemeOptions(theme.fontSize, !theme.dark, theme.language, theme.emoji, theme.accent))
      await tick()
      expect(translateCB).not.toHaveBeenCalled()
      themeStore.set(theme)
    })

    it('keeps the current name when an answer for a previous tooltip comes later', async () => {
      const answers: Array<(text: string) => void> = []
      vi.mocked(translateCB).mockImplementation((_label, _params, _language, cb) => {
        answers.push(cb)
      })
      const { button, component } = mount({ icon: ICON, tooltip: { label: getEmbeddedLabel('Old') } })
      component.$set({ tooltip: { label: getEmbeddedLabel('New') } })
      await tick()
      vi.mocked(translateCB).mockReset()
      expect(answers).toHaveLength(2)
      answers[1]('New')
      answers[0]('Old')
      await tick()
      expect(button.getAttribute('aria-label')).toBe('New')
    })

    it('prefers an explicit aria-label', async () => {
      const { button } = mount({ icon: ICON, tooltip: { label: getEmbeddedLabel('Settings') }, 'aria-label': 'Open' })
      await tick()
      expect(button.getAttribute('aria-label')).toBe('Open')
    })

    it('keeps the tooltip name when aria-label is passed as undefined', async () => {
      const { button } = mount({
        icon: ICON,
        tooltip: { label: getEmbeddedLabel('Settings') },
        'aria-label': undefined
      })
      await tick()
      expect(button.getAttribute('aria-label')).toBe('Settings')
    })

    it('leaves a labelled button to its label', async () => {
      const { button } = mount({ icon: ICON, label: LABEL, tooltip: { label: getEmbeddedLabel('Settings') } })
      await tick()
      expect(button.hasAttribute('aria-label')).toBe(false)
    })
  })

  describe('state', () => {
    it('shows pressed as a look only, without aria-pressed', async () => {
      const { button, component } = mount({ pressed: false })
      expect(button.hasAttribute('aria-pressed')).toBe(false)
      expect(button.classList.contains('button--pressed')).toBe(false)

      component.$set({ pressed: true })
      await tick()
      expect(button.hasAttribute('aria-pressed')).toBe(false)
      expect(button.classList.contains('button--pressed')).toBe(true)
    })

    it('reports an open popup through aria-expanded for a menu button', async () => {
      const { button, component } = mount({ hasMenu: true, pressed: false })
      expect(button.getAttribute('aria-haspopup')).toBe('true')
      expect(button.getAttribute('aria-expanded')).toBe('false')
      expect(button.hasAttribute('aria-pressed')).toBe(false)

      component.$set({ pressed: true })
      await tick()
      expect(button.getAttribute('aria-expanded')).toBe('true')
    })

    it('is a toggle with selected, reported through aria-pressed', async () => {
      const { button, component } = mount({ selected: undefined })
      expect(button.hasAttribute('aria-pressed')).toBe(false)

      component.$set({ selected: false })
      await tick()
      expect(button.getAttribute('aria-pressed')).toBe('false')
      expect(button.classList.contains('button--selected')).toBe(false)

      component.$set({ selected: true })
      await tick()
      expect(button.getAttribute('aria-pressed')).toBe('true')
      expect(button.classList.contains('button--selected')).toBe(true)
    })

    it('keeps selected and pressed apart', async () => {
      const { button } = mount({ selected: false, pressed: true })
      expect(button.getAttribute('aria-pressed')).toBe('false')
      expect(button.classList.contains('button--pressed')).toBe(true)
      expect(button.classList.contains('button--selected')).toBe(false)
    })

    it('shows a spinner instead of the icon and blocks clicks while loading', async () => {
      const { button, component } = mount({ icon: ICON, loading: true })
      const onClick = vi.fn()
      component.$on('click', onClick)
      expect(button.disabled).toBe(true)
      expect(button.getAttribute('aria-busy')).toBe('true')
      // The kit spinner, decorative and in the icon color: the button itself reports aria-busy.
      const spinner = button.querySelector('.button__icon .spinner')
      expect(spinner?.classList.contains('spinner--small')).toBe(true)
      expect(spinner?.classList.contains('spinner--inherit')).toBe(true)
      expect(spinner?.getAttribute('aria-hidden')).toBe('true')
      expect(button.querySelector('svg.svg-small')).toBeNull()
      button.click()
      expect(onClick).not.toHaveBeenCalled()

      component.$set({ loading: false })
      await tick()
      expect(button.disabled).toBe(false)
      expect(button.hasAttribute('aria-busy')).toBe(false)
      expect(button.querySelector('.spinner')).toBeNull()
    })

    it('blocks clicks while disabled', () => {
      const { button, component } = mount({ disabled: true })
      const onClick = vi.fn()
      component.$on('click', onClick)
      button.click()
      expect(onClick).not.toHaveBeenCalled()
    })
  })

  describe('events', () => {
    it('forwards click as a MouseEvent and keeps it from the containers around', () => {
      const { button, component } = mount()
      const onClick = vi.fn<(event: MouseEvent) => void>()
      const onParent = vi.fn()
      component.$on('click', onClick)
      target.addEventListener('click', onParent)

      const event = click(button)
      expect(onClick).toHaveBeenCalledTimes(1)
      expect(onClick.mock.calls[0][0]).toBeInstanceOf(MouseEvent)
      expect(onParent).not.toHaveBeenCalled()
      expect(event.defaultPrevented).toBe(true)
    })

    it('lets the click bubble with stopPropagation false, also after an update to undefined', async () => {
      const { button, component } = mount({ stopPropagation: false })
      const onParent = vi.fn()
      target.addEventListener('click', onParent)

      const event = click(button)
      expect(onParent).toHaveBeenCalledTimes(1)
      expect(event.defaultPrevented).toBe(false)

      component.$set({ stopPropagation: undefined })
      await tick()
      click(button)
      expect(onParent).toHaveBeenCalledTimes(1)
    })

    it('does not prevent the default of a submit button', () => {
      const { button } = mount({ type: 'submit' })
      const onParent = vi.fn()
      target.addEventListener('click', onParent)

      const event = click(button)
      expect(onParent).not.toHaveBeenCalled()
      expect(event.defaultPrevented).toBe(false)
    })

    it('forwards keydown, focus and blur', () => {
      const { button, component } = mount()
      const handlers = { keydown: vi.fn(), focus: vi.fn(), blur: vi.fn() }
      component.$on('keydown', handlers.keydown)
      component.$on('focus', handlers.focus)
      component.$on('blur', handlers.blur)

      button.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Enter' }))
      button.focus()
      button.blur()
      expect(handlers.keydown).toHaveBeenCalledTimes(1)
      expect(handlers.focus).toHaveBeenCalledTimes(1)
      expect(handlers.blur).toHaveBeenCalledTimes(1)
    })
  })

  describe('attributes and focus', () => {
    it('passes id, data-* and aria-* attributes to the native button', () => {
      const { button } = mount({ id: 'save', 'data-id': 'btnSave', 'aria-describedby': 'hint' })
      expect(button.id).toBe('save')
      expect(button.dataset.id).toBe('btnSave')
      expect(button.getAttribute('aria-describedby')).toBe('hint')
    })

    it('takes tabindex, so a button can leave the Tab order', () => {
      const { button } = mount({ tabindex: -1 })
      expect(button.tabIndex).toBe(-1)
    })

    it('focuses itself on mount when autofocus is set', () => {
      const { button } = mount({ autofocus: true })
      expect(document.activeElement).toBe(button)
    })

    it('exposes focus() and binds the native element', () => {
      const { button, component } = mount()
      component.focus()
      expect(document.activeElement).toBe(button)
    })
  })

  describe('focus while loading', () => {
    it('gets the focus back when the action ends and the focus fell to the page', async () => {
      const { button, component } = mount({ label: getEmbeddedLabel('Save') })
      button.focus()
      component.$set({ loading: true })
      await tick()
      // A browser blurs a button that turns disabled; jsdom does not.
      button.blur()
      component.$set({ loading: false })
      await tick()
      await tick()
      expect(document.activeElement).toBe(button)
    })

    it('leaves the focus where the user moved it', async () => {
      const { button, component } = mount({ label: getEmbeddedLabel('Save') })
      const other = document.createElement('input')
      target.appendChild(other)
      button.focus()
      component.$set({ loading: true })
      await tick()
      other.focus()
      component.$set({ loading: false })
      await tick()
      await tick()
      expect(document.activeElement).toBe(other)
    })

    it('does not take the focus when it was not focused before', async () => {
      const { button, component } = mount({ label: getEmbeddedLabel('Save'), loading: true })
      component.$set({ loading: false })
      await tick()
      await tick()
      expect(document.activeElement).not.toBe(button)
    })
  })
})
