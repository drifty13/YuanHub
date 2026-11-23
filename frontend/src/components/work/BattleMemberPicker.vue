<template>
  <div class="battle-member-picker">
    <div class="battle-picker-toolbar">
      <label class="battle-search"><Search :size="16" aria-hidden="true" /><span class="sr-only">搜索密探</span><input v-model="search" aria-label="搜索密探" placeholder="搜索名字或别名"></label>
      <div class="battle-picker-source">
        <div class="battle-subnav battle-recruit-filter" role="group" aria-label="招募状态">
          <button v-for="option in recruitOptions" :key="option.value" type="button" :aria-pressed="filters.recruit === option.value" @click="updateFilter('recruit', option.value)">
            {{ option.label }}<span v-if="ownershipKnown" class="battle-recruit-count">{{ recruitCounts[option.value] }}</span>
          </button>
        </div>
        <button type="button" :aria-expanded="filtersOpen" :aria-controls="filterPanelId" @click="filtersOpen = !filtersOpen"><SlidersHorizontal :size="16" aria-hidden="true" />筛选<span v-if="activeFilters.length">{{ activeFilters.length }}</span></button>
      </div>
    </div>
    <section v-if="filtersOpen" :id="filterPanelId" class="battle-picker-filters" aria-label="品质、属性与职业筛选">
      <div v-for="row in filterRows" :key="row.key" class="battle-picker-filter-row">
        <span class="battle-picker-filter-label">{{ row.label }}</span>
        <div class="battle-picker-filter-options" role="group" :aria-label="`按${row.label}筛选`">
          <button v-for="option in row.options" :key="option.value" type="button" :aria-pressed="filters[row.key] === option.value" @click="updateFilter(row.key, option.value)">{{ option.label }}</button>
        </div>
      </div>
      <button v-if="activeFilters.length" type="button" @click="clearFilters">清除</button>
    </section>
    <div v-else-if="activeFilters.length" class="battle-picker-filter-tags">
      <button v-for="filter in activeFilters" :key="filter.key" type="button" :aria-label="`取消${filter.label} ${filter.selectedLabel}筛选`" @click="updateFilter(filter.key, 'all')">{{ filter.label }} {{ filter.selectedLabel }}<X :size="14" aria-hidden="true" /></button>
      <button type="button" @click="clearFilters">清除</button>
    </div>
    <!-- 自定义名称是低频补充，放在列表上方的折叠入口，避免沉到长列表底部找不到。 -->
    <details class="battle-custom-toggle">
      <summary><ChevronRight :size="14" aria-hidden="true" />图鉴中没有？使用自定义名称</summary>
      <form class="battle-custom-name" @submit.prevent="emit('choose', customName.trim())">
        <label>自定义名称<input v-model="customName" :aria-label="`${slot + 1}号位密探`" maxlength="40" placeholder="图鉴中没有的密探" @input="emit('pending-name', Boolean(customName.trim()))"></label>
        <button type="submit" :disabled="busy || !customName.trim()">使用此名称</button>
      </form>
    </details>
    <p v-if="recruitUnavailable" class="battle-hint">尚无账号候选：登录并选择账号后会自动读取我的密探，读取失败时可在页面上方重试；也可切回「全部」手动填写。</p>
    <div v-if="cards.length" class="battle-picker-grid" aria-label="密探候选">
      <button
        v-for="{ agent, position, entry, image, icon } in cards" :key="agent.id"
        type="button" class="slot" :class="['rarity-r' + (agent.rarity || 3), { current: position === slot, 'is-missing': ownershipKnown && !entry }]"
        :disabled="busy" :aria-current="position === slot ? 'true' : undefined"
        :aria-label="`选择${agent.name}，${status(position, entry)}`" @click="emit('choose', agent.name)"
      >
        <span class="slot-ic">
          <img v-if="image" class="slot-avatar" :class="{ 'battle-picker-portrait': !agent.avatar }" :src="image" alt="" loading="lazy">
          <span v-else class="slot-ph"><span class="ph-mono">{{ agent.name?.slice(0, 1) }}</span></span>
          <span v-if="ownershipKnown" class="slot-count" :class="{ zero: !entry }">{{ recruitLabel(entry) }}</span>
          <span v-if="position >= 0" class="battle-picker-position">{{ position === slot ? '当前' : `${position + 1}号位` }}</span>
        </span>
        <span v-if="icon" class="prof-badge" :title="'属性：' + agent.prof" role="img" :aria-label="'属性：' + agent.prof">
          <img :src="icon" alt="" aria-hidden="true">
        </span>
        <span class="slot-name">{{ agent.name }}</span>
      </button>
    </div>
    <div v-else-if="search.trim() || activeFilters.length || (filters.recruit !== 'all' && !recruitUnavailable)" role="status" class="battle-picker-empty">
      <p v-if="!recruitUnavailable" class="battle-hint">{{ search.trim() ? `没有匹配“${search.trim()}”的密探。` : '没有符合条件的密探。' }}</p>
      <button v-if="search.trim()" type="button" :disabled="busy" @click="emit('choose', search.trim())">使用“{{ search.trim() }}”作为自定义名称</button>
      <button v-if="activeFilters.length" type="button" @click="clearFilters">清除筛选</button>
    </div>
    <p class="battle-hint">已有配置会带入本攻略；更换已有密探前会确认替换范围。</p>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, ref, useId } from 'vue'
import { ChevronRight, Search, SlidersHorizontal, X } from '@lucide/vue'
import { avatarUrl } from '../../api/request.js'
import { resolveOperatorPortrait } from '../../utils/operatorPortrait.js'
import { AGENT_PROFS } from '../../data/inventory/catalog.js'
import { sameBattleOperator } from '../../utils/battleImages.js'
import { OPERATOR_RARITY_OPTIONS, subProfOptions, matchesProfSubFilter, matchesOperatorSearch, tokens } from '../../utils/operatorFilters.js'
import { matchesOperatorQuality } from '../../utils/operatorForms.js'
const props = defineProps({ agents: { type: Array, required: true }, filters: { type: Object, required: true }, accountEntries: { type: Array, default: () => [] }, team: { type: Array, default: () => [] }, slot: { type: Number, required: true }, busy: Boolean })
const emit = defineEmits(['choose', 'pending-name', 'update:filters'])
const search = ref(''), customName = ref(''), filtersOpen = ref(false)
const filterPanelId = useId()
const recruitOptions = [
  { value: 'all', label: '全部' },
  { value: 'owned', label: '已招募' },
  { value: 'missing', label: '未招募' }
]
const accountById = computed(() => new Map(props.accountEntries.map(entry => [entry.id, entry])))
const ownershipKnown = computed(() => props.accountEntries.length > 0)
const recruitUnavailable = computed(() => props.filters.recruit !== 'all' && !ownershipKnown.value)
const recruitCounts = computed(() => {
  const all = props.agents.length
  const owned = props.agents.filter(agent => accountById.value.has(agent.id)).length
  return { all, owned, missing: all - owned }
})
function updateFilter(key, value) { emit('update:filters', { ...props.filters, [key]: value }) }
function clearFilters() { emit('update:filters', { ...props.filters, rarity: 'all', prof: 'all', subProf: 'all' }) }
const filterRows = computed(() => {
  const present = new Set(props.agents.flatMap(agent => tokens(agent.prof)))
  const profs = [...AGENT_PROFS.filter(prof => present.has(prof)), ...[...present].filter(prof => !AGENT_PROFS.includes(prof))]
  const options = values => ['all', ...values].map(value => ({ value, label: value === 'all' ? '全部' : value }))
  return [
    { key: 'rarity', label: '品质', options: OPERATOR_RARITY_OPTIONS.filter(option => option.value === 'all' || props.agents.some(agent => matchesOperatorQuality(agent, option.value))) },
    { key: 'prof', label: '属性', options: options(profs) },
    { key: 'subProf', label: '职业', options: options(subProfOptions(props.agents)) }
  ]
})
const activeFilters = computed(() => filterRows.value.filter(row => props.filters[row.key] !== 'all').map(row => ({
  ...row, selectedLabel: (row.key === 'rarity' ? OPERATOR_RARITY_OPTIONS : row.options).find(option => option.value === props.filters[row.key])?.label || props.filters[row.key]
})))
const PROF_ICON_FILES = Object.freeze({ 阳: 'yang.webp', 阴: 'yin.webp', 火: 'fire.webp', 风: 'wind.webp', 水: 'water.webp', 地: 'earth.webp', 混沌: 'chaos.webp' })
function profIcon(value) {
  const prof = tokens(Array.isArray(value) ? value[0] : String(value || '').split(/[\/／+＋]/)[0])[0]
  const file = PROF_ICON_FILES[prof]
  return file ? (import.meta.env.BASE_URL || '/') + 'assets/prof-icons/' + file : ''
}

const cards = computed(() => {
  if (recruitUnavailable.value) return []
  const { recruit, rarity, prof, subProf } = props.filters
  const query = search.value.trim().toLocaleLowerCase()
  return props.agents
    .filter(agent =>
      (recruit === 'all' || accountById.value.has(agent.id) === (recruit === 'owned')) &&
      matchesOperatorQuality(agent, rarity) &&
      matchesProfSubFilter(agent, prof, subProf) &&
      (`${agent.name} ${agent.alias || ''}`.toLocaleLowerCase().includes(query) || matchesOperatorSearch(agent, search.value))
    )
    .map(agent => ({
      agent,
      position: placement(agent),
      entry: accountById.value.get(agent.id),
      image: agent.avatar ? avatarUrl(agent.avatar) : resolveOperatorPortrait(agent.id, agent),
      icon: profIcon(agent.prof)
    }))
})
// 标出当前槽位与其它号位的密探；选中其它号位时，由上层确认并连同配置移来。
const placement = agent => sameBattleOperator(props.team[props.slot], agent) ? props.slot : props.team.findIndex(member => sameBattleOperator(member, agent))
function status(position, entry) {
  if (position === props.slot) return '当前'
  if (position >= 0) return `在${position + 1}号位，选中移来`
  return entry ? '已有配置' : '需手动填写'
}
function recruitLabel(entry) {
  if (!entry) return '未招募'
  const level = String(entry.level ?? '').trim()
  return level ? `Lv${level}` : '已招募'
}
onBeforeUnmount(() => emit('pending-name', false))
</script>

<style scoped src="../../pages/operator/operatorPortraitGrid.css"></style>
