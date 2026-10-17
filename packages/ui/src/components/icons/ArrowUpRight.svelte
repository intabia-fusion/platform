<script lang="ts">
  export let size: 'small' | 'medium' | 'large'
  const fill: string = 'currentColor'
</script>

<svg class="svg-{size}" {fill} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16">
  <path
    d="M5.5 4h6a.5.5 0 0 1 .5.5v6a.5.5 0 0 1-1 0V5.707l-6.146 6.147a.5.5 0 0 1-.708-.708L10.293 5H5.5a.5.5 0 0 1 0-1Z"
  />
</svg>
