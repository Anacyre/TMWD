import { reactive } from 'vue'

/** Survives leaving the piano roll, so a copy can land in another pattern. */
export const rollClipboard = reactive({
  notes: null,
  lane: null
})
