<script lang="ts">
  import { Root } from "glow";

  let { children } = $props();
</script>

<div class="app">
  <Root>
    <main>
      {@render children()}
    </main>
  </Root>
</div>

<style>
  .app {
    display: flex;
    flex-direction: column;
    min-height: 100vh;
  }

  main {
    flex: 1;
    min-height: 0;
  }
</style>
