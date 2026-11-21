<template>
  <section class="capacity-panel" aria-label="库存可养人数">
    <div class="capacity-source">
      <span>当前子账号：{{ accountName }} · {{ game }}</span>
      <div><span class="capacity-sync" :class="{ ready: !loading && !inventoryError }" role="status">{{ loading ? '库存同步中…' : inventoryError ? '库存未同步' : '库存已同步' }}</span><button type="button" class="capacity-icon-button" :disabled="loading" :aria-label="inventoryError ? '重试读取库存' : '刷新试算库存'" @click="emit('refresh')"><RefreshCw :size="17" :class="{ spinning: loading }" aria-hidden="true" /></button></div>
    </div>

    <div class="capacity-interval">
      <div class="capacity-field"><label :for="prefix + '-from'">起始修为</label><PlannerSelect :id="prefix + '-from'" v-model="from" :options="fromOptions" label="起始修为" numeric /></div>
      <ArrowRight class="capacity-arrow" :size="22" aria-hidden="true" />
      <div class="capacity-field"><label :for="prefix + '-to'">目标修为</label><PlannerSelect :id="prefix + '-to'" v-model="to" :options="toOptions" label="目标修为" numeric /></div>
      <span class="capacity-auto">修改后自动试算</span>
    </div>

    <p v-if="loading" class="capacity-state" role="status">正在读取当前库存，试算结果将在同步后更新。</p>
    <div v-else-if="inventoryError" class="capacity-state capacity-error" role="alert"><CircleAlert :size="18" aria-hidden="true" /><p>{{ inventoryError }}</p><button type="button" @click="emit('refresh')">重新读取库存</button></div>
    <template v-else>
      <div class="capacity-result-heading"><h3>当前库存可支持</h3><p>同组属性共用材料，人数为该组合计</p></div>
      <div class="capacity-results" aria-live="polite" aria-atomic="true">
        <template v-for="(group, index) in calculation.groups" :key="group.id">
          <button :id="prefix + '-' + group.id" type="button" class="capacity-group" :class="{ selected: expandedGroup === group.id }" :style="{ '--group-column': index + 1 }" :aria-label="group.name + '材料可供 ' + format(group.count) + ' 人，' + (expandedGroup === group.id ? '收起用料' : '查看用料')" :aria-expanded="expandedGroup === group.id" :aria-controls="prefix + '-' + group.id + '-detail'" @click="expandedGroup = expandedGroup === group.id ? '' : group.id">
            <span class="capacity-attributes"><template v-for="(attribute, attributeIndex) in Array.from(group.name)" :key="attribute"><span v-if="attributeIndex" class="capacity-slash">/</span><span class="capacity-attribute" :class="'attribute-' + attribute"><component :is="attributeIcons[attribute]" :size="19" aria-hidden="true" />{{ attribute }}</span></template></span>
            <span class="capacity-count"><strong>{{ format(group.count) }}</strong><span>人</span></span>
            <span class="capacity-detail-toggle">{{ expandedGroup === group.id ? '收起用料' : '查看用料' }}<ChevronUp v-if="expandedGroup === group.id" :size="15" aria-hidden="true" /><ChevronDown v-else :size="15" aria-hidden="true" /></span>
          </button>

          <section v-show="expandedGroup === group.id" :id="prefix + '-' + group.id + '-detail'" class="capacity-detail" :aria-labelledby="prefix + '-' + group.id + '-detail-title'">
            <h3 :id="prefix + '-' + group.id + '-detail-title'">{{ group.name }} · 修为 {{ from }} → {{ to }}</h3>
            <p class="capacity-mobile-context">{{ group.count ? '培养 ' + format(group.count) + ' 人后，再养 1 人' : '培养第 1 人所需材料' }}</p>
            <table>
              <caption class="capacity-sr-only">{{ group.name }}修为 {{ from }} 到 {{ to }} 的材料用量与培养下一人的缺口</caption>
              <thead><tr><th scope="col">材料</th><th scope="col">单人需要</th><th scope="col">当前库存</th><th scope="col">培养 {{ format(group.count) }} 人后剩余</th><th scope="col">再养 1 人缺口</th></tr></thead>
              <tbody><tr v-for="item in group.materials" :key="item.id"><th scope="row"><span class="capacity-material"><img :src="itemIcon(item.id)" alt="" @error="$event.target.style.visibility = 'hidden'" /><span>{{ itemName(item.id) }}</span></span></th><td class="capacity-required">{{ format(item.required) }}</td><td class="capacity-owned">{{ format(item.owned) }}</td><td class="capacity-remaining">{{ format(item.remaining) }}</td><td class="capacity-gap" :class="{ shortage: item.nextGap > 0 }"><span class="capacity-mobile-label">{{ item.nextGap ? '还缺 ' : '已足够' }}</span><span v-if="item.nextGap">{{ format(item.nextGap) }}</span><span v-else class="capacity-desktop-dash">—</span></td></tr></tbody>
            </table>
            <p class="capacity-next"><Info :size="17" aria-hidden="true" /><span>{{ group.count ? '再培养 1 人' : '培养第 1 人' }}，还缺{{ shortageSummary(group) }}。</span></p>
            <p v-if="expandedGroup === group.id && trainingAdvice" class="capacity-training"><Swords :size="17" aria-hidden="true" /><span>{{ trainingAdvice }}</span></p>
          </section>
        </template>
      </div>
    </template>
    <footer class="capacity-footer">
      <p><Info :size="13" aria-hidden="true" />仅按修为材料计算；等级需满足解锁条件，五铢钱另计。历练次数仅计必得掉落。</p>
      <p><Info :size="13" aria-hidden="true" />独立试算，不扣除或预留库存，也不扣除其他培养计划的需求。</p>
      <p class="capacity-plan-link">要按多位密探一起估算材料，可切换到<button type="button" @click="emit('show-plans')">储备方案</button>添加培养目标。</p>
    </footer>
  </section>
</template>

<script setup>
import { computed, ref, useId } from 'vue'
import { ArrowRight, ChevronDown, ChevronUp, CircleAlert, Droplet, Flame, Info, Leaf, Moon, Mountain, RefreshCw, Sun, Swords } from '@lucide/vue'
import PlannerSelect from './PlannerSelect.vue'
import { trainingSchedule } from '../../data/operatorTraining.js'
import { formatXiuweiTrainingAdvice } from '../../data/operatorTrainingAdvice.js'
import { calculateXiuweiCapacity } from '../../data/operatorXiuweiCapacity.js'
import { ITEM_CATALOG } from '../../data/inventory/catalog.js'
import { OPERATOR_ELITE_MAX } from '../../utils/operatorGrowthRules.js'

const props = defineProps({
  accountName: { type: String, default: '当前子账号' },
  game: { type: String, required: true },
  stock: { type: Object, default: null },
  trainingLevels: { type: Object, default: null },
  loading: Boolean,
  error: { type: String, default: '' }
})
const emit = defineEmits(['refresh', 'show-plans'])
const prefix = 'xiuwei-capacity-' + useId()
const from = ref(1), to = ref(OPERATOR_ELITE_MAX), expandedGroup = ref('yy')
const options = Array.from({ length: OPERATOR_ELITE_MAX }, (_, index) => ({ value: index + 1, label: String(index + 1) }))
const fromOptions = computed(() => options.map(option => ({ ...option, disabled: option.value >= to.value })))
const toOptions = computed(() => options.map(option => ({ ...option, disabled: option.value <= from.value })))
const calculation = computed(() => calculateXiuweiCapacity(from.value, to.value, props.stock))
const inventoryError = computed(() => props.error || calculation.value.error)
const attributeIcons = { 风: Leaf, 火: Flame, 地: Mountain, 水: Droplet, 阴: Moon, 阳: Sun }
const format = value => value.toLocaleString('zh-CN')
const itemName = id => ITEM_CATALOG.find(item => item.id === id)?.name || id
const itemIcon = id => (import.meta.env.BASE_URL || '/') + 'inventory-icons/items/' + encodeURIComponent(id) + '.webp'
const shortageSummary = group => group.materials.filter(item => item.nextGap > 0).map(item => itemName(item.id) + ' ' + format(item.nextGap)).join('、')
const trainingAdvice = computed(() => {
  const group = calculation.value.groups.find(group => group.id === expandedGroup.value)
  if (!group) return ''
  const gaps = group.materials.filter(item => item.nextGap > 0).map(item => ({ id: item.id, gap: item.nextGap }))
  const schedule = trainingSchedule(gaps, props.trainingLevels ?? undefined).find(item => item.id === group.id)
  return schedule ? formatXiuweiTrainingAdvice(schedule) : ''
})
</script>

<style scoped>
.capacity-panel { min-width: 0; color: var(--ink); }
.capacity-detail h3, .capacity-result-heading h3 { font-family: var(--font-s); }
.capacity-source, .capacity-auto, .capacity-result-heading p, .capacity-footer, .capacity-mobile-context { color: var(--ink-60); }
.capacity-interval, .capacity-group, .capacity-detail { border: 1px solid var(--line); border-radius: 9px; }
.capacity-interval { background: var(--theme-wash, rgba(246, 237, 208, .12)); }
button { border: 1px solid var(--line); border-radius: 8px; background: var(--surface); color: var(--ink); font: inherit; cursor: pointer; touch-action: manipulation; }
button:disabled { opacity: .5; cursor: default; }
button:active:not(:disabled) { opacity: .8; }
.capacity-icon-button { background: transparent; }
.capacity-arrow { color: var(--theme-accent-text, #a58a67); }
.capacity-group.selected { border-color: var(--theme-accent-text, #a77b3d); background: var(--cream); }
.capacity-group.selected .capacity-detail-toggle { color: var(--theme-accent-text, #8f611e); }
.capacity-count, td { font-family: var(--font-d); font-variant-numeric: tabular-nums; }
.capacity-slash { color: var(--ink-60); }
.attribute-风 { color: var(--theme-success-text, #477444); }
.attribute-火 { color: var(--theme-danger-text, #b86443); }
.attribute-地 { color: var(--theme-accent-text, #8d6337); }
.attribute-水 { color: var(--theme-info-text, #387ca1); }
.attribute-阴 { color: var(--theme-purple-text, #8a659d); }
.attribute-阳 { color: var(--theme-accent-text, #a67720); }
.capacity-detail h3::before { content: ''; background: var(--theme-accent-text, #c59b50); border-radius: 2px; }
thead { background: var(--theme-wash, #f6efe4); }
tbody tr { border-bottom: 1px solid var(--line); }
.capacity-gap { color: var(--theme-success-text, #477444); }
.capacity-gap.shortage, .capacity-error { color: var(--theme-danger-text, var(--rouge)); }
.capacity-next { border-radius: 7px; background: var(--theme-danger-wash, #fbecdf); color: var(--theme-danger-text, #a65136); }
.capacity-training { border-radius: 7px; background: var(--theme-wash, #f6efe4); color: var(--ink-60); }
.capacity-sync::before { content: ''; border-radius: 50%; background: var(--ink-35); }
.capacity-sync.ready::before { background: var(--theme-success-text, #569653); }
.capacity-footer .capacity-plan-link { display: block; font-size: 12px; }
.capacity-plan-link button { min-height: var(--control-h-sm); padding: 0 4px; border: 0; background: transparent; color: var(--theme-accent-text, var(--accent-strong)); text-decoration: underline; }
:is(button, [tabindex]):focus-visible { outline: 2px solid var(--theme-focus, var(--accent)); outline-offset: 3px; }
.capacity-sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; border: 0; }
.spinning { animation: capacity-spin 1s linear infinite; }
@keyframes capacity-spin { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) { .spinning { animation: none; } }
</style>
<style scoped src="./operatorXiuweiCapacityPanelDesktop.css"></style>
<style scoped src="./operatorXiuweiCapacityPanelMobile.css"></style>
