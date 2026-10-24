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
  // Stand-in for a person avatar from contact-resources.
  export let initials: string
  export let color: string = '#7b61ff'
</script>

<span class="avatar" style:background-color={color}>{initials}</span>

<style lang="scss">
  .avatar {
    display: inline-flex;
    flex-shrink: 0;
    justify-content: center;
    align-items: center;
    width: 1.25rem;
    height: 1.25rem;
    border-radius: 50%;
    font-size: 0.5625rem;
    font-weight: 600;
    color: #fff;
  }
</style>
