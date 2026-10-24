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
  // Login page of login-resources: dark page with the light oval and balls, logo, copyright and the card in the middle.
  // The art is the product's own (GradiantBack.svelte), placed from the frame edges as the product places it from the window.
  import BallBig from '../../../../../../plugins/login-resources/src/components/icons/BallBig.svelte'
  import BallLeft from '../../../../../../plugins/login-resources/src/components/icons/BallLeft.svelte'
  import BallRight from '../../../../../../plugins/login-resources/src/components/icons/BallRight.svelte'
  import BallTop from '../../../../../../plugins/login-resources/src/components/icons/BallTop.svelte'
  import IBanner from '../../../../../../plugins/login-resources/src/components/icons/IBanner.svelte'
  import IntabiaIcon from '../../../../../../plugins/login-resources/src/components/icons/IntabiaIcon.svelte'
  import TopBar from '../Workbench/TopBar.svelte'

  // [year, owner]
  export let copyright: [string, string] = ['© 2026,', 'Intabia Fusion']
  export let width: number = 1920
  export let height: number = 1080

  // The reference window of GradiantBack.svelte is 1920x1036
  $: oval = {
    w: 3055.18 * (width / 1920),
    h: 386 * (height / 1036),
    left: -552.07 * (width / 1920),
    top: 726.35 * (height / 1036)
  }
</script>

<div class="login-page">
  <div class="background" aria-hidden="true">
    <div
      class="oval"
      style:width="{oval.w}px"
      style:height="{oval.h}px"
      style:left="{oval.left}px"
      style:top="{oval.top}px"
    />
  </div>
  <div class="ball" style="right: 25%; top: 15%; z-index: 400"><BallRight /></div>
  <div class="ball" style="left: 218px; top: 0"><BallTop /></div>
  <div class="ball" style="right: 0; bottom: 200px; z-index: 500"><BallBig /></div>
  <div class="ball" style="right: 250px; bottom: 200px; z-index: 500"><IBanner /></div>
  <div class="ball" style="left: 218px; bottom: 200px; z-index: 500"><BallLeft /></div>
  <div class="logo"><IntabiaIcon /></div>
  <div class="card-slot"><slot /></div>
  <div class="footer"><span class="year">{copyright[0]}</span><span class="owner">{copyright[1]}</span></div>
  <div class="status-bar"><TopBar /></div>
</div>

<style lang="scss">
  .login-page {
    position: relative;
    width: 100%;
    height: 100%;
    overflow: hidden;
    background-color: #f1f1f4;
  }
  .background {
    position: absolute;
    top: 32px;
    left: 0;
    width: 100%;
    height: 100%;
    overflow: hidden;
    background: linear-gradient(180deg, #0b0123 0%, #170134 33%, #250932 66%, #100118 100%);
  }
  .oval {
    position: absolute;
    z-index: 2;
    background: #f5f4f5;
    border-radius: 50%;
  }
  .ball {
    position: absolute;
    display: flex;
  }
  .logo {
    position: absolute;
    top: 48px;
    left: 28px;
    z-index: 5;
    padding: 0 16px;
  }
  .card-slot {
    position: absolute;
    inset: 0;
    z-index: 1000;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .footer {
    position: absolute;
    left: 28px;
    bottom: 16px;
    z-index: 5;
    display: flex;
    gap: 4px;
    font-size: 14px;
  }
  .year {
    color: var(--content-color);
  }
  .owner {
    color: #333333;
  }
  .status-bar {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    z-index: 2000;
  }
</style>
