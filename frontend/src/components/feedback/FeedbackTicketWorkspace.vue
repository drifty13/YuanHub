<template>
  <section class="ticket-workspace" :class="{ 'is-split': splitView }" :aria-label="workflow ? '反馈工作台' : '反馈工单列表'">
    <div v-show="!workflow || splitView || !selectedId" ref="listPanel" class="ticket-list-panel" :tabindex="workflow ? -1 : undefined">
      <div v-if="loading" class="ticket-state" role="status">正在加载工单...</div>
      <div v-else-if="error" class="ticket-state error" role="alert">
        <span>{{ error }}</span>
        <button type="button" @click="$emit('retry')"><RefreshCw :size="15" />重新加载</button>
      </div>
      <div v-else-if="!items.length" class="ticket-state empty">
        <Inbox :size="24" aria-hidden="true" />
        <strong>{{ emptyMessage }}</strong>
        <slot name="empty" />
      </div>
      <div v-else class="ticket-table-wrap" :class="{ 'is-workflow': workflow }">
        <component :is="splitView ? 'div' : 'table'" class="ticket-table" :class="{ 'is-workflow': workflow }">
          <thead v-if="!splitView">
            <tr>
              <th class="ticket-content-heading">反馈内容</th>
              <th class="ticket-category-heading">反馈板块</th>
              <th v-if="workflow" class="ticket-state-heading">待办 / 状态</th>
              <th v-if="showWorkflowOwner" class="ticket-owner-heading">负责人</th>
              <th v-if="showReporter && !workflow">提交人</th>
              <th v-if="!workflow">状态</th>
              <th>更新时间</th>
              <th class="ticket-operation">操作</th>
            </tr>
          </thead>
          <component :is="splitView ? 'ul' : 'tbody'" class="ticket-rows" :aria-label="splitView ? '反馈工单列表' : undefined">
            <component
              :is="splitView ? 'li' : 'tr'"
              v-for="item in items"
              :key="item.id"
              :class="{ selected: item.id === selectedId }"
              :data-ticket-id="workflow ? item.id : undefined"
              :aria-current="workflow && item.id === selectedId ? 'true' : undefined"
              :tabindex="splitView ? undefined : 0"
              @click="$emit('select', item.id)"
              @keydown.enter.self="$emit('select', item.id)"
            >
              <component :is="cellTag" class="ticket-summary-cell" data-label="反馈内容">
                <template v-if="workflow">
                  <div class="ticket-workflow-title">
                    <span v-if="isUnread(item)" class="ticket-unread-marker"><span>新消息未读</span></span>
                    <button v-if="splitView" class="ticket-title-button" type="button">{{ item.title || truncate(item.content, 72) }}</button>
                    <strong v-else>{{ item.title || truncate(item.content, 72) }}</strong>
                  </div>
                  <div class="ticket-workflow-meta">
                    <span class="ticket-workflow-origin" :title="workflowOrigin(item)">{{ workflowOrigin(item) }}</span>
                    <span aria-hidden="true">·</span>
                    <code :title="String(item.id)" @click.stop>#{{ item.id }}</code>
                    <button class="ticket-copy" type="button" :aria-label="'复制工单编号 ' + item.id" title="复制编号" @click.stop="copyId(item.id)"><Copy :size="12" aria-hidden="true" /></button>
                  </div>
                </template>
                <template v-else>
                  <strong>{{ item.title || truncate(item.content, 72) }}</strong>
                  <details @click.stop @keydown.stop><summary>工单编号</summary><code>{{ item.id }}</code><button class="ticket-copy" type="button" @click="copyId(item.id)">复制编号</button></details>
                  <span v-if="isUnread(item)" class="ticket-unread-marker">有新更新</span>
                </template>
              </component>
              <component :is="cellTag" class="ticket-area-cell" data-label="反馈板块" :title="splitView ? categoryLabel(item.workArea) : undefined"><span class="ticket-category">{{ categoryLabel(workflow ? item.workArea : item.category) }}</span></component>
              <component :is="cellTag" v-if="showReporter && !workflow" data-label="提交人">{{ reporterName(item) }}</component>
              <component :is="cellTag" class="ticket-status-cell" :data-label="workflow ? '待办 / 状态' : '状态'">
                <span class="ticket-status" :class="['status-' + item.status, 'stage-' + item.workflowStage, { 'is-queue-status': workflow && isQueueStatus(item) }]">
                  {{ statusLabel(item.status, item.hasAdminReply, item) }}
                </span>
                <span v-if="showWorkflowOwner && item.needsReply && item.status === 'OPEN'" class="ticket-reply-marker">需回复</span>
              </component>
              <component :is="cellTag" v-if="showWorkflowOwner" class="ticket-owner-cell" data-label="负责人"><span class="ticket-operator" :class="{ 'is-unassigned': !item.operatorAssigneeName }" :title="item.operatorAssigneeName || '未分配'">{{ item.operatorAssigneeName || '未分配' }}</span></component>
              <component :is="cellTag" class="ticket-time" data-label="更新时间"><time :datetime="item.updatedAt || item.createdAt" :title="workflow ? absoluteTime(item.updatedAt || item.createdAt) : undefined">{{ workflow ? relativeTime(item.updatedAt || item.createdAt) : formatDate(item.updatedAt || item.createdAt) }}</time></component>
              <component :is="cellTag" v-if="!splitView" class="ticket-operation" data-label="操作">
                <button type="button" @click.stop="$emit('select', item.id)">
                  <MessageSquareText v-if="!workflow" :size="16" aria-hidden="true" />{{ workflow ? '查看工单' : '查看反馈' }}
                </button>
              </component>
            </component>
          </component>
        </component>
      </div>
      <p v-if="copyMessage" class="ticket-copy-message" role="status">{{ copyMessage }}</p>

      <footer v-if="items.length" class="ticket-pagination" aria-label="工单分页">
        <span>{{ resultStart }}-{{ resultEnd }} / 共 {{ total }} 条</span>
        <div>
          <button type="button" :disabled="page <= 1 || loading" aria-label="首页" title="首页" @click="$emit('page', 1)">
            <ChevronsLeft :size="18" />
          </button>
          <button type="button" :disabled="page <= 1 || loading" aria-label="上一页" title="上一页" @click="$emit('page', page - 1)">
            <ChevronLeft :size="18" />
          </button>
          <strong>{{ page }} / {{ totalPages }}</strong>
          <button type="button" :disabled="page >= totalPages || loading" aria-label="下一页" title="下一页" @click="$emit('page', page + 1)">
            <ChevronRight :size="18" />
          </button>
          <button type="button" :disabled="page >= totalPages || loading" aria-label="末页" title="末页" @click="$emit('page', totalPages)">
            <ChevronsRight :size="18" />
          </button>
        </div>
      </footer>
    </div>

    <Teleport to="body" :disabled="workflow">
      <div
        v-if="selectedItem || splitView"
        :class="workflow ? 'ticket-detail-pane' : ['ticket-detail-mask', { 'is-short-viewport': shortViewport }]"
        :style="workflow ? undefined : viewportStyle"
        :role="workflow ? undefined : 'presentation'"
      >
        <section
          v-if="selectedItem"
          ref="detailPanel"
          :class="workflow ? 'ticket-detail-inline' : 'ticket-detail-dialog'"
          :role="workflow ? undefined : 'dialog'"
          :aria-modal="workflow ? undefined : true"
          aria-labelledby="ticket-detail-title"
          :tabindex="workflow ? undefined : -1"
          @focusin="!workflow && revealFocusedControl($event)"
        >
          <header class="ticket-detail-head">
            <div>
              <h2 id="ticket-detail-title" ref="detailTitle" :tabindex="workflow ? -1 : undefined">反馈工单详情</h2>
            </div>
            <button v-if="workflow && !splitView" class="ticket-back" type="button" @click="$emit('close')">
              <ChevronLeft :size="16" aria-hidden="true" />返回列表
            </button>
            <button v-else ref="detailCloseButton" type="button" aria-label="关闭工单详情" title="关闭" @click="$emit('close')">
              <X :size="22" />
            </button>
          </header>
          <div ref="scrollBody" class="ticket-detail-scroll">
            <div class="ticket-detail-meta">
              <div class="ticket-detail-overview">
                <span class="ticket-status ticket-detail-status" :class="['status-' + selectedItem.status, 'stage-' + selectedItem.workflowStage]">
                  {{ statusLabel(selectedItem.status, selectedItem.hasAdminReply, selectedItem) }}
                </span>
                <span v-if="showReporter" class="ticket-detail-fact">
                  <span>提交人</span>
                  <strong>{{ reporterName(selectedItem) }}</strong>
                </span>
                <span class="ticket-detail-fact">
                  <span>提交于</span>
                  <time :datetime="selectedItem.createdAt">{{ formatDate(selectedItem.createdAt) }}</time>
                </span>
                <span v-if="workflow" class="ticket-operator" :title="selectedItem.operatorAssigneeName || '未分配'">运营 · {{ selectedItem.operatorAssigneeName || '未分配' }}</span>
              </div>
              <div class="ticket-detail-context">
                <div class="ticket-badges ticket-badges-secondary">
                  <span class="ticket-category">{{ workflow ? '负责板块' : '板块' }} · {{ categoryLabel(workflow ? selectedItem.workArea : selectedItem.category) }}</span>
                </div>
                <code><span>工单</span>{{ selectedItem.id }}</code>
              </div>
            </div>
            <slot name="detail" :item="selectedItem" />
          </div>
        </section>
        <p v-else class="ticket-state ticket-detail-empty">选择左侧工单查看详情</p>
      </div>
    </Teleport>
  </section>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useViewportTier } from '@/composables/useViewportTier.js'
import { useModalFocus } from '@/composables/useModalFocus.js'
import { useModalViewport } from '@/composables/useModalViewport.js'
import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Copy,
  Inbox,
  MessageSquareText,
  RefreshCw,
  X
} from '@lucide/vue'

const props = defineProps({
  items: { type: Array, default: () => [] },
  selectedId: { type: String, default: '' },
  selectedItem: { type: Object, default: null },
  loading: { type: Boolean, default: false },
  error: { type: String, default: '' },
  emptyMessage: { type: String, default: '暂无反馈工单' },
  total: { type: Number, default: 0 },
  page: { type: Number, default: 1 },
  pageSize: { type: Number, default: 20 },
  totalPages: { type: Number, default: 1 },
  showReporter: { type: Boolean, default: false },
  workflow: { type: Boolean, default: false },
  activeQueue: { type: String, default: '' },
  unreadFeedbackIds: { type: Array, default: () => [] },
  categoryLabel: { type: Function, required: true },
  statusLabel: { type: Function, required: true },
  formatDate: { type: Function, required: true }
})

const emit = defineEmits(['select', 'close', 'retry', 'page'])
const listPanel = ref(null)
const detailTitle = ref(null)
const detailPanel = ref(null)
const { isDesktop } = useViewportTier()
const splitView = computed(() => props.workflow && isDesktop.value)
const cellTag = computed(() => splitView.value ? 'div' : 'td')
const detailCloseButton = ref(null)
const copyMessage = ref('')

const selectedItem = computed(() => props.selectedItem || props.items.find(item => item.id === props.selectedId) || (props.selectedId ? { id: props.selectedId } : null))
const scrollBody = ref(null)
const modalOpen = () => !props.workflow && Boolean(selectedItem.value)
const { viewportStyle, shortViewport, revealFocusedControl } = useModalViewport(modalOpen, scrollBody, detailPanel)
useModalFocus(modalOpen, detailPanel, {
  preventScroll: true,
  initialFocus: () => detailCloseButton.value,
  onEscape: () => { if (!hasOpenOverlayAbove()) emit('close') }
})
const showWorkflowOwner = computed(() => props.workflow && props.activeQueue !== 'UNASSIGNED')
const resultStart = computed(() => props.total ? (props.page - 1) * props.pageSize + 1 : 0)
const resultEnd = computed(() => Math.min(props.total, resultStart.value + props.items.length - 1))

let listScrollY = 0
let listAnchor = null
let returnTarget = null

watch(splitView, desktop => {
  if (!desktop && props.selectedId) listScrollY = window.scrollY
})

watch([() => props.selectedId, () => props.loading], async ([id, loading], [previousId]) => {
  if (!props.workflow) return
  if (id && id !== previousId) {
    if (!previousId) listScrollY = window.scrollY
    returnTarget = null
    const index = props.items.findIndex(item => String(item.id) === id)
    if (index >= 0 || !previousId) listAnchor = { id, index }
    await nextTick()
    if (id !== props.selectedId) return
    if (splitView.value && scrollBody.value) scrollBody.value.scrollTop = 0
    detailPanel.value?.scrollIntoView?.({ block: splitView.value ? 'nearest' : 'start', behavior: 'instant' })
    detailTitle.value?.focus({ preventScroll: true })
    return
  }
  if (!id && previousId) returnTarget = listAnchor
  if (id || loading || !returnTarget) return
  await nextTick()
  if (props.selectedId || props.loading || !listPanel.value || !returnTarget) return
  const rows = [...listPanel.value.querySelectorAll('[data-ticket-id]')]
  const row = rows.find(element => element.dataset.ticketId === returnTarget.id)
    || (returnTarget.index >= 0 ? rows[Math.min(returnTarget.index, rows.length - 1)] : null)
  returnTarget = null
  if (!splitView.value) window.scrollTo({ top: listScrollY, behavior: 'instant' })
  const target = row?.querySelector('.ticket-title-button') || row || listPanel.value
  if (row) target.scrollIntoView?.({ block: 'nearest', behavior: 'instant' })
  target.focus({ preventScroll: true })
})

function handleEscape(event) {
  if (event.key !== 'Escape' || event.defaultPrevented || splitView.value || !props.selectedId || hasOpenOverlayAbove()) return
  event.preventDefault()
  emit('close')
}

if (props.workflow) {
  onMounted(() => window.addEventListener('keydown', handleEscape))
  onBeforeUnmount(() => window.removeEventListener('keydown', handleEscape))
}

function absoluteTime(value) {
  return value ? new Date(value).toLocaleString('zh-CN', { hourCycle: 'h23' }) : undefined
}

function relativeTime(value) {
  if (!value) return ''
  const date = new Date(value)
  const now = new Date()
  const minutes = Math.max(0, Math.floor((now - date) / 60000))
  if (minutes < 1) return '刚刚'
  if (minutes < 60) return `${minutes} 分钟前`
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1)
  if (date.toDateString() === yesterday.toDateString()) {
    return `昨天 ${date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })}`
  }
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} 小时前`
  const days = Math.floor(hours / 24)
  return days < 7 ? `${days} 天前` : props.formatDate(value)
}

function truncate(value, length) {
  const text = String(value || '')
  return text.length > length ? text.slice(0, length) + '...' : text
}

function reporterName(item) {
  return item.reporterName || item.reporter?.userName || '未知用户'
}

function workflowOrigin(item) {
  return [
    props.showReporter ? reporterName(item) : null,
    item.source === 'maayuan_diagnostic' ? 'MaaYuan 诊断' : null,
    item.category !== item.workArea ? `来源 · ${props.categoryLabel(item.category)}` : null
  ].filter(Boolean).join(' · ')
}

function isQueueStatus(item) {
  if (item.status !== 'OPEN' || item.mergedIntoId) return false
  return (props.activeQueue === 'UNASSIGNED' && (!item.workflowStage || item.workflowStage === 'UNASSIGNED')) ||
    (props.activeQueue === 'DEV' && item.workflowStage === 'DEV_HANDOFF')
}

function isUnread(item) {
  return item && (props.workflow ? item.teamUnread : props.unreadFeedbackIds.includes(String(item.id)))
}

// 详情层之上可能还压着二级弹窗（如管理端的“合并反馈”，见 main.css 的浮层刻度）：
// Escape 属于最上层弹窗，详情层必须让位，不能连带一起关闭。
function hasOpenOverlayAbove() {
  return typeof document !== 'undefined' && Boolean(document.querySelector('.modal-mask, .dialog-mask'))
}

async function copyId(id) {
  try {
    await navigator.clipboard.writeText(String(id))
    copyMessage.value = '工单编号已复制。'
  } catch {
    copyMessage.value = '复制失败，请选中编号手动复制。'
  }
}
</script>

<style scoped>
/* 刻意共享字段外观与动效；布局和密度由独立双端文件持有。 */
.ticket-detail-dialog .ticket-detail-scroll :deep(textarea) { min-height: min(120px, max(48px, calc(var(--modal-viewport-height, 100dvh) - 180px))); max-height: max(48px, calc(var(--modal-viewport-height, 100dvh) - 180px)); }
.ticket-table-wrap { border: 1px solid var(--feedback-line); border-radius: 8px; background: var(--feedback-panel); box-shadow: 0 16px 36px -32px rgba(var(--theme-shadow-rgb, 73, 59, 44), 0.42); }
.ticket-table { border-collapse: collapse; }
.ticket-table th,
.ticket-table td { border-bottom: 1px solid var(--feedback-line); color: var(--feedback-text-muted); }
.ticket-table th { background: var(--tea); color: var(--on-strong); }
.ticket-table tbody tr { outline: 0; transition: background-color .16s ease, box-shadow .16s ease; cursor: pointer; }
.ticket-table tbody tr:last-child td { border-bottom: 0; }
.ticket-table tbody tr:hover,
.ticket-table tbody tr:focus-visible,
.ticket-table tbody tr.selected { background: var(--feedback-panel-hover); box-shadow: inset 3px 0 var(--yellow-deep); }
.ticket-summary-cell strong { color: var(--feedback-text); }
.ticket-copy { border: 0; background: transparent; color: var(--feedback-text); cursor: pointer; }
.ticket-copy-message { color: var(--feedback-text); }
.ticket-summary-cell code { color: var(--feedback-text-dim); }
.ticket-summary-cell summary { color: var(--feedback-text-muted); cursor: pointer; }
.ticket-unread-marker { border: 1px solid var(--rouge); border-radius: 5px; color: var(--theme-danger-text, var(--rouge)); }
.ticket-operator { border: 1px solid var(--feedback-line-strong); border-radius: 5px; color: var(--feedback-text-muted); }
.ticket-reply-marker { color: var(--feedback-warn); }
.ticket-status.stage-PROCESSING { border-color: var(--brand-blue); color: var(--theme-info-text, var(--brand-blue)); }
.ticket-status.stage-DEV_HANDOFF { border-color: var(--tea); color: var(--theme-strong-text, var(--tea)); }
.ticket-table time { color: var(--feedback-text-dim); }
.ticket-operation button { border: 0; background: transparent; color: var(--feedback-text); cursor: pointer; }
.ticket-operation button:hover { color: var(--theme-accent-text, var(--accent-strong)); }
.ticket-type,
.ticket-category,
.ticket-status { border: 1px solid var(--feedback-line-strong); border-radius: 5px; color: var(--feedback-text-muted); }
.ticket-type { border-color: var(--yellow-deep); background: var(--yellow); color: var(--ink); }
.ticket-category { border-color: var(--brand-blue); background: transparent; color: var(--theme-info-text, var(--brand-blue)); }
.ticket-status { border-color: transparent; }
.ticket-status.status-OPEN { border-color: var(--accent); color: var(--theme-accent-text, var(--accent-strong)); }
.ticket-status.status-RESOLVED { border-color: var(--feedback-success); color: var(--feedback-success); }
.ticket-status.status-DISMISSED { border-color: var(--feedback-line-strong); color: var(--feedback-text-dim); }
.ticket-table-wrap.is-workflow { scrollbar-gutter: auto; }
.ticket-table.is-workflow th { border-color: var(--line); background: var(--cream); color: var(--ink-60); }
.ticket-workflow-title .ticket-unread-marker { border: 0; border-radius: 50%; background: var(--accent); }
.ticket-workflow-title .ticket-unread-marker > span { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
.ticket-workflow-meta, .ticket-workflow-meta code, .ticket-workflow-meta .ticket-copy { color: var(--ink-60); }
.ticket-table.is-workflow .ticket-category,
.ticket-table.is-workflow .ticket-status,
.ticket-table.is-workflow .ticket-reply-marker { border: 0; border-radius: 5px; background: color-mix(in srgb, currentColor 12%, transparent); }
.ticket-table.is-workflow .ticket-status.status-OPEN { color: var(--ink-60); }
.ticket-table.is-workflow .ticket-status.stage-PROCESSING { color: var(--theme-info-text, var(--brand-blue)); }
.ticket-table.is-workflow .ticket-status.stage-DEV_HANDOFF { color: var(--theme-strong-text, var(--tea)); }
.ticket-table.is-workflow .ticket-status.is-queue-status { background: transparent; color: var(--ink-60); }
.ticket-table.is-workflow .ticket-reply-marker { color: var(--theme-accent-text, var(--accent-strong)); }
.ticket-table.is-workflow .ticket-operator.is-unassigned { border: 0; color: var(--ink-60); }
.ticket-table.is-workflow .ticket-operation button { border: 0; color: var(--ink-60); }
.ticket-table.is-workflow .ticket-operation button:hover,
.ticket-workflow-meta .ticket-copy:hover { color: var(--theme-accent-text, var(--accent-strong)); }
.ticket-table.is-workflow button:focus-visible { outline: 2px solid var(--theme-focus, var(--accent)); outline-offset: -2px; }
.ticket-state { border: 1px solid var(--feedback-line); border-radius: 8px; background: var(--feedback-panel); color: var(--feedback-text-muted); }
.ticket-state.error { color: var(--feedback-danger); }
.ticket-state button { border: 0; background: transparent; color: var(--theme-accent-text, var(--accent-strong)); cursor: pointer; }
.ticket-state.empty strong { color: var(--feedback-text); }
.ticket-pagination { color: var(--feedback-text-dim); }
.ticket-pagination > div { border: 1px solid var(--feedback-line); border-radius: 7px; background: var(--feedback-panel); }
.ticket-pagination button { border: 0; border-left: 1px solid var(--feedback-line); background: transparent; color: var(--feedback-text-muted); cursor: pointer; }
.ticket-pagination button:first-child { border-left: 0; }
.ticket-pagination button:disabled { opacity: .3; cursor: default; }
.ticket-pagination strong { color: var(--feedback-text); }
.ticket-detail-mask {
  background: var(--theme-overlay, rgba(73, 59, 44, .52));
  backdrop-filter: blur(10px);
}
.ticket-detail-dialog { border: 1px solid var(--line); border-radius: 8px; background: var(--feedback-panel-deep); box-shadow: 0 30px 90px rgba(var(--theme-shadow-rgb, 73, 59, 44), 0.32); }
.ticket-detail-head { border-bottom: 1px solid var(--feedback-line); }
.ticket-detail-head h2 { color: var(--feedback-text); }
.ticket-detail-head > button { border: 1px solid var(--feedback-line-strong); border-radius: 7px; background: transparent; color: var(--feedback-text); cursor: pointer; }
.ticket-detail-head > button:hover { border-color: var(--accent); color: var(--theme-accent-text, var(--accent-strong)); }
.ticket-list-panel,
.ticket-detail-pane { min-width: 0; }
.ticket-detail-inline { min-width: 0; border: 1px solid var(--line); border-radius: 8px; background: var(--surface); scroll-margin-top: var(--mobile-header-offset, 60px); }
.ticket-detail-empty { margin: 0; background: var(--surface); }
.ticket-detail-inline .ticket-detail-head { min-height: 0; padding: 12px 16px; }
.ticket-detail-inline .ticket-detail-head h2 { margin: 0; font-size: 19px; }
.ticket-detail-inline .ticket-detail-head > button { border-color: var(--line); }
.ticket-detail-inline .ticket-detail-head .ticket-back { width: auto; min-height: var(--control-h); height: auto; display: inline-flex; align-items: center; gap: 5px; padding: 4px 10px; white-space: nowrap; font: 600 12px var(--font-b); }
.ticket-detail-inline .ticket-detail-scroll { padding-inline: 16px; }
.ticket-detail-inline :is(button, h2):focus-visible,
.ticket-list-panel:focus-visible { outline: 2px solid var(--theme-focus, var(--accent)); outline-offset: 2px; }
.ticket-detail-overview { border-bottom: 1px solid var(--feedback-line); }
.ticket-detail-fact { color: var(--feedback-text-muted); }
.ticket-detail-fact > span { color: var(--feedback-text-dim); }
.ticket-detail-fact strong { color: var(--feedback-text); }
.ticket-detail-fact time { color: var(--feedback-text-muted); }
.ticket-badges-secondary .ticket-type,
.ticket-badges-secondary .ticket-category { border-color: var(--feedback-line); background: var(--feedback-panel); color: var(--feedback-text-muted); }
.ticket-detail-meta code { color: var(--feedback-text-dim); }
.ticket-detail-meta code span { color: var(--feedback-text-dim); }

@media (max-width: 767px) {
  .ticket-table-wrap { border: 0; background: transparent; }
  .ticket-table tbody tr { border: 1px solid var(--feedback-line); border-radius: 8px; background: var(--feedback-panel); }
  .ticket-table td { border-bottom: 1px solid var(--feedback-line); }
  .ticket-table td::before { content: attr(data-label); color: var(--feedback-text-dim); }
  .ticket-table .ticket-operation { border-bottom: 0; }
  .ticket-table .ticket-operation button { border: 1px solid var(--feedback-line-strong); }
  .ticket-detail-dialog { border: 0; border-radius: 0; }
}
</style>
<style scoped src="./feedbackTicketWorkspaceDesktop.css"></style>
<style scoped src="./feedbackTicketWorkspaceMobile.css"></style>
