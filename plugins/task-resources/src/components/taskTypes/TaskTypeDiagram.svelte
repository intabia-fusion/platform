<!--
// Copyright © 2026 Intabia Fusion.
//
// Licensed under the Eclipse Public License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License. You may
// obtain a copy of the License at https://www.eclipse.org/legal/epl-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.
-->
<script lang="ts">
  import { onDestroy } from 'svelte'
  import { Ref } from '@hcengineering/core'
  import { TaskType } from '@hcengineering/task'
  import { IconError, Label, Loading, languageStore, themeStore } from '@hcengineering/ui'
  import plugin from '../../plugin'

  export let taskTypes: TaskType[] = []

  let imageUrl: string | undefined = undefined
  let errorMsg: string | undefined = undefined
  let loading = true
  let currentObjectUrl: string | undefined = undefined
  let renderSequence = 0

  $: hasSelfRefs = taskTypes.some((t) => (t.allowedAsChildOf ?? []).includes(t._id))

  function sanitizeLabel (str: string): string {
    if (str === undefined) return ''

    return str
      .replace(/"/g, '#quot;')
      .replace(/[\r\n]+/g, ' ')
      .trim()
  }

  function generateMermaidCode (taskTypes: TaskType[]): string {
    const nodeIds = new Map<Ref<TaskType>, string>()
    taskTypes.forEach((t, idx) => nodeIds.set(t._id, `tt_${idx}`))

    const selfRefs = new Set<Ref<TaskType>>()
    for (const t of taskTypes) {
      for (const p of t.allowedAsChildOf ?? []) {
        if (p === t._id) selfRefs.add(t._id)
      }
    }

    const lines: string[] = ['flowchart TB']

    for (const t of taskTypes) {
      const nodeId = nodeIds.get(t._id)
      if (nodeId === undefined) continue
      lines.push(`  ${nodeId}(["${sanitizeLabel(t.name)}"])`)
    }

    for (const t of taskTypes) {
      const toNode = nodeIds.get(t._id)
      if (toNode === undefined) continue
      for (const parentRef of t.allowedAsChildOf ?? []) {
        if (parentRef === t._id) continue // петлю больше не рисуем
        const fromNode = nodeIds.get(parentRef)
        if (fromNode !== undefined) {
          lines.push(`  ${fromNode} --> ${toNode}`)
        }
      }
    }

    return lines.join('\n')
  }

  function addSelfRefMarkers (svg: string, isDark: boolean): string {
    const selfTypes = taskTypes.filter((t) => (t.allowedAsChildOf ?? []).includes(t._id))
    if (selfTypes.length === 0) return svg

    const holder = document.createElement('div')
    holder.style.position = 'absolute'
    holder.style.visibility = 'hidden'
    document.body.appendChild(holder)
    try {
      holder.innerHTML = svg
      const svgEl = holder.querySelector('svg')
      if (svgEl === null) return svg
      const nodeGroups = Array.from(svgEl.querySelectorAll('g.node'))
      for (const t of selfTypes) {
        const label = sanitizeLabel(t.name)
        const node = nodeGroups.find((g) => (g.textContent ?? '').trim() === label)
        if (node === undefined) {
          console.warn(
            'Self-ref marker: node not found:',
            label,
            nodeGroups.map((g) => g.getAttribute('id'))
          )
          continue
        }
        const bbox = (node as SVGGraphicsElement).getBBox()
        const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle')
        circle.setAttribute('cx', String(bbox.x + bbox.width))
        circle.setAttribute('cy', String(bbox.y + bbox.height / 2))
        circle.setAttribute('r', '5')
        const dotColor = isDark ? '#ffffff' : '#000000'
        circle.style.fill = dotColor
        circle.style.stroke = dotColor
        node.appendChild(circle)
      }
      return svgEl.outerHTML
    } catch (e) {
      console.error('addSelfRefMarkers failed:', e)
      return svg
    } finally {
      document.body.removeChild(holder)
    }
  }

  function getMermaidThemeVariables (isDark: boolean): Record<string, string> {
    const fontFamily = 'Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
    return isDark
      ? {
          fontFamily,
          fontSize: '10px',
          primaryColor: '#1e293b',
          primaryTextColor: '#f8fafc',
          primaryBorderColor: '#475569',
          lineColor: '#94a3b8',
          secondaryColor: '#0f172a',
          tertiaryColor: '#1e293b',
          edgeLabelBackground: '#1e293b',
          nodeBorder: '#475569',
          clusterBkg: '#0f172a'
        }
      : {
          fontFamily,
          fontSize: '10px',
          primaryColor: '#f1f5f9',
          primaryTextColor: '#0f172a',
          primaryBorderColor: '#64748b',
          lineColor: '#334155',
          secondaryColor: '#f8fafc',
          tertiaryColor: '#e2e8f0',
          edgeLabelBackground: '#ffffff',
          nodeBorder: '#64748b',
          clusterBkg: '#f8fafc'
        }
  }

  function svgToPng (blobUrl: string, rawSvg: string): Promise<string> {
    return new Promise((resolve) => {
      const img = new Image()
      img.onload = () => {
        try {
          const parser = new DOMParser()
          const doc = parser.parseFromString(rawSvg, 'image/svg+xml')
          const svgEl = doc.querySelector('svg')
          let width = img.width || 800
          let height = img.height || 600
          if (svgEl !== null) {
            const viewBox = svgEl.getAttribute('viewBox')
            if (viewBox !== null) {
              const parts = viewBox.split(/[\s,]+/).map(Number)
              if (parts.length === 4 && parts[2] > 0 && parts[3] > 0) {
                width = parts[2]
                height = parts[3]
              }
            }
          }
          const scale = 2
          const canvas = document.createElement('canvas')
          canvas.width = Math.ceil(width * scale)
          canvas.height = Math.ceil(height * scale)
          const ctx = canvas.getContext('2d')
          if (ctx === null) {
            resolve(blobUrl)
            return
          }
          ctx.scale(scale, scale)
          ctx.drawImage(img, 0, 0, width, height)
          resolve(canvas.toDataURL('image/png'))
        } catch {
          resolve(blobUrl)
        }
      }
      img.onerror = () => {
        resolve(blobUrl)
      }
      img.src = blobUrl
    })
  }

  function revokeObjectUrl (): void {
    if (currentObjectUrl !== undefined) {
      URL.revokeObjectURL(currentObjectUrl)
      currentObjectUrl = undefined
    }
  }

  async function renderDiagram (): Promise<void> {
    const seq = ++renderSequence
    loading = true
    errorMsg = undefined

    if (taskTypes.length === 0) {
      loading = false
      imageUrl = undefined
      return
    }

    try {
      const isDark = $themeStore.dark
      const code = generateMermaidCode(taskTypes)

      const mermaid = (await import('mermaid')).default
      if (seq !== renderSequence) return

      const themeVariables = getMermaidThemeVariables(isDark)
      mermaid.initialize({
        startOnLoad: false,
        securityLevel: 'antiscript',
        suppressErrorRendering: true,
        theme: 'base',
        fontFamily: themeVariables.fontFamily,
        fontSize: 13,
        themeVariables
      })

      const elementId = `mermaid-tt-${Math.random().toString(36).substring(2, 9)}`
      const renderResult = await mermaid.render(elementId, code)
      if (seq !== renderSequence) return

      const processedSvg = addSelfRefMarkers(renderResult.svg, isDark)
      const svgBlob = new Blob([processedSvg], { type: 'image/svg+xml;charset=utf-8' })
      const blobUrl = URL.createObjectURL(svgBlob)
      let finalUrl = blobUrl
      try {
        finalUrl = await svgToPng(blobUrl, processedSvg)
      } catch {}

      if (seq !== renderSequence) {
        URL.revokeObjectURL(blobUrl)
        return
      }
      revokeObjectUrl()
      if (finalUrl === blobUrl) {
        currentObjectUrl = blobUrl
      } else {
        URL.revokeObjectURL(blobUrl)
      }
      imageUrl = finalUrl
    } catch (e: any) {
      if (seq === renderSequence) {
        console.error('Failed to render task types diagram:', e)
        errorMsg = e?.message ?? 'Failed to render diagram'
      }
    } finally {
      if (seq === renderSequence) {
        loading = false
      }
    }
  }

  $: {
    const _lang = $languageStore
    const _theme = $themeStore
    if (taskTypes !== undefined && _lang !== undefined && _theme !== undefined) {
      void renderDiagram()
    }
  }

  onDestroy(() => {
    revokeObjectUrl()
  })
</script>

<div class="mermaid-wrapper">
  {#if hasSelfRefs}
    <div class="diagram-legend">
      <span class="legend-dot">●</span>
      <Label label={plugin.string.SelfRefLegend} />
    </div>
  {/if}
  <div class="mermaid-center">
    {#if loading}
      <Loading />
    {:else if errorMsg}
      <div class="diagram-error-state">
        <div class="diagram-error-icon">
          <IconError size="large" />
        </div>
        <div class="diagram-error-details">
          <code>{errorMsg}</code>
        </div>
      </div>
    {:else if imageUrl}
      <img src={imageUrl} alt="Task Types Diagram" class="mermaid-image" />
    {/if}
  </div>
</div>

<style lang="scss">
  .mermaid-wrapper {
    position: relative;
    width: 100%;
    height: 100%;
    padding: 0.75rem;
    overflow: hidden;
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
  }

  .mermaid-center {
    flex: 1;
    width: 100%;
    height: 100%;
    min-height: 0;
    display: flex;
    justify-content: center;
    align-items: center;
    overflow: hidden;
  }

  .mermaid-image {
    max-width: 100%;
    max-height: 100%;
    width: 100%;
    height: 100%;
    object-fit: contain;
    display: block;
  }

  .diagram-error-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 1.5rem;
    text-align: center;

    .diagram-error-icon {
      color: var(--negative-button-default, #f44336);
      margin-bottom: 0.5rem;
    }

    .diagram-error-details {
      margin-top: 0.75rem;
      width: 100%;
      max-height: 10rem;
      overflow-y: auto;
      background: var(--theme-surface-tertiary, rgba(0, 0, 0, 0.2));
      border: 1px solid var(--theme-border-color, rgba(0, 0, 0, 0.08));
      border-radius: 0.375rem;
      padding: 0.5rem 0.75rem;
      text-align: left;

      code {
        font-family: var(--font-family-mono, monospace);
        font-size: 0.75rem;
        color: var(--negative-button-default, #f44336);
        white-space: pre-wrap;
        word-break: break-word;
      }
    }
  }

  .diagram-legend {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0 0 0.75rem 0.25rem;
    font-size: 0.875rem;
    color: var(--theme-text-secondary, #64748b);

    :global(span) {
      font-size: 0.875rem;
    }

    .legend-dot {
      font-size: 1rem;
      line-height: 1;
      color: var(--theme-text-primary, #0f172a);
    }
  }
</style>
