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
//
// See the License for the specific language governing permissions and
// limitations under the License.
-->
<script lang="ts">
  import { ProgressBar, type ProgressBarProps } from '@hcengineering/ui/kit'

  export let props: Record<string, any> = {}
  export let width: string = '16rem'

  $: merged = { ...props, ...$$restProps }
  // Controls hand any subset of the props: the stories carry the label the union requires.
  $: barProps = merged as ProgressBarProps
</script>

<!-- ProgressBar takes the width of its place; the wrapper stands for it. -->
<div style:width>
  <ProgressBar {...barProps} />
</div>
