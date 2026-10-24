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
  export let size: string = 'small'
  export let initials: string = 'AK'
  export let fill: string = 'currentColor'
</script>

<!-- Stands in for a person avatar: round, wider than an icon, own background. -->
<span class="story-avatar story-avatar--{size}" data-fill={fill}>{initials}</span>

<style lang="scss">
  .story-avatar {
    display: inline-flex;
    justify-content: center;
    align-items: center;
    width: 1.5rem;
    height: 1.5rem;
    font-size: 0.625rem;
    font-weight: 600;
    color: var(--global-on-accent-TextColor);
    background-color: var(--kit-button-primary-BackgroundColor);
    border-radius: 50%;
  }
</style>
