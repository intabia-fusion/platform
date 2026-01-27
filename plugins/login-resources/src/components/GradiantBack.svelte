<script lang="ts">
  import { onMount } from 'svelte'
  import BallTop from './icons/BallTop.svelte'
  import BallLeft from './icons/BallLeft.svelte'
  import BallRight from './icons/BallRight.svelte'
  import BallBig from './icons/BallBig.svelte'
  import IBanner from './icons/IBanner.svelte'

  const REF_W = 1920
  const REF_H = 1036

  const REF_ELLIPSE = {
    width: 3055.1826171875,
    height: 386,
    left: -552.07,
    top: 726.35
  }

  let vw = REF_W
  let vh = REF_H

  let ellipseW = REF_ELLIPSE.width
  let ellipseH = REF_ELLIPSE.height
  let ellipseLeft = REF_ELLIPSE.left
  let ellipseTop = REF_ELLIPSE.top

  function update (): void {
    if (typeof window === 'undefined') return
    vw = window.innerWidth
    vh = window.innerHeight

    const scaleX = vw / REF_W
    const scaleY = vh / REF_H

    ellipseW = REF_ELLIPSE.width * scaleX
    ellipseH = REF_ELLIPSE.height * scaleY
    ellipseLeft = REF_ELLIPSE.left * scaleX
    ellipseTop = REF_ELLIPSE.top * scaleY
  }

  onMount(() => {
    update()
    window.addEventListener('resize', update)
    return () => {
      window.removeEventListener('resize', update)
    }
  })
  $: ellipseStyle = `width: ${ellipseW.toFixed(2)}px; height: ${ellipseH.toFixed(2)}px; left: ${ellipseLeft.toFixed(2)}px; top: ${ellipseTop.toFixed(2)}px;`
</script>

<div class="background" aria-hidden="true">
  <div class="oval" style={ellipseStyle}></div>

  <div style:position="fixed" style:right={'0px'} style:bottom={'200px'} style:z-index={500}>
    <BallBig />
  </div>

  <div style:position="fixed" style:right={'250px'} style:bottom={'200px'} style:z-index={500}>
    <IBanner />
  </div>

  <div style:position="fixed" style:left={'218px'} style:bottom={'200px'} style:z-index={500}>
    <BallLeft />
  </div>
  <div style:position="fixed" style:left={'218px'} style:top={'0px'}>
    <BallTop />
  </div>
  <div style:position="fixed" style:right={'25%'} style:top={'15%'} style:z-index={400}>
    <BallRight />
  </div>
</div>

<style>
  .background {
    position: relative;
    width: 100vw;
    height: 100vh;
    min-height: 100vh;
    overflow: hidden;
    background: var(
      --login-background-gradient,
      linear-gradient(180deg, #0b0123 0%, #170134 33%, #250932 66%, #100118 100%)
    );
  }

  .oval {
    position: absolute;
    background: #f5f4f5;
    border-radius: 50%;
    pointer-events: none;
    z-index: 2;
    transform-origin: top left;
    will-change: width, height, top, left;
  }

  @media (prefers-reduced-motion: reduce) {
    .oval {
      transition: none;
    }
  }
</style>
