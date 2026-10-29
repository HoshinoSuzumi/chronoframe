<template>
  <UPopover
    ><slot /><template #content
      ><UCard
        variant="glassmorphism"
        class="max-w-[calc(100vw-1rem)]"
        ><OverlayFilterPanel /></UCard></template
  ></UPopover>
</template>
