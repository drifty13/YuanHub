<template>
  <div class="document-code">
    <div class="document-code-toolbar">
      <span>{{ language || '代码' }}</span>
      <button type="button" @click="copy" :aria-label="'复制' + (language || '') + '代码'">
        <Copy :size="14" aria-hidden="true" />复制
      </button>
    </div>
    <pre tabindex="0" :aria-label="(language || '代码') + '代码块'"><code>{{ text }}</code></pre>
    <p v-if="feedback" class="document-copy-status" role="status">{{ feedback }}</p>
  </div>
</template>

<script setup>
import { copyText } from '../../utils/copyText.js'
import { ref } from 'vue'
import { Copy } from '@lucide/vue'
const props = defineProps({ text: { type: String, required: true }, language: { type: String, default: '' } })
const feedback = ref('')
async function copy() {
  try {
    await copyText(props.text)
    feedback.value = '已复制代码。'
  } catch {
    feedback.value = '复制失败，请选中代码手动复制。'
  }
}
</script>
