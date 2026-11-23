import { modalFocusState } from '../composables/useModalFocus.js'

export async function copyText(text) {
  try {
    if (typeof navigator.clipboard?.writeText === 'function') {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    // The browser may deny Clipboard API access even when it is available.
  }

  const focused = document.activeElement
  const parent = focused?.closest('dialog[open]') || modalFocusState.panel || document.body
  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.readOnly = true
  textarea.tabIndex = -1
  Object.assign(textarea.style, { position: 'fixed', top: '0', left: '0', opacity: '0', fontSize: '16px', pointerEvents: 'none' })
  try {
    parent.appendChild(textarea)
    textarea.focus({ preventScroll: true })
    textarea.select()
    if (!document.execCommand('copy')) throw new Error('Clipboard unavailable')
    return true
  } finally {
    textarea.remove()
    focused?.focus({ preventScroll: true })
  }
}
