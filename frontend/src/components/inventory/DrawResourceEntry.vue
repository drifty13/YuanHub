<template>
  <component :is="embedded ? 'div' : 'details'" class="draw-resource-entry" :class="{ 'is-embedded': embedded }" @toggle="onToggle">
    <summary v-if="!embedded">符传快捷记账 <span>获得、使用与白金币兑换</span></summary>
    <div v-if="!embedded" class="draw-content draw-status">
      <p>请记录尚未入账的实际变动。修改当前余额请用「更新数量」。</p>
      <p v-if="loading" role="status">正在读取抽卡资源库存…</p>
      <p v-if="error" role="alert">{{ error }}</p>
      <p v-if="notice" class="action-feedback" role="status">{{ notice }}</p>
      <button v-if="!context && !loading || conflict" type="button" class="btn ghost" :disabled="locked || disabled" @click="load">重新读取库存</button>
    </div>
    <form v-if="embedded || context" :class="{ 'ledger-layout': embedded }" @submit.prevent="submit">
      <div class="draw-content" :class="{ 'ledger-input': embedded }">
        <p v-if="embedded" class="draw-entry-note">只记尚未入账的实际变动；要改当前余额，请用「更新数量」。</p>
        <fieldset v-if="context" :disabled="disabled || locked || conflict">
          <div class="draw-fields">
            <label v-if="!embedded">操作<select v-model="action"><option value="gain">获得奖励</option><option value="use">使用资源</option><option value="exchange">白金币兑换</option></select></label>
            <label>{{ action === 'exchange' ? '兑换项目' : action === 'use' ? '资源类型' : '符传类型' }}<select v-model="fields.ticketId"><option v-for="ticket in DRAW_TICKETS" :key="ticket.id" :value="ticket.id">{{ ticket.name }}</option><option v-if="action === 'use'" value="baijinbi">白金币</option><option v-if="action === 'exchange'" value="zhuyu">茱萸兑换白金币</option></select></label>
            <component :is="embedded ? 'div' : 'label'" class="draw-quantity-field">
              <label v-if="embedded" :for="quantityId">数量（{{ quantityUnit }}）</label>
              <template v-else>数量（{{ quantityUnit }}）</template>
              <span class="draw-quantity">
                <button type="button" :aria-label="`减少${resourceName}数量`" :disabled="Number(fields.quantity) <= step" @click="adjust(-1)"><Minus :size="14" aria-hidden="true" /></button>
                <input :id="embedded ? quantityId : undefined" v-model="fields.quantity" type="text" inputmode="numeric" :aria-label="`${resourceName}数量`" required />
                <button type="button" :aria-label="`增加${resourceName}数量`" @click="adjust(1)"><Plus :size="14" aria-hidden="true" /></button>
              </span>
            </component>
          </div>
          <div v-if="coinUse" class="draw-fields draw-use-purpose">
            <fieldset v-if="embedded" class="coin-purpose">
              <legend>用途</legend>
              <div class="exchange-options purpose-options">
                <label v-for="purpose in [{ id: '兑换体力', label: '兑换体力' }, { id: '商店购买', label: '商店购买' }, { id: 'other', label: '其他' }]" :key="purpose.id">
                  <input v-model="fields.coinPurpose" type="radio" name="coin-purpose" :value="purpose.id" />
                  <b>{{ purpose.label }}</b><small v-if="purpose.id === 'other'">自行填写</small><span class="option-check" aria-hidden="true"><Check :size="11" /></span>
                </label>
              </div>
            </fieldset>
            <label v-else>用途<select v-model="fields.coinPurpose"><option value="兑换体力">兑换体力</option><option value="商店购买">商店购买</option><option value="other">其他（自行填写）</option></select></label>
            <div v-if="fields.coinPurpose === 'other'" class="custom-purpose">
              <label>自定义用途<input v-model="fields.customPurpose" type="text" maxlength="64" placeholder="例如：购买材料" :aria-invalid="showPurposeError || undefined" :aria-describedby="showPurposeError ? purposeErrorId : undefined" required @blur="fields.purposeTouched = true" @invalid="fields.purposeTouched = true" @keydown.enter="fields.purposeTouched = true" /></label>
              <p v-if="showPurposeError" :id="purposeErrorId" class="draw-error" role="alert">{{ purposeError }}</p>
            </div>
          </div>
          <label v-if="!embedded && action === 'exchange' && fields.ticketId !== 'zhuyu'">兑换渠道<select v-model="fields.exchangeChannel"><option value="standard">常规 · 200 白金币/张</option><option v-if="fields.ticketId === 'fuchuan'" value="monthly-shop">月卡商店 · 1600 白金币/10 张</option></select></label>
          <fieldset v-else-if="action === 'exchange' && fields.ticketId === 'fuchuan'" class="exchange-channel">
            <legend>兑换渠道</legend>
            <div class="exchange-options">
              <label><input v-model="fields.exchangeChannel" type="radio" name="exchange-channel" value="standard" /><b>常规</b><small>200 白金币 / 张</small><span class="option-check" aria-hidden="true"><Check :size="11" /></span></label>
              <label><input v-model="fields.exchangeChannel" type="radio" name="exchange-channel" value="monthly-shop" /><b>月卡商店</b><small>1600 白金币 / 10 张</small><span class="option-check" aria-hidden="true"><Check :size="11" /></span></label>
            </div>
          </fieldset>
          <p v-else-if="action === 'exchange'">{{ fields.ticketId === 'zhuyu' ? '每个茱萸兑换 50 白金币，仅记录已实际领取的白金币。' : '兑换渠道：常规 · 200 白金币/张' }}</p>
          <label v-if="action === 'gain'">奖励来源<input v-model="fields.source" type="text" maxlength="64" placeholder="例如：活动奖励、邮件奖励" required /></label>
          <p v-if="coinUse" class="draw-help">兑换符传请在「兑换」中记录，避免重复扣减。</p>
          <p v-if="action === 'exchange' && fields.exchangeChannel === 'monthly-shop'" class="draw-help">每份 10 张普通符传。请按实际购买数量记录，购买资格和剩余限购次数以游戏内为准。</p>
        </fieldset>
      </div>
      <component :is="embedded ? 'aside' : 'div'" :class="embedded ? 'ledger-slip' : 'draw-content'" :aria-label="embedded ? '本次变动账单' : undefined">
        <section :class="embedded ? 'ledger-slip-body' : 'draw-summary'" :aria-label="embedded ? '余额变化明细' : undefined" :aria-live="embedded ? undefined : 'polite'">
          <h4 :class="{ 'ledger-title': embedded }">{{ embedded ? '本次变动' : '本次库存变化' }}</h4>
          <div ref="ledgerDetail" :class="embedded ? 'ledger-rule draw-ledger-detail' : undefined" :aria-live="embedded ? 'polite' : undefined">
            <template v-if="embedded">
              <p v-if="loading" role="status">正在读取抽卡资源库存…</p>
              <p v-if="error" class="draw-error" role="alert">{{ error }}</p>
              <p v-if="notice" class="action-feedback" role="status">{{ notice }}</p>
              <button v-if="!context && !loading || conflict" type="button" class="btn ghost" :disabled="locked || disabled" @click="load">重新读取库存</button>
            </template>
            <template v-if="context">
              <p v-if="preview.error && preview.error !== purposeError" class="draw-error"><CircleAlert :size="16" aria-hidden="true" />{{ preview.error }}</p>
              <p v-else-if="!embedded && preview.error" class="draw-help">填写用途后可查看库存变化。</p>
              <ul v-else-if="!preview.error" class="draw-preview">
                <li v-for="row in preview.rows" :key="row.id">
                  <template v-if="embedded">
                    <img :src="resourceIcon(row.id)" alt="" width="28" height="28" />
                    <strong class="draw-row-heading"><span>{{ row.name }}</span> <span class="draw-delta" :class="{ 'is-increase': row.count > 0 }">{{ row.count > 0 ? '+' : '−' }}{{ Math.abs(row.count).toLocaleString() }}</span></strong>
                    <span class="draw-flow">{{ row.before.toLocaleString() }} → {{ row.after.toLocaleString() }}</span>
                  </template>
                  <template v-else><strong>{{ row.name }} <span>{{ row.count > 0 ? '+' : '−' }}{{ Math.abs(row.count).toLocaleString() }}</span></strong><span>{{ row.before.toLocaleString() }} → {{ row.after.toLocaleString() }}</span></template>
                </li>
              </ul>
            </template>
            <p v-if="embedded && pending && !saving" role="status">结果尚未确认，草稿已锁定；请原样重试，确认前不要在其他入口重复记录。</p>
          </div>
        </section>
        <p v-if="!embedded && pending && !saving">结果尚未确认，草稿已锁定；请原样重试，确认前不要在其他入口重复记录。</p>
        <div v-if="embedded" class="ledger-footer">
          <button type="submit" class="ledger-primary" :disabled="saveDisabled" :aria-describedby="saveHint ? saveHintId : undefined">{{ saving ? '正在记账…' : pending ? '原样重试' : '核对并记账' }}</button>
          <p v-if="saveHint" :id="saveHintId" class="ledger-hint">{{ saveHint }}</p>
        </div>
      </component>
      <div v-if="!embedded">
        <button type="submit" class="btn primary" :disabled="saveDisabled">{{ saving ? '正在记账…' : pending ? '原样重试' : '确认记账' }}</button>
      </div>
    </form>
  </component>
</template>

<script setup>
import { computed, inject, onBeforeUnmount, reactive, ref, useId, watch } from 'vue'
import { matchedRouteKey, onBeforeRouteLeave } from 'vue-router'
import { Check, CircleAlert, Minus, Plus } from '@lucide/vue'
import { getDrawResources, recordDrawResources } from '../../api/drawResources.js'
import { DRAW_TICKETS, drawResourcePreview, resourceEntrySummary } from '../../data/inventory/drawResources.js'
import { dialog } from '../../utils/dialog.js'

const props = defineProps({ accountId: { type: String, required: true }, userId: { type: String, required: true }, game: { type: String, required: true }, disabled: Boolean, embedded: Boolean, operation: { type: String, default: 'use' } })
const emit = defineEmits(['busy', 'recorded'])
const context = ref(null), loading = ref(false), saving = ref(false), confirming = ref(false), pending = ref(null), conflict = ref(false)
const action = ref('gain')
const freshFields = () => ({ ticketId: 'fuchuan', quantity: '1', source: '', exchangeChannel: 'standard', coinPurpose: '兑换体力', customPurpose: '', purposeTouched: false })
const forms = reactive({ gain: freshFields(), use: freshFields(), exchange: freshFields() })
const fields = computed(() => forms[action.value])
const purposeErrorId = useId()
const quantityId = useId()
const saveHintId = useId()
const ledgerDetail = ref(null)
const draftBaselines = {}
const error = ref(''), notice = ref('')
let sequence = 0, opened = props.embedded
const locked = computed(() => saving.value || confirming.value || !!pending.value)
const coinUse = computed(() => action.value === 'use' && fields.value.ticketId === 'baijinbi')
const quantityUnit = computed(() => coinUse.value || fields.value.ticketId === 'zhuyu' ? '个' : '张')
const resourceName = computed(() => {
  const { ticketId } = fields.value
  return ticketId === 'baijinbi' ? '白金币' : ticketId === 'zhuyu' ? '茱萸' : DRAW_TICKETS.find(ticket => ticket.id === ticketId).name
})
const step = computed(() => action.value === 'exchange' && fields.value.exchangeChannel === 'monthly-shop' ? 10 : 1)
function draftFor(operation) {
  const { ticketId, quantity, coinPurpose, customPurpose, exchangeChannel, source } = forms[operation]
  let channel = source.trim()
  if (operation === 'use') channel = ticketId !== 'baijinbi' ? 'use' : coinPurpose === 'other' ? customPurpose.trim() : coinPurpose
  if (operation === 'exchange') channel = exchangeChannel
  return { action: operation, ticketId, quantity, channel }
}
const draft = computed(() => draftFor(action.value))
const purposeError = computed(() => coinUse.value && fields.value.coinPurpose === 'other' &&
  (!draft.value.channel || draft.value.channel.length > 64) ? '请填写 1–64 字的白金币用途' : '')
const showPurposeError = computed(() => fields.value.purposeTouched && !!purposeError.value)
const preview = computed(() => {
  try { return { rows: drawResourcePreview(draft.value, context.value?.balances), error: '' } }
  catch (err) { return { rows: [], error: err.message } }
})
const saveDisabled = computed(() => !context.value || saving.value || confirming.value || props.disabled || conflict.value || !pending.value && !!preview.value.error)
const saveHint = computed(() => {
  if (!saveDisabled.value || saving.value || confirming.value || loading.value || error.value) return ''
  if (props.disabled) return '选择可用账号后可记账'
  if (!context.value || conflict.value || showPurposeError.value) return ''
  return preview.value.error === purposeError.value ? '填写用途后可记账' : ''
})
const resourceIcon = id => `${import.meta.env.BASE_URL}inventory-icons/items/${id}.webp`
watch([error, notice], ([message, receipt]) => {
  if (props.embedded && props.operation === action.value && (message || receipt)) ledgerDetail.value?.scrollIntoView?.({ block: 'nearest' })
}, { flush: 'post' })
watch(locked, value => emit('busy', value), { flush: 'sync' })
watch([() => forms.exchange.ticketId, () => forms.exchange.exchangeChannel], ([ticketId, exchangeChannel]) => {
  if (ticketId !== 'fuchuan') forms.exchange.exchangeChannel = 'standard'
  else if (exchangeChannel === 'monthly-shop' && (Number(forms.exchange.quantity) < 10 || Number(forms.exchange.quantity) % 10 !== 0)) forms.exchange.quantity = '10'
})
function adjust(direction) {
  const value = Number(fields.value.quantity)
  if (Number.isInteger(value)) fields.value.quantity = String(Math.min(2147483647, Math.max(step.value, value + direction * step.value)))
}
async function load() {
  if (locked.value || !props.accountId || !props.userId || props.disabled) return
  const seq = ++sequence, account = props.accountId, user = props.userId, game = props.game
  context.value = null; loading.value = true; error.value = ''; conflict.value = false
  try {
    const data = await getDrawResources(account, user)
    if (seq !== sequence) return
    if (data.account_id !== account || data.game !== game || !Number.isSafeInteger(data.inventory_revision) || data.inventory_revision < 0) throw new Error('库存上下文不匹配，请重新读取')
    context.value = data
  } catch (err) { if (seq === sequence) error.value = err.message || '库存读取失败' }
  finally { if (seq === sequence) loading.value = false }
}
function onToggle(event) { opened = event.currentTarget.open; if (opened && !context.value && !loading.value) load() }
async function submit() {
  if (purposeError.value) fields.value.purposeTouched = true
  if (props.disabled || saving.value || confirming.value || conflict.value || !context.value || (!pending.value && preview.value.error)) return
  const seq = sequence, account = props.accountId, user = props.userId
  if (!pending.value) {
    const body = {
      account_id: account, game: props.game, operation_id: crypto.randomUUID(), expected_inventory_revision: context.value.inventory_revision,
      action: action.value, ticket_id: draft.value.ticketId, quantity: Number(draft.value.quantity), channel: draft.value.channel
    }
    const rows = preview.value.rows
    confirming.value = true
    let confirmed
    try {
      confirmed = await dialog.confirm({ title: '确认本次资源记账？', message: rows.map(row => `${row.name} ${row.count > 0 ? '+' : '−'}${Math.abs(row.count)}，余额 ${row.after}`).join('；'), confirmText: '确认记账', cancelText: '返回修改' })
    } finally { if (seq === sequence) confirming.value = false }
    if (!confirmed || seq !== sequence || props.disabled) return
    pending.value = body
  }
  saving.value = true; error.value = ''; notice.value = ''
  try {
    const result = await recordDrawResources(pending.value, user)
    if (seq !== sequence) return
    if (result?.account_id !== account || result?.record_id !== `yuanhub:draw:${pending.value.operation_id}`) throw new Error('返回结果无法确认')
    notice.value = '已记录：' + resourceEntrySummary(result.entries, result.record_type)
    pending.value = null
    draftBaselines[action.value] = JSON.stringify(draft.value)
    context.value = null
    emit('recorded', account)
  } catch (err) {
    if (seq !== sequence) return
    error.value = err.message || '记账结果无法确认'
    if ([400, 404, 409, 422].includes(err.status)) { pending.value = null; conflict.value = true }
  } finally { if (seq === sequence) saving.value = false }
  if (seq === sequence && !pending.value && !conflict.value) await load()
}
async function confirmDiscard() {
  if (locked.value) return false
  if (Object.keys(forms).every(operation => JSON.stringify(draftFor(operation)) === draftBaselines[operation])) return true
  const seq = sequence
  const confirmed = await dialog.confirm({ title: '放弃符传记账草稿？', message: '本次尚未提交的内容将清空。', confirmText: '放弃草稿', cancelText: '继续填写' })
  return confirmed && seq === sequence
}
watch(() => props.operation, value => {
  if (!props.embedded) return
  if (['use', 'exchange'].includes(value)) action.value = value
})
watch(() => [props.accountId, props.userId, props.game], () => {
  ++sequence; context.value = null; pending.value = null; loading.value = false; saving.value = false; confirming.value = false; conflict.value = false
  action.value = 'gain'; error.value = ''; notice.value = ''
  for (const operation of Object.keys(forms)) {
    forms[operation] = freshFields()
    draftBaselines[operation] = JSON.stringify(draftFor(operation))
  }
  if (props.embedded) action.value = ['use', 'exchange'].includes(props.operation) ? props.operation : 'use'
  if (opened) load()
}, { immediate: true, flush: 'sync' })
watch(() => props.disabled, value => { if (!value && opened && !context.value && !loading.value && !locked.value && !conflict.value) load() })
function beforeUnload(event) { if (locked.value) { event.preventDefault(); event.returnValue = '' } }
window.addEventListener('beforeunload', beforeUnload)
if (inject(matchedRouteKey, null)?.value) onBeforeRouteLeave(confirmDiscard)
onBeforeUnmount(() => { ++sequence; window.removeEventListener('beforeunload', beforeUnload); emit('busy', false) })
defineExpose({ confirmDiscard, locked })
</script>

<style scoped>
.draw-resource-entry { margin: 16px 0; padding: 12px 16px; border: 1px solid var(--line); border-radius: 12px; color: var(--ink); background: var(--surface); }
.draw-resource-entry.is-embedded { margin: 0; padding: 0; border: 0; background: transparent; }
.is-embedded .btn { transition: none; }
.draw-status { margin-top: 16px; }
summary { cursor: pointer; font-weight: 700; }
summary span { font-weight: 400; }
p { line-height: 1.6; overflow-wrap: anywhere; }
fieldset { min-width: 0; margin: 0; padding: 0; border: 0; }
.draw-fields { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
.draw-fields + :is(.draw-fields, label), .exchange-channel, .draw-help { margin-top: 12px; }
label, .custom-purpose { display: grid; align-content: start; gap: 6px; min-width: 0; }
input:not([type="radio"]), select { box-sizing: border-box; min-width: 0; width: 100%; min-height: 44px; padding: 8px; border: 1px solid var(--line); border-radius: 6px; background: var(--surface); color: var(--ink); font: inherit; }
.draw-quantity { display: flex; gap: 8px; }
.draw-quantity input { flex: 1; text-align: center; font-variant-numeric: tabular-nums; }
.draw-quantity button { flex: 0 0 44px; min-height: 44px; display: grid; place-items: center; padding: 0; border: 1px solid var(--line); border-radius: 6px; background: var(--surface); color: var(--ink); cursor: pointer; }
.exchange-channel legend { margin-bottom: 6px; padding: 0; }
.exchange-options { display: flex; flex-wrap: wrap; gap: 8px; }
.exchange-options label { display: inline-flex; align-items: center; gap: 8px; min-height: 44px; max-width: 100%; padding: 6px 10px; border: 1px solid var(--line); border-radius: 8px; background: var(--surface); cursor: pointer; transition: color .15s, background-color .15s; }
.exchange-options label:has(input:checked) { background: var(--cream); font-weight: 700; }
.exchange-options label:has(input:focus-visible) { outline: 2px solid var(--theme-focus, var(--tea)); outline-offset: 2px; }
.exchange-options label:has(input:disabled) { cursor: not-allowed; }
.exchange-options input { flex: none; margin: 0; accent-color: var(--theme-strong-text, var(--tea)); }
.draw-summary { margin: 16px 0; padding: 12px; border: 1px solid var(--line); border-radius: 8px; background: var(--cream); }
.draw-summary h4 { margin: 0 0 8px; font-size: 14px; }
.draw-preview { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 160px), 1fr)); gap: 8px 16px; margin: 0; padding: 0; list-style: none; }
.draw-preview li { display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 8px; font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
.draw-preview li > span, .draw-help { color: var(--ink-60); }
.draw-summary p, .custom-purpose p { margin: 0; }
.draw-error { color: var(--theme-danger-text, var(--rouge)); }
.draw-summary .draw-error { display: flex; align-items: baseline; gap: 8px; }
.draw-error svg { flex: none; align-self: center; }
[aria-invalid="true"] { border-color: var(--theme-danger-text, var(--rouge)); }
:is(input:not([type="radio"]), select, button, summary):focus-visible { outline: 2px solid var(--theme-focus, var(--tea)); outline-offset: 2px; }
button:disabled { opacity: .5; cursor: not-allowed; }
.is-embedded .ledger-input > :is(p, fieldset) { max-width: 520px; }
.is-embedded .draw-entry-note { margin: 0 0 16px; padding: 12px; border-radius: 10px; background: var(--cream); color: var(--ink-60); font-size: 13px; }
.is-embedded .draw-fields { grid-template-columns: minmax(0, 1fr) 180px; gap: 16px; }
.is-embedded .draw-use-purpose { grid-template-columns: minmax(0, 1fr); }
.is-embedded .draw-fields + :is(.draw-fields, p), .is-embedded .exchange-channel { margin-top: 16px; }
.is-embedded :is(label, legend) { font: 600 13px/1.5 var(--font-b); }
.is-embedded .draw-quantity-field { display: grid; align-content: start; gap: 6px; min-width: 0; }
.is-embedded :is(input:not([type="radio"]), select) { padding: 8px 12px; border-radius: 10px; font: 400 14px var(--font-b); }
.is-embedded .draw-quantity { gap: 0; border: 1px solid var(--line); border-radius: 10px; background: var(--surface); }
.is-embedded .draw-quantity button { border: 0; border-radius: 8px; background: transparent; transition: background-color .15s; }
.is-embedded .draw-quantity button:hover:not(:disabled) { background: var(--cream); }
.is-embedded .draw-quantity input { padding-inline: 4px; border: 0; border-inline: 1px solid var(--line); border-radius: 0; }
.is-embedded .draw-quantity :is(button, input):focus-visible { outline-offset: -3px; }
.is-embedded .exchange-options { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); }
.is-embedded .purpose-options { grid-template-columns: repeat(3, minmax(0, 1fr)); }
.is-embedded .exchange-options label {
  position: relative;
  display: grid;
  align-content: center;
  gap: 2px;
  min-height: 52px;
  padding: 8px 28px 8px 12px;
  border: 0;
  border-radius: 12px;
  box-shadow: inset 0 0 0 1px var(--line);
}
.is-embedded .exchange-options label:hover { background: var(--cream); }
.is-embedded .exchange-options label:has(input:checked) { box-shadow: inset 0 0 0 1.5px var(--theme-focus, var(--tea)); }
.is-embedded .exchange-options small { color: var(--ink-60); font-size: 12px; font-weight: 400; font-variant-numeric: tabular-nums; }
.is-embedded .exchange-options input { position: absolute; width: 1px; height: 1px; clip-path: inset(50%); }
.option-check { position: absolute; top: 8px; right: 8px; display: none; width: 16px; height: 16px; place-items: center; border-radius: 50%; background: var(--tea); color: var(--on-strong); }
.exchange-options label:has(input:checked) .option-check { display: grid; }
.is-embedded .draw-help, .is-embedded .draw-ledger-detail p { margin: 0; font-size: 13px; }
.is-embedded fieldset > .draw-help { margin-top: 12px; }
.draw-ledger-detail { display: grid; gap: 12px; }
.draw-ledger-detail button { justify-self: start; min-height: 44px; }
.draw-ledger-detail .draw-error { display: flex; align-items: center; gap: 8px; }
.is-embedded .draw-preview { grid-template-columns: minmax(0, 1fr); gap: 12px; }
.is-embedded .draw-preview li { display: grid; grid-template-columns: 28px minmax(0, 1fr); align-items: center; gap: 0 8px; font-size: 13px; }
.is-embedded .draw-preview img { object-fit: contain; }
.draw-row-heading { display: flex; justify-content: space-between; gap: 8px; }
.draw-delta { color: var(--theme-danger-text, var(--rouge)); }
.draw-delta.is-increase { color: var(--theme-success-text, oklch(from var(--tea) l c 145)); }
.draw-flow { grid-column: 2 / -1; font-size: 12px; }
@media (max-width: 767px) {
  summary span { display: block; margin-top: 4px; font-size: 13px; }
  .draw-fields { grid-template-columns: minmax(0, 1fr); }
  input:not([type="radio"]), select { font-size: 16px; }
  .is-embedded :is(input:not([type="radio"]), select) { font-size: 16px; }
}
@media (max-width: 480px) {
  .is-embedded .draw-fields { grid-template-columns: minmax(0, 1fr); }
}
@media (prefers-reduced-motion: reduce) {
  .exchange-options label, .is-embedded .draw-quantity button { transition: none; }
}
</style>
