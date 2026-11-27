<!--
// Copyright © 2024 Hardcore Engineering Inc.
// Copyright © 2026 Intabia Fusion.
//
-->

<script lang="ts">
  import type { Blob, Doc, Ref } from '@hcengineering/core'
  import { PDFViewer, getClient } from '@hcengineering/presentation'
  import { printAll } from '../printUtils'

  export let object: Doc
  export let signed: boolean = false

  const client = getClient()
  let isLoading = true
  let file: Ref<Blob> | undefined
  let title = ''
  let request = 0

  async function load (doc: Doc, sign: boolean): Promise<void> {
    const current = ++request
    file = undefined
    isLoading = true
    const [result] = await printAll(client, [doc], sign, {
      onProgress: () => {},
      getCancelled: () => current !== request
    })
    if (current !== request) return
    title = result?.title ?? ''
    file = result?.error === undefined && result?.blobId ? result.blobId as Ref<Blob> : undefined
    isLoading = false
  }

  $: void load(object, signed)
</script>

<PDFViewer {file} name={title} contentType="application/pdf" showIcon={false} {isLoading} on:close on:fullsize />
