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
  import { TextArea, type TextAreaProps } from '@hcengineering/ui/kit'

  // The field takes the width of its place; a table cell of the matrix has none of its own.
  $: props = $$restProps as TextAreaProps
</script>

<div class="text-area-box"><TextArea {...props} /></div>

<style lang="scss">
  .text-area-box {
    width: 16rem;
  }
</style>
