/** Reactive viewport size, shared by every component that needs a layout
    decision in script rather than in a media query. One listener for the whole
    app instead of one per component. */

import { ref, computed } from 'vue'

export const PHONE_MAX = 720
export const NARROW_MAX = 430
export const TINY_MAX = 360

const initial = typeof window === 'undefined' ? 1280 : (window.innerWidth || 1280)
const initialHeight = typeof window === 'undefined' ? 800 : (window.innerHeight || 800)

export const viewportWidth = ref(initial)
export const viewportHeight = ref(initialHeight)

if (typeof window !== 'undefined') {
  const update = () => {
    viewportWidth.value = window.innerWidth || viewportWidth.value
    viewportHeight.value = window.innerHeight || viewportHeight.value
  }
  window.addEventListener('resize', update, { passive: true })
  window.addEventListener('orientationchange', update)
}

/** Phone-class width: plugins switch to a single-column stage here. */
export const isPhone = computed(() => viewportWidth.value <= PHONE_MAX)
export const isNarrow = computed(() => viewportWidth.value <= NARROW_MAX)
export const isTiny = computed(() => viewportWidth.value <= TINY_MAX)
