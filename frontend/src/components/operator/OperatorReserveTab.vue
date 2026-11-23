<template>
  <div class="reserve-tab">
    <template v-if="visited">
      <div class="reserve-views" role="group" aria-label="培养储备视图">
        <button type="button" :aria-pressed="view !== 'plans'" aria-controls="reserve-capacity-view" @click="view = 'capacity'">库存可养人数</button>
        <button ref="plansButton" type="button" :aria-pressed="view === 'plans'" aria-controls="reserve-plans-view" @click="view = 'plans'">储备方案</button>
      </div>
      <p v-if="usingDefaultLevels" class="reserve-levels-hint" role="status">历练层数暂不可用，当前按默认层数估算。</p>
      <OperatorXiuweiCapacityPanel v-show="view !== 'plans'" id="reserve-capacity-view"
        :account-name="accountName" :game="game" :stock="stock" :training-levels="trainingLevels"
        :loading="stockLoading" :error="stockError" @refresh="loadInventory" @show-plans="showPlans" />
      <OperatorReserveWorkspace v-show="view === 'plans'" id="reserve-plans-view"
        :account-id="accountId" :game="game" :stock="stock" :training-levels="trainingLevels"
        @plan-count="selectDefaultView" />
    </template>
  </div>
</template>

<script setup>
import { nextTick, onBeforeUnmount, ref, shallowRef, watch } from 'vue'
import OperatorReserveWorkspace from './OperatorReserveWorkspace.vue'
import OperatorXiuweiCapacityPanel from './OperatorXiuweiCapacityPanel.vue'
import { getTrainingWorkspace } from '../../api/operatorPlanner.js'
import { workspaceFromRemote } from '../../data/operatorPlannerRemote.js'
import { DEFAULT_TRAINING_LEVELS } from '../../data/operatorTraining.js'
import { subscribeAccountEvents } from '../../store/accountEvents.js'

const props = defineProps({
  accountId: { type: String, required: true },
  accountName: { type: String, required: true },
  game: { type: String, required: true },
  active: Boolean,
  refreshKey: { type: Number, default: 0 },
  readStock: { type: Function, required: true }
})

const visited = ref(false)
const view = ref(null)
let defaultView = null
const plansButton = ref(null)
const stock = shallowRef(null)
const stockLoading = ref(false)
const stockError = ref('')
const trainingLevels = shallowRef(DEFAULT_TRAINING_LEVELS)
const usingDefaultLevels = ref(false)
let stockRequest = 0
let levelsRequest = 0

function selectDefaultView(count) {
  defaultView = count > 0 ? 'plans' : 'capacity'
  if (view.value === null) view.value = defaultView
}

function showPlans() {
  view.value = 'plans'
  nextTick(() => plansButton.value?.focus())
}

async function loadInventory() {
  const request = ++stockRequest
  stockLoading.value = true
  stockError.value = ''
  try {
    const items = await props.readStock(props.accountId)
    if (request === stockRequest) stock.value = items
  } catch (error) {
    if (request !== stockRequest) return
    stock.value = null
    stockError.value = error?.message || '当前库存加载失败'
  } finally {
    if (request === stockRequest) stockLoading.value = false
  }
}

async function loadTrainingLevels() {
  const request = ++levelsRequest
  const account = props.accountId
  try {
    const data = await getTrainingWorkspace(account)
    if (request !== levelsRequest) return
    const workspace = workspaceFromRemote({ ...data, training_levels: data?.training_levels ?? DEFAULT_TRAINING_LEVELS }, account)
    trainingLevels.value = workspace.trainingLevels
    usingDefaultLevels.value = false
  } catch (_) {
    if (request !== levelsRequest) return
    trainingLevels.value = DEFAULT_TRAINING_LEVELS
    usingDefaultLevels.value = true
  }
}

watch(() => props.active, active => {
  if (!active) return
  view.value = defaultView
  visited.value = true
  loadInventory()
  loadTrainingLevels()
}, { immediate: true })

watch(() => props.refreshKey, () => { if (props.active) loadInventory() })

const unsubscribe = subscribeAccountEvents(({ event, data }) => {
  const account = data?.account_id || data?.accountId
  if (!props.active || (account && account !== props.accountId)) return
  const reconnected = event === 'account_stream_open' && data?.reconnected
  if (reconnected || event === 'operator_training_workspace') loadTrainingLevels()
  if (reconnected || ['inventory_import', 'operator_scan_import', 'operator-upgrade'].includes(event)) loadInventory()
})

onBeforeUnmount(() => {
  stockRequest++
  levelsRequest++
  unsubscribe()
})
</script>

<style scoped>
.reserve-tab { --planner-line: var(--theme-line, var(--line)); min-width: 0; margin-top: 12px; }
.reserve-views { display: inline-grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 4px; margin-bottom: 16px; padding: 4px; border: 1px solid var(--planner-line); border-radius: 10px; background: var(--theme-wash, var(--cream)); }
.reserve-views button { min-height: var(--control-h); padding: 6px 12px; border: 0; border-radius: 6px; background: transparent; color: var(--ink-60); font: 700 13px var(--font-b); cursor: pointer; }
.reserve-views button[aria-pressed="true"] { background: var(--theme-control-bg, var(--tea)); color: var(--on-strong); }
.reserve-views button:focus-visible { outline: 2px solid var(--theme-focus, var(--accent)); outline-offset: 2px; }
.reserve-levels-hint { margin: 0 0 12px; color: var(--ink-60); font-size: 13px; }
@media (max-width: 767px) { .reserve-views { display: grid; } }
</style>
