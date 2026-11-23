<template>
  <div class="feedback-page feedback-center manage-feedback">
    <IslandSidebar />

    <main id="main-content">
      <header class="page-header page-header--mobile-context page-header--keep-title feedback-manage-header">
        <div class="wrap">
          <div class="page-header-row">
            <h1 class="page-header-title">反馈工作台</h1>
            <router-link class="page-header-back page-header-mobile-actions" to="/maayuan-diagnostics">MaaYuan 诊断</router-link>
          </div>
        </div>
      </header>

      <section class="feedback-content">
        <div class="wrap">
          <div v-if="loadingAccess" class="permission-state" role="status">正在检查反馈权限…</div>
          <div v-else-if="!hasManagePermission" class="permission-state" role="alert">
            <ShieldAlert :size="24" aria-hidden="true" />
            <strong>{{ error || '暂无板块管理权限' }}</strong>
            <router-link class="feedback-primary-action" to="/feedback">前往我的反馈</router-link>
          </div>

          <template v-else>
            <p v-if="pageMessage" class="feedback-workflow-message feedback-page-message" role="status">{{ pageMessage }}</p>
            <div class="feedback-work-controls">
              <div class="feedback-queue-bar">
                <div class="feedback-work-queues" role="group" aria-label="工作队列">
                  <div class="feedback-primary-queues">
                    <button v-for="status in primaryQueues" :key="status.key" type="button" :aria-pressed="filterStatus === status.key" :class="{ on: filterStatus === status.key }" @click="setFilter(status)">
                      {{ status.label }} <span class="feedback-queue-count">{{ queueCounts[status.key] ?? '—' }}</span>
                    </button>
                  </div>
                  <div class="feedback-secondary-queues" role="group" aria-label="其他队列">
                    <button v-for="status in secondaryQueues" :key="status.key" type="button" :aria-pressed="filterStatus === status.key" :class="{ on: filterStatus === status.key }" @click="setFilter(status)">
                      {{ status.label }} <span class="feedback-queue-count">{{ queueCounts[status.key] ?? '—' }}</span>
                    </button>
                  </div>
                </div>
                <details class="feedback-queue-help">
                  <summary aria-label="工作队列说明"><Info :size="16" aria-hidden="true" /></summary>
                  <div class="feedback-queue-note">
                    <p>同一工单可能出现在多个队列，数量不可相加。</p>
                  </div>
                </details>
              </div>
              <div v-if="filterStatus === 'CLAIMED'" class="feedback-claimed-filters" role="group" aria-label="已接单筛选">
                <button type="button" class="feedback-button" :aria-pressed="onlyNeedsReply" @click="toggleClaimedFilter('needsReply')">只看待回复</button>
                <button type="button" class="feedback-button" :aria-pressed="onlyMine" @click="toggleClaimedFilter('mine')">只看我的</button>
              </div>
              <p v-if="queueCountError" class="feedback-form-error feedback-queue-error" role="status">{{ queueCountError }} <button type="button" @click="loadQueueCounts">重试</button></p>

              <div class="feedback-command-bar feedback-manage-toolbar">
                <form class="feedback-search" role="search" @submit.prevent="searchFeedback">
                  <Search :size="18" aria-hidden="true" />
                  <input v-model="q" type="search" name="managed-feedback-search" aria-label="搜索待处理反馈" placeholder="搜索工单编号或反馈内容…" />
                  <button type="submit" title="搜索" aria-label="搜索"><ArrowRight :size="16" /></button>
                </form>
                <label class="feedback-filter">
                  <span>负责板块</span>
                  <select :value="filterCategory" @change="changeListOption('category', $event)">
                    <option value="">全部板块</option>
                    <option v-for="option in categoryOptions" :key="option.key" :value="option.key">{{ feedbackCategoryLabel(option) }}</option>
                  </select>
                </label>
                <label class="feedback-filter">
                  <span>排序</span>
                  <select :value="sort" aria-label="反馈排序" @change="changeListOption('sort', $event)">
                    <option value="oldest">最早提交</option>
                    <option value="updated">最近更新</option>
                    <option value="latest">最新提交</option>
                  </select>
                </label>
              </div>
              <div class="feedback-list-settings">
                <span class="feedback-result-meta">当前筛选共 {{ totalCount }} 条 · 第 {{ page }} / {{ totalPages }} 页</span>
                <details class="feedback-management-settings" @keydown.esc="closeListSettings" @focusout="dismissListSettingsOnBlur">
                  <summary class="feedback-button">管理操作与列表设置 <ChevronDown :size="15" aria-hidden="true" /></summary>
                  <div class="feedback-management-settings-body">
                    <label class="feedback-filter">
                      <span>每页显示</span>
                      <select :value="pageSize" aria-label="每页显示数量" @change="changeListOption('pageSize', $event)">
                        <option v-for="size in [20, 30, 50]" :key="size" :value="size">{{ size }} 条</option>
                      </select>
                    </label>
                    <div class="feedback-read-tools">
                      <span>标为已读包含当前筛选之外的授权工单。</span>
                      <button class="feedback-button feedback-mark-read-button" type="button" :disabled="markingAllRead || feedbackUnreadState.loading || unreadCount === 0" :title="markAllReadHint" :aria-label="markAllReadHint" @click="markAllUnreadFeedback">
                        <CheckCheck :size="15" aria-hidden="true" />
                        <span>{{ markingAllRead ? '标记中…' : '全部已读' }}</span>
                        <span v-if="unreadCount > 0" class="feedback-mark-read-count" aria-hidden="true">{{ unreadCount > 99 ? '99+' : unreadCount }}</span>
                      </button>
                    </div>
                  </div>
                </details>
              </div>
            </div>

            <FeedbackTicketWorkspace
              :items="feedbacks"
              :selected-id="selectedId"
              :selected-item="selectedDetail"
              :loading="loading"
              :error="error"
              :total="totalCount"
              :page="page"
              :page-size="pageSize"
              :total-pages="totalPages"
              :category-label="categoryLabel"
              :status-label="statusLabel"
              :format-date="formatDate"
              :unread-feedback-ids="unreadFeedbackIds"
              :active-queue="filterStatus"
              workflow
              show-reporter
              empty-message="暂无符合条件的授权工单"
              @select="selectTicket"
              @close="closeDetail"
              @retry="loadFeedback"
              @page="changePage"
            >
              <template #detail="{ item }">
                <FeedbackTicketDetail
                  :item="item"
                  :loading="detailLoading"
                  :error="detailError"
                  :format-date="formatDate"
                  :viewer-user-id="currentUserId()"
                  viewer-actor-mode="ADMIN"
                  reporter-label="提交人"
                >
                  <template #management>
                    <section v-if="item.mergedIntoId || item.mergedSourceIds?.length" class="feedback-admin-settings feedback-merge-relations" aria-label="反馈合并关系">
                      <div v-if="item.mergedIntoId"><strong>已合并至</strong><router-link :to="{ path: '/feedback/manage', query: { id: item.mergedIntoId } }">{{ item.mergedIntoId }}</router-link></div>
                      <div v-if="item.mergedSourceIds?.length"><strong>已归并 {{ item.mergedCount }} 条反馈</strong><ul><li v-for="sourceId in item.mergedSourceIds" :key="sourceId"><router-link :to="{ path: '/feedback/manage', query: { id: sourceId } }">{{ sourceId }}</router-link></li></ul></div>
                    </section>
                    <div v-if="canManageSettings(item)" class="feedback-management-summary" aria-label="反馈管理状态">
                      <span>工单处理：{{ statusLabel(item.status, item.hasAdminReply, item) }}</span>
                    </div>
                  </template>
                </FeedbackTicketDetail>
              </template>
              <template #detail-actions="{ item }">
                <div v-if="!detailLoading && !item.mergedIntoId" class="detail-action-area">
                  <div class="feedback-ticket-actions">
                    <p v-if="workflowMessage" class="feedback-workflow-message" role="status">{{ workflowMessage }}</p>
                    <p v-if="detailError" class="feedback-workflow-error" aria-hidden="true">{{ detailError }}</p>
                    <div v-if="!workflowMode && replyTarget !== item.id" ref="workflowToolbar" class="feedback-detail-actions feedback-action-toolbar" role="group" aria-label="工单操作">
                      <button v-if="item.status !== 'OPEN' && item.viewerCanManage" class="feedback-primary-action" type="button" :disabled="actionBusy" @click="updateStatus(item.id, 'OPEN')">重新打开</button>
                      <button v-if="item.status === 'OPEN' && item.workflowStage === 'UNASSIGNED' && item.viewerCanManage" class="feedback-primary-action" type="button" :disabled="actionBusy" @click="runWorkflow('claim', item)">接单</button>
                      <button v-if="item.status === 'OPEN' && item.viewerCanTakeOver" class="feedback-primary-action" type="button" :disabled="actionBusy" @click="openWorkflow('takeover')">接手</button>
                      <button v-if="item.status === 'OPEN' && item.viewerCanManage" :class="item.workflowStage === 'UNASSIGNED' ? 'feedback-button' : 'feedback-primary-action'" type="button" :disabled="actionBusy" @click="showReplyForm(item.id)"><MessageSquarePlus :size="16" aria-hidden="true" />回复</button>
                      <button v-if="item.status === 'OPEN' && item.viewerCanManage && item.workflowStage === 'PROCESSING'" class="feedback-button" type="button" :disabled="actionBusy" @click="updateStatus(item.id, 'RESOLVED')"><CheckCircle2 :size="16" aria-hidden="true" />标记完成</button>
                      <button v-if="item.status === 'OPEN' && item.viewerCanManage && item.workflowStage === 'PROCESSING'" ref="workflowMenuButton" class="feedback-button" type="button" :disabled="actionBusy" :aria-expanded="workflowMenuOpen" :aria-controls="workflowMenuOpen ? 'feedback-workflow-options' : undefined" @click="toggleWorkflowMenu">工单流转<ChevronDown :size="16" aria-hidden="true" /></button>
                      <button v-if="item.status !== 'OPEN' || !item.viewerCanManage || item.workflowStage !== 'PROCESSING'" ref="historyButton" class="feedback-button" type="button" @click="openWorkflowHistory(item.id)">处理记录</button>
                      <button v-if="canMergeFeedback(item)" ref="managementMenuButton" class="feedback-button" type="button" :disabled="actionBusy" :aria-expanded="managementMenuOpen" :aria-controls="managementMenuOpen ? 'feedback-management-options' : undefined" @click="toggleManagementMenu">管理操作<ChevronDown :size="16" aria-hidden="true" /></button>
                      <button v-if="item.status === 'OPEN' && item.viewerCanManage" class="feedback-button danger" type="button" :disabled="actionBusy" @click="updateStatus(item.id, 'DISMISSED')"><CircleX :size="16" aria-hidden="true" />驳回</button>
                    </div>
                    <div v-if="workflowMenuOpen && !workflowMode" id="feedback-workflow-options" class="feedback-workflow-options" role="group" aria-label="流转操作">
                      <template v-if="item.viewerCanManage && item.workflowStage === 'PROCESSING'">
                        <button class="feedback-button" type="button" @click="openWorkflow('assign')">转交运营</button>
                        <button class="feedback-button" type="button" @click="openWorkflow('area')">调整板块</button>
                      </template>
                      <button class="feedback-button" type="button" @click="openWorkflowHistory(item.id)">处理记录</button>
                    </div>
                    <div v-if="managementMenuOpen && !workflowMode && canMergeFeedback(item)" id="feedback-management-options" class="feedback-workflow-options" role="group" aria-label="管理操作选项">
                      <button class="feedback-button" type="button" @click="openMergeDialog">合并反馈</button>
                    </div>
                    <form v-if="workflowMode" ref="workflowForm" class="feedback-workflow-form" tabindex="-1" :aria-label="workflowModeLabel(workflowMode)" @submit.prevent="runWorkflow(workflowMode, item)">
                      <strong>{{ workflowModeLabel(workflowMode) }}</strong>
                      <label v-if="workflowMode === 'assign'">新运营负责人<select v-model="workflowTarget" required :disabled="assigneesLoading || !!assigneesError || !workflowAssignees.length"><option value="">选择运营负责人</option><option v-for="assignee in workflowAssignees" :key="assignee.id" :value="assignee.id">{{ assignee.userName }}（{{ assignee.id }}）</option></select></label>
                      <p v-if="workflowMode === 'assign' && assigneesLoading" class="feedback-workflow-hint" role="status">正在加载可转交的运营负责人…</p>
                      <p v-else-if="workflowMode === 'assign' && assigneesError" class="feedback-workflow-error" role="alert">{{ assigneesError }} <button type="button" @click="loadWorkflowAssignees(item.id)">重试</button></p>
                      <p v-else-if="workflowMode === 'assign' && !workflowAssignees.length" class="feedback-workflow-hint">当前板块没有其他可转交的运营负责人。</p>
                      <label v-if="workflowMode === 'area'">新的反馈板块<select v-model="workflowArea" required><option value="">选择板块</option><option v-for="area in categoryOptions" :key="area.key" :value="area.key">{{ feedbackCategoryLabel(area) }}</option></select></label>
                      <label>处理说明<textarea v-model.trim="workflowNote" rows="3" required maxlength="1000" /></label>
                      <div class="feedback-form-actions"><button class="feedback-button" type="button" @click="cancelWorkflow">取消</button><button class="feedback-primary-action" type="submit" :disabled="workflowBusy || (workflowMode === 'assign' && (assigneesLoading || !workflowTarget))">{{ workflowBusy ? '处理中…' : '确认' }}</button></div>
                    </form>
                  </div>
                  <div v-if="replyTarget === item.id" class="feedback-reply-form">
                    <div class="feedback-reply-tools">
                      <button class="feedback-button" type="button" :disabled="replying" @click="insertCurrentVersion">插入当前版本</button>
                      <code>{{ productVersionLabel }}</code>
                    </div>
                    <textarea ref="replyInput" v-model="replyContent" class="feedback-form-control" rows="3" maxlength="1000" aria-label="处理回复" placeholder="输入处理回复" @paste="handleReplyMediaPaste"></textarea>
                    <FeedbackAttachmentPicker :media="replyMedia" :busy="replying" />
                    <div class="feedback-form-actions">
                      <button class="feedback-button" type="button" :disabled="replying" @click="discardReply">取消</button>
                      <button class="feedback-primary-action" type="button" :disabled="replying || replyMedia.uploading || replyMedia.optimizing" @click="submitReply(item.id)">
                        <Send :size="16" />{{ replying ? '发送中…' : '发送回复' }}
                      </button>
                    </div>
                  </div>
                </div>
              </template>
            </FeedbackTicketWorkspace>
          </template>
        </div>
      </section>
    </main>

    <AdminFeedbackMergeDialog
      :open="mergeOpen"
      :source-id="selectedId"
      :source-title="selectedDetail?.title || selectedDetail?.content || selectedId"
      :busy="mergeBusy"
      :submit-error="mergeError"
      @close="mergeOpen = false"
      @confirm="confirmMerge"
    />
    <Teleport to="body">
      <div v-if="workflowHistoryOpen" class="modal-mask is-raised" role="presentation">
        <section ref="historyPanel" class="modal feedback-modal feedback-history-dialog" role="dialog" aria-modal="true" aria-labelledby="feedback-history-title" tabindex="-1">
          <header class="modal-head"><div><h2 id="feedback-history-title">处理记录</h2><small>工单 {{ selectedId }}</small></div><button ref="workflowHistoryCloseButton" type="button" aria-label="关闭处理记录" title="关闭" @click="closeWorkflowHistory"><X :size="20" aria-hidden="true" /></button></header>
          <div class="feedback-history-body">
            <p v-if="workflowEventsLoading" role="status">正在加载处理记录…</p>
            <p v-else-if="workflowEventsError" class="feedback-workflow-error" role="alert">{{ workflowEventsError }} <button type="button" @click="loadWorkflowEvents(selectedId)">重试</button></p>
            <ol v-else-if="workflowEvents.length" class="feedback-workflow-events"><li v-for="event in workflowEvents" :key="event.id"><div><b>{{ workflowActionLabel(event.action) }}</b><time v-if="event.createdAt" :datetime="event.createdAt">{{ formatDate(event.createdAt) }}</time></div><span v-if="event.actorUserId">操作人 {{ event.actorUserId }}</span><p v-if="event.note && event.note !== workflowActionLabel(event.action)">{{ event.note }}</p></li></ol>
            <p v-else>暂无处理记录</p>
          </div>
        </section>
      </div>
    </Teleport>
  </div>
</template>

<script setup>
import { subscribeFeedbackNotificationRefresh } from '../../store/notificationRealtime.js'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter, onBeforeRouteUpdate } from 'vue-router'
import { useModalFocus } from '@/composables/useModalFocus.js'
import { useUnsavedChanges } from '@/utils/useUnsavedChanges.js'
import { dialog } from '@/utils/dialog.js'
import { ArrowRight, CheckCheck, CheckCircle2, ChevronDown, CircleX, Info, MessageSquarePlus, Search, Send, ShieldAlert, X } from '@lucide/vue'
import IslandSidebar from '@/components/IslandSidebar.vue'
import AdminFeedbackMergeDialog from '@/components/feedback/AdminFeedbackMergeDialog.vue'
import FeedbackAttachmentPicker from '@/components/feedback/FeedbackAttachmentPicker.vue'
import FeedbackTicketDetail from '@/components/feedback/FeedbackTicketDetail.vue'
import FeedbackTicketWorkspace from '@/components/feedback/FeedbackTicketWorkspace.vue'
import { feedbackCategoryLabel } from '@/utils/feedbackCategories.js'
import {
  appendManagedFeedbackMessage,
  claimFeedback,
  assignFeedback,
  changeFeedbackWorkArea,
  listFeedbackWorkflowEvents,
  listFeedbackAssignees,
  getManagedFeedback,
  getFeedbackAccess,
  getFeedbackQueueCounts,
  listWorkflowFeedback,
  mergeFeedback,
  updateManagedFeedbackStatus
} from '@/api/feedback.js'
import { auth } from '@/store/auth.js'
import * as feedbackUnreadStore from '@/store/feedbackUnread.js'
import { useFeedbackMedia } from '@/utils/feedbackMedia.js'
import { productVersionLabel } from '@/config/buildInfo.js'
import '@/styles/page-header.css'

const { feedbackUnreadState, subscribeFeedbackUnread } = feedbackUnreadStore
const statusTabs = [
  { key: 'UNASSIGNED', label: '待接单' },
  { key: 'CLAIMED', label: '已接单' },
  { key: 'CLOSED', label: '已结束' },
  { key: 'ALL', label: '全部' }
]
const route = useRoute()
const router = useRouter()
const feedbacks = ref([])
const rawAccess = ref({ superAdmin: false, operatorAreas: [], availableWorkAreas: [] })
const access = computed(() => {
  const keys = new Set(categoryCatalog.value.map(option => option.key))
  return { ...rawAccess.value,
    operatorAreas: rawAccess.value.operatorAreas.filter(key => keys.has(key)),
    availableWorkAreas: rawAccess.value.availableWorkAreas.filter(option => keys.has(option.key))
  }
})
const categoryCatalog = ref([])
const loadingAccess = ref(true)
const loading = ref(false)
const error = ref('')
const page = ref(1)
const pageSize = ref(20)
const totalCount = ref(0)
const q = ref('')
const sort = ref('latest')
const queueCounts = ref({})
const queueCountError = ref('')
const pageMessage = ref('')
const filterStatus = ref('UNASSIGNED')
const filterCategory = ref('')
const onlyNeedsReply = ref(false)
const onlyMine = ref(false)
const selectedId = ref('')
const selectedDetail = ref(null)
const detailLoading = ref(false)
const detailError = ref('')
const replyTarget = ref('')
const replyContent = ref('')
const replyInput = ref(null)
const replying = ref(false)
const updatingStatus = ref(false)
const markingAllRead = ref(false)
const mergeOpen = ref(false)
const mergeBusy = ref(false)
const mergeError = ref('')
const managementMenuOpen = ref(false)
const managementMenuButton = ref(null)
const workflowMode = ref('')
const workflowTarget = ref('')
const workflowArea = ref('')
const workflowNote = ref('')
const workflowBusy = ref(false)
const workflowMenuOpen = ref(false)
const workflowMenuButton = ref(null)
const workflowToolbar = ref(null)
const workflowForm = ref(null)
const workflowMessage = ref('')
const workflowHistoryOpen = ref(false)
const workflowHistoryCloseButton = ref(null)
const historyPanel = ref(null)
const historyButton = ref(null)
const workflowEvents = ref([])
const workflowEventsLoading = ref(false)
const workflowEventsError = ref('')
const workflowAssignees = ref([])
const assigneesLoading = ref(false)
const assigneesError = ref('')
const replyMedia = useFeedbackMedia()
const draftDirty = computed(() => Boolean(
  (replyTarget.value && (replyContent.value.trim() || replyMedia.items.length)) ||
  (workflowMode.value && workflowNote.value.trim())
))
onBeforeRouteUpdate(() => !(workflowBusy.value || updatingStatus.value || replying.value || mergeBusy.value || markingAllRead.value))
const confirmDraftDiscard = useUnsavedChanges(draftDirty, '回复或流转草稿')
useModalFocus(() => workflowHistoryOpen.value, historyPanel, {
  initialFocus: () => workflowHistoryCloseButton.value,
  onEscape: closeWorkflowHistory
})
const actionBusy = computed(() => workflowBusy.value || updatingStatus.value || replying.value || detailLoading.value)
let isMounted = false
let ready = false
let loadRequestId = 0
let detailRequestId = 0
let workflowEventsRequestId = 0
let assigneesRequestId = 0
let queueCountRequestId = 0
let feedbackRefreshTimer = null
let stopFeedbackUnread = null

const hasManagePermission = computed(() => access.value.superAdmin || access.value.operatorAreas.length > 0)
const primaryQueues = statusTabs.slice(0, 2)
const secondaryQueues = statusTabs.slice(2)
const categoryOptions = computed(() => {
  const all = access.value.availableWorkAreas
  return access.value.superAdmin ? all : all.filter(option => access.value.operatorAreas.includes(option.key))
})
const totalPages = computed(() => Math.max(1, Math.ceil(totalCount.value / pageSize.value)))
const unreadFeedbackIds = computed(() => feedbackUnreadState.ids)
const unreadCount = computed(() => unreadFeedbackIds.value.length)
const markAllReadHint = computed(() => unreadCount.value > 0
  ? `将全部 ${unreadCount.value} 条未读反馈标记为已读`
  : '当前没有未读反馈')

function categoryLabel(category) {
  const option = categoryCatalog.value.find(option => option.key === category)
  return option ? feedbackCategoryLabel(option) : category || '其他模块'
}

function statusLabel(status, hasAdminReply, item) {
  if (item?.mergedIntoId) return '已合并'
  if (status === 'OPEN') return { UNASSIGNED: '待接单', PROCESSING: '已接单' }[item?.workflowStage] || '待接单'
  return { RESOLVED: '已完成', DISMISSED: '已驳回' }[status] || status || '未知状态'
}

function canManageSettings(item) {
  return Boolean(item?.viewerCanManage && item.workflowStage !== 'UNASSIGNED' && !item.mergedIntoId)
}

function canMergeFeedback(item) {
  if (item?.source === 'maayuan_diagnostic') return false
  return canManageSettings(item) && item.status === 'OPEN' && !item.mergedCount
}

function formatDate(value) {
  if (!value) return ''
  return new Date(value).toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
}

function currentUserId() {
  const user = auth.userInfo
  return user && (user.id || user.userId || user.user_id) ? String(user.id || user.userId || user.user_id) : ''
}

async function loadQueueCounts() {
  const requestId = ++queueCountRequestId
  const userId = currentUserId()
  queueCountError.value = ''
  try {
    const counts = await getFeedbackQueueCounts(statusTabs.map(tab => tab.key), {
      mine: onlyMine.value,
      needsReply: onlyNeedsReply.value,
      workArea: filterCategory.value || undefined,
      q: q.value.trim() || undefined
    })
    if (isMounted && requestId === queueCountRequestId && userId === currentUserId()) queueCounts.value = counts
  } catch (e) {
    if (!isMounted || requestId !== queueCountRequestId || userId !== currentUserId()) return
    queueCounts.value = {}
    if (!await handleForbidden(e)) queueCountError.value = '队列数量暂不可用'
  }
}

async function loadAccess() {
  loadingAccess.value = true
  try {
    const data = await getFeedbackAccess()
    if (!isMounted) return
    const rawAreas = data.availableCategories || data.available_categories || data.availableAreas || data.available_areas || []
    const catalog = data.categoryCatalog || data.category_catalog || rawAreas
    if (!catalog.length) throw new Error('反馈板块目录为空')
    categoryCatalog.value = catalog
    rawAccess.value = {
      superAdmin: Boolean(data.superAdmin ?? data.super_admin),
      operatorAreas: data.operatorAreas || data.operator_areas || [],
      availableWorkAreas: rawAreas
    }
  } catch (e) {
    if (isMounted && !await handleForbidden(e)) error.value = e.message || '反馈权限加载失败'
  } finally {
    loadingAccess.value = false
  }
}

async function loadFeedback({ background = false } = {}) {
  if (!isMounted || !hasManagePermission.value || (background && loading.value)) return
  const requestId = ++loadRequestId
  if (!background) {
    loading.value = true
    error.value = ''
    queueCounts.value = {}
  }
  void loadQueueCounts()
  try {
    const data = await listWorkflowFeedback({
      page: page.value,
      pageSize: pageSize.value,
      queue: filterStatus.value,
      mine: onlyMine.value,
      needsReply: onlyNeedsReply.value,
      workArea: filterCategory.value || undefined,
      q: q.value.trim() || undefined,
      sortBy: sort.value === 'updated' ? 'updatedAt' : 'createdAt',
      sortOrder: sort.value === 'oldest' ? 'asc' : 'desc'
    })
    if (requestId !== loadRequestId) return
    totalCount.value = Number(data.total ?? data.items?.length ?? 0)
    if (page.value > totalPages.value) {
      page.value = totalPages.value
      await loadFeedback({ background })
      return
    }
    feedbacks.value = data.items || []
  } catch (e) {
    if (requestId === loadRequestId && !await handleForbidden(e) && !background) error.value = e.message || '反馈加载失败'
  } finally {
    if (requestId === loadRequestId && !background) loading.value = false
  }
}

async function reloadFromFirstPage() {
  if (!await closeDetail()) return
  page.value = 1
  await loadFeedback()
}

async function changeListOption(key, event) {
  const model = { category: filterCategory, sort, pageSize }[key]
  const input = event.target
  const next = input.value
  input.value = String(model.value)
  if (!await closeDetail()) return
  model.value = key === 'pageSize' ? Number(next) : next
  page.value = 1
  await loadFeedback()
}

async function toggleClaimedFilter(key) {
  if (!await closeDetail()) return
  const filter = key === 'mine' ? onlyMine : onlyNeedsReply
  filter.value = !filter.value
  page.value = 1
  await loadFeedback()
}

async function setFilter(status) {
  if (filterStatus.value === status.key) return
  if (!await closeDetail()) return
  filterStatus.value = status.key
  page.value = 1
  await loadFeedback()
}

function closeListSettings(event) {
  const settings = event.currentTarget
  if (!settings.open) return
  event.preventDefault()
  event.stopPropagation()
  settings.open = false
  settings.querySelector('summary')?.focus()
}

function dismissListSettingsOnBlur(event) {
  const settings = event.currentTarget
  const next = event.relatedTarget
  if (settings.open && next && !settings.contains(next) && !next.closest?.('[role="dialog"]')) settings.open = false
}

function searchFeedback() {
  reloadFromFirstPage()
}

async function markAllUnreadFeedback() {
  if (markingAllRead.value || feedbackUnreadState.loading || unreadCount.value === 0) return
  const markAllRead = feedbackUnreadStore.markAllManagedFeedbackRead
  if (typeof markAllRead !== 'function') return
  const userId = currentUserId()
  const count = unreadCount.value
  markingAllRead.value = true
  try {
    const confirmed = await dialog.confirm({
      title: '将全部反馈标为已读？',
      message: `将 ${count} 条未读反馈标为已读，包含当前筛选之外的工单。此操作不会完成或结案工单。`,
      confirmText: '全部标为已读', cancelText: '取消'
    })
    if (!confirmed || !isMounted || userId !== currentUserId()) return
    await markAllRead()
    if (isMounted && userId === currentUserId()) pageMessage.value = '全部未读反馈已标为已读，工单处理状态未改变。'
  } catch (e) {
    if (isMounted && userId === currentUserId()) pageMessage.value = e.message || '标为已读失败，请重试。'
  } finally {
    markingAllRead.value = false
  }
}

async function changePage(nextPage) {
  if (nextPage < 1 || nextPage > totalPages.value || loading.value) return
  if (!await closeDetail()) return
  page.value = nextPage
  await loadFeedback()
}

async function selectTicket(id) {
  const nextId = String(id)
  if (nextId !== selectedId.value) await changeSelectedTicket(nextId)
}

function replaceTicketQuery(id) {
  const query = { ...route.query }
  delete query.space
  if (id) query.id = id
  else delete query.id
  return router.replace({ query })
}

function openTicket(id) {
  if (!id || !hasManagePermission.value) return
  selectedId.value = id
  selectedDetail.value = { id }
  void loadFeedbackDetail(id)
}

function handleReplyMediaPaste(event) {
  if (replying.value) return
  replyMedia.handlePaste(event)
}

function isCurrentDetail(requestId, id, userId) {
  return isMounted && requestId === detailRequestId && selectedId.value === id && currentUserId() === userId
}

async function loadFeedbackDetail(id, { background = false } = {}) {
  const requestId = ++detailRequestId
  const userId = currentUserId()
  if (!background) resetWorkflowHistory()
  if (!background) detailLoading.value = true
  detailError.value = ''
  try {
    const detail = await getManagedFeedback(id)
    if (!isCurrentDetail(requestId, id, userId)) return
    if (background) Object.assign(selectedDetail.value, detail)
    else replaceTicket(detail)
    await nextTick()
    if (!isCurrentDetail(requestId, id, userId)) return
    selectedId.value = id
    void feedbackUnreadStore.refreshFeedbackUnread({ force: true })
    return true
  } catch (e) {
    if (isCurrentDetail(requestId, id, userId) && !await handleForbidden(e)) detailError.value = e.message || '详情加载失败'
  } finally {
    if (isCurrentDetail(requestId, id, userId)) detailLoading.value = false
  }
}

function replaceTicket(detail) {
  selectedDetail.value = detail
  const index = feedbacks.value.findIndex(item => item.id === detail.id)
  if (index >= 0) feedbacks.value.splice(index, 1, detail)
}

function closeDetail() {
  return changeSelectedTicket('')
}

async function changeSelectedTicket(nextId) {
  if (!nextId && !selectedId.value && !route.query.id) return true
  if (workflowBusy.value || mergeBusy.value || markingAllRead.value) return false
  const requestId = detailRequestId
  const userId = currentUserId()
  if (draftDirty.value && (!await confirmDraftDiscard() || !isMounted || requestId !== detailRequestId || userId !== currentUserId())) return false
  resetDetail()
  openTicket(nextId)
  if (nextId || route.query.id) await replaceTicketQuery(nextId)
  return true
}

function resetDetail() {
  detailRequestId += 1
  assigneesRequestId += 1
  detailLoading.value = false
  replying.value = false
  updatingStatus.value = false
  selectedId.value = ''
  selectedDetail.value = null
  detailError.value = ''
  cancelReply()
  mergeOpen.value = false
  mergeBusy.value = false
  workflowMode.value = ''
  workflowMenuOpen.value = false
  managementMenuOpen.value = false
  workflowMessage.value = ''
  resetWorkflowHistory()
  workflowAssignees.value = []
  assigneesLoading.value = false
  assigneesError.value = ''
}

function openWorkflow(mode) {
  assigneesRequestId += 1
  workflowMenuOpen.value = false
  managementMenuOpen.value = false
  workflowMode.value = mode
  workflowTarget.value = ''
  workflowArea.value = selectedDetail.value?.workArea || ''
  workflowNote.value = ''
  workflowMessage.value = ''
  detailError.value = ''
  workflowAssignees.value = []
  assigneesError.value = ''
  assigneesLoading.value = false
  if (mode === 'assign' && selectedId.value) void loadWorkflowAssignees(selectedId.value)
  if (mode) nextTick(() => workflowForm.value?.focus())
}

async function cancelWorkflow() {
  const requestId = detailRequestId
  const userId = currentUserId()
  if (!await confirmDraftDiscard() || !isMounted || requestId !== detailRequestId || userId !== currentUserId()) return
  openWorkflow('')
  nextTick(() => workflowToolbar.value?.querySelector('button')?.focus())
}

function toggleWorkflowMenu() {
  const next = !workflowMenuOpen.value
  openWorkflow('')
  workflowMenuOpen.value = next
}

function toggleManagementMenu() {
  managementMenuOpen.value = !managementMenuOpen.value
  workflowMenuOpen.value = false
}

function workflowModeLabel(mode) {
  return { takeover: '接手工单', assign: '转交运营', area: '调整板块' }[mode] || ''
}

async function loadWorkflowAssignees(id) {
  const requestId = ++assigneesRequestId
  assigneesLoading.value = true
  assigneesError.value = ''
  try {
    const users = await listFeedbackAssignees(id)
    if (requestId === assigneesRequestId && selectedId.value === id && workflowMode.value === 'assign') workflowAssignees.value = users
  } catch (e) {
    if (requestId === assigneesRequestId && selectedId.value === id && workflowMode.value === 'assign' && !await handleForbidden(e)) assigneesError.value = e.message || '运营负责人加载失败'
  } finally {
    if (requestId === assigneesRequestId) assigneesLoading.value = false
  }
}

function workflowActionLabel(action) {
  return { CLAIM: '接单', ASSIGN: '转交运营', HANDOFF: '转程序', CHANGE_AREA: '调整板块', RETURN: '交回运营', WITHDRAW: '撤回交接', MIGRATE_WORKFLOW: '流转迁移', REQUEUE: '重新待接单', DISMISS: '驳回工单' }[action] || action
}

function resetWorkflowHistory() {
  workflowEventsRequestId += 1
  workflowHistoryOpen.value = false
  workflowEvents.value = []
  workflowEventsLoading.value = false
  workflowEventsError.value = ''
}

function openWorkflowHistory(id) {
  workflowMenuOpen.value = false
  workflowHistoryOpen.value = true
  workflowEvents.value = []
  void loadWorkflowEvents(id)
  nextTick(() => workflowHistoryCloseButton.value?.focus())
}

function closeWorkflowHistory() {
  workflowEventsRequestId += 1
  workflowHistoryOpen.value = false
  workflowEventsLoading.value = false
  nextTick(() => (historyButton.value || workflowMenuButton.value)?.focus())
}

async function loadWorkflowEvents(id) {
  const requestId = ++workflowEventsRequestId
  const detailId = detailRequestId
  const userId = currentUserId()
  workflowEventsLoading.value = true
  workflowEventsError.value = ''
  try {
    const events = await listFeedbackWorkflowEvents(id)
    if (requestId === workflowEventsRequestId && isCurrentDetail(detailId, id, userId) && workflowHistoryOpen.value) {
      workflowEvents.value = events
    }
  } catch (e) {
    if (requestId === workflowEventsRequestId && isCurrentDetail(detailId, id, userId) && workflowHistoryOpen.value && !await handleForbidden(e)) workflowEventsError.value = e.message || '处理记录加载失败'
  } finally {
    if (requestId === workflowEventsRequestId) workflowEventsLoading.value = false
  }
}

async function runWorkflow(mode, item) {
  if (workflowBusy.value || !item?.id) return
  const note = workflowNote.value.trim()
  const actionLabel = { claim: '接单', takeover: '接手', assign: '转交运营', area: '调整板块' }[mode]
  if (mode !== 'claim' && !note) { detailError.value = '请填写处理说明'; return }
  if (mode === 'assign' && !workflowAssignees.value.some(user => user.id === workflowTarget.value)) { detailError.value = '请选择可转交的运营负责人'; return }
  if (mode === 'area' && !workflowArea.value) { detailError.value = '请选择反馈板块'; return }
  if (mode !== 'claim' && !window.confirm(`${actionLabel}工单 ${item.id}？${mode === 'assign' ? `新负责人：${workflowTarget.value}` : ''}`)) return
  const requestId = detailRequestId
  const userId = currentUserId()
  workflowBusy.value = true
  detailError.value = ''
  try {
    const detail = mode === 'claim' ? await claimFeedback(item.id)
      : mode === 'takeover' ? await assignFeedback(item.id, userId, note)
        : mode === 'assign' ? await assignFeedback(item.id, workflowTarget.value, note)
          : await changeFeedbackWorkArea(item.id, workflowArea.value, note)
    if (!isCurrentDetail(requestId, item.id, userId)) return
    replaceTicket(detail)
    workflowMode.value = ''
    workflowMenuOpen.value = false
    workflowMessage.value = mode === 'claim' ? '接单成功，工单已移至「已接单」' : `${actionLabel}成功`
    void loadFeedback({ background: true })
  } catch (e) {
    if (isCurrentDetail(requestId, item.id, userId) && !await handleForbidden(e)) {
      detailError.value = e.message || `${actionLabel}失败`
      if (e.status === 409) { void loadFeedback({ background: true }); void loadFeedbackDetail(item.id) }
    }
  } finally {
    workflowBusy.value = false
  }
}

function openMergeDialog() {
  if (!canMergeFeedback(selectedDetail.value)) return
  managementMenuButton.value?.focus()
  managementMenuOpen.value = false
  workflowMessage.value = ''
  mergeError.value = ''
  mergeOpen.value = true
}

async function confirmMerge(targetId) {
  const id = selectedId.value
  if (!id || mergeBusy.value) return
  const requestId = detailRequestId
  const userId = currentUserId()
  mergeBusy.value = true
  mergeError.value = ''
  try {
    const detail = await mergeFeedback(id, targetId)
    if (!isCurrentDetail(requestId, id, userId)) return
    replaceTicket(detail)
    mergeOpen.value = false
    workflowMessage.value = '已合并到主反馈；后续进度统一跟随主反馈。'
  } catch (e) {
    if (isCurrentDetail(requestId, id, userId) && !await handleForbidden(e)) mergeError.value = e.message || '合并失败'
  } finally {
    mergeBusy.value = false
  }
}

function showReplyForm(id) {
  workflowMenuOpen.value = false
  managementMenuOpen.value = false
  detailError.value = ''
  replyMedia.clear()
  replyTarget.value = id
  replyContent.value = ''
  nextTick(() => replyInput.value?.focus())
}

function cancelReply() {
  replyMedia.clear()
  replyTarget.value = ''
  replyContent.value = ''
}

function insertCurrentVersion() {
  const input = replyInput.value
  if (!input || replying.value) return
  if (input.value.length - (input.selectionEnd - input.selectionStart) + productVersionLabel.length > input.maxLength) {
    detailError.value = '插入版本后消息长度将超过 1000 字符，请先缩短回复或选中文字替换'
    return
  }
  input.setRangeText(productVersionLabel, input.selectionStart, input.selectionEnd, 'end')
  replyContent.value = input.value
  detailError.value = ''
  input.focus()
}

async function discardReply() {
  const requestId = detailRequestId
  const userId = currentUserId()
  if (!await confirmDraftDiscard() || !isMounted || requestId !== detailRequestId || userId !== currentUserId()) return
  cancelReply()
  nextTick(() => workflowToolbar.value?.querySelector('button')?.focus())
}

async function submitReply(id) {
  const content = replyContent.value.trim()
  if (!content || replying.value || updatingStatus.value || detailLoading.value) return
  if (content.length > 1000) {
    detailError.value = '消息长度不能超过 1000 字符'
    return
  }
  const requestId = detailRequestId
  const userId = currentUserId()
  replying.value = true
  detailError.value = ''
  try {
    const mediaIds = await replyMedia.uploadAll()
    if (!isCurrentDetail(requestId, id, userId)) return
    const detail = await appendManagedFeedbackMessage(id, { content, mediaIds })
    if (!isCurrentDetail(requestId, id, userId)) return
    replaceTicket(detail)
    cancelReply()
  } catch (e) {
    if (isCurrentDetail(requestId, id, userId) && !await handleForbidden(e)) detailError.value = e.message || '发送失败'
  } finally {
    if (isCurrentDetail(requestId, id, userId)) replying.value = false
  }
}

async function updateStatus(id, status) {
  if (updatingStatus.value || replying.value || detailLoading.value) return
  const requestId = detailRequestId
  const userId = currentUserId()
  updatingStatus.value = true
  detailError.value = ''
  try {
    const reason = status === 'DISMISSED' ? await dialog.prompt({
      title: '驳回反馈', inputLabel: '驳回原因', placeholder: '请填写具体原因', maxLength: null,
      message: '驳回后用户将无法继续补充，管理员仍可重新打开。', confirmText: '确认驳回', type: 'danger'
    }) : null
    if (!isCurrentDetail(requestId, id, userId)) return
    if (status === 'DISMISSED' && !reason?.trim()) return
    if (status !== 'DISMISSED') {
      const confirmed = await dialog.confirm({
        title: status === 'RESOLVED' ? '确认问题已解决？' : '重新打开反馈？',
        message: status === 'RESOLVED' ? '结案后用户将无法继续补充，管理员仍可重新打开。请先确认问题已解决。' : '重新打开后，用户可以继续补充说明与附件。',
        confirmText: status === 'RESOLVED' ? '标记完成' : '重新打开'
      })
      if (!confirmed || !isCurrentDetail(requestId, id, userId)) return
    }
    await updateManagedFeedbackStatus(id, status, reason, true)
    if (!isCurrentDetail(requestId, id, userId)) return
    resetDetail()
    pageMessage.value = { RESOLVED: '反馈已完成并结案。', DISMISSED: '反馈已驳回，原因已记录。', OPEN: '反馈已重新打开。' }[status]
    await Promise.all([replaceTicketQuery(''), loadFeedback()])
  } catch (e) {
    if (isCurrentDetail(requestId, id, userId) && !await handleForbidden(e)) detailError.value = e.message || '操作失败'
  } finally {
    if (isCurrentDetail(requestId, id, userId)) updatingStatus.value = false
  }
}

async function handleForbidden(value) {
  if (!isMounted || !value || value.status !== 403) return false
  loadRequestId += 1
  feedbacks.value = []
  queueCountRequestId += 1
  resetDetail()
  await router.replace({ path: '/forbidden', query: { from: '/feedback/manage' } })
  return true
}

let stopNotificationRefresh = null

async function refreshOpenFeedback(notification) {
  if (!isMounted || detailLoading.value || selectedId.value !== String(notification.refId)) return false
  const id = selectedId.value
  return await loadFeedbackDetail(id, { background: true }) === true
}

onMounted(async () => {
  isMounted = true
  stopNotificationRefresh = subscribeFeedbackNotificationRefresh(refreshOpenFeedback)
  stopFeedbackUnread = subscribeFeedbackUnread()
  await loadAccess()
  if (!isMounted) return
  if (!hasManagePermission.value) return
  await loadFeedback()
  if (!isMounted) return
  ready = true
  feedbackRefreshTimer = setInterval(() => {
    if (hasManagePermission.value) loadFeedback({ background: true })
  }, 30000)
  if (route.query.id) openTicket(String(route.query.id))
})

watch(() => route.query.id, id => {
  if (!isMounted || !ready) return
  const nextId = id ? String(id) : ''
  if (nextId === selectedId.value) return
  resetDetail()
  openTicket(nextId)
}, { flush: 'sync' })

onBeforeUnmount(() => {
  if (stopNotificationRefresh) stopNotificationRefresh()
  isMounted = false
  ready = false
  loadRequestId += 1
  detailRequestId += 1
  queueCountRequestId += 1
  if (feedbackRefreshTimer) {
    clearInterval(feedbackRefreshTimer)
    feedbackRefreshTimer = null
  }
  if (stopFeedbackUnread) stopFeedbackUnread()
})
</script>

<style src="../../styles/feedback-workspace.css"></style>
<style src="../../styles/feedback-workspaceDesktop.css"></style>
<style src="../../styles/feedback-workspaceMobile.css"></style>
<style scoped>
/* 刻意共享字段外观与动效；布局和密度由独立双端文件持有。 */
.permission-state { border: 1px solid var(--feedback-line); background: var(--feedback-panel); color: var(--feedback-text-muted); }
.permission-state strong { color: var(--feedback-text); }
.permission-state .feedback-primary-action { text-decoration: none; }
.feedback-merge-relations { border: 1px solid var(--feedback-line); border-radius: 8px; background: var(--feedback-panel); }
.feedback-merge-relations strong { color: var(--feedback-text); }
.feedback-merge-relations a { border: 1px solid var(--feedback-line); border-radius: 6px; background: var(--surface); color: var(--feedback-text); text-decoration: underline; text-underline-offset: 2px; }
.feedback-merge-relations a:focus-visible { outline: 2px solid var(--theme-focus, var(--accent)); outline-offset: 2px; }
.feedback-management-summary { color: var(--feedback-text-muted); }
.feedback-queue-note, .feedback-read-tools { color: var(--feedback-text-muted); }
.feedback-reply-tools code { color: var(--feedback-text-muted); }
.feedback-reply-tools button:focus-visible { outline: 2px solid var(--theme-focus, var(--accent)); outline-offset: 2px; }
.feedback-workflow-options { border: 1px solid var(--feedback-line); border-radius: 8px; background: var(--feedback-panel); }
.feedback-workflow-form { border: 1px solid var(--feedback-line); border-radius: 8px; background: var(--feedback-panel); }
.feedback-workflow-form > strong { color: var(--feedback-text); }
.feedback-workflow-form label { color: var(--feedback-text); }
.feedback-workflow-form select, .feedback-workflow-form textarea { border: 1px solid var(--feedback-line); border-radius: 7px; background: var(--surface); color: var(--feedback-text); }
.feedback-workflow-form select:focus-visible, .feedback-workflow-form textarea:focus-visible { outline: 2px solid var(--theme-focus, var(--accent)); outline-offset: 2px; }
.feedback-workflow-hint, .feedback-workflow-error { color: var(--feedback-text-muted); }
.feedback-workflow-error { color: var(--feedback-danger); }
.feedback-workflow-error button { border: 0; background: none; color: inherit; text-decoration: underline; cursor: pointer; }
.feedback-workflow-message { border-left: 3px solid var(--feedback-success); border-radius: 5px; background: var(--feedback-panel); color: var(--feedback-text); }
.feedback-history-dialog .modal-head small { color: var(--feedback-text-dim); }
.feedback-history-body > p { color: var(--feedback-text-muted); }
.feedback-history-body > .feedback-workflow-error { color: var(--feedback-danger); }
.feedback-workflow-events li { border: 1px solid var(--feedback-line); border-radius: 7px; background: var(--surface); }
.feedback-workflow-events b { color: var(--feedback-text); }
.feedback-workflow-events time, .feedback-workflow-events span { color: var(--feedback-text-dim); }
.feedback-workflow-events p { color: var(--feedback-text-muted); }

.feedback-manage-header.page-header.page-header--mobile-context { padding-block: 8px; }
.feedback-manage-header .page-header-row { grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: 8px; }
.feedback-manage-header.page-header.page-header--keep-title .page-header-title { grid-column: 1; grid-row: 1; align-self: center; margin: 0; font-size: clamp(19px, 2vw, 24px); }
.feedback-manage-header .page-header-back { margin: 0; white-space: nowrap; }

.feedback-work-controls {
  display: grid;
  grid-template-areas: "queues" "settings" "toolbar";
  grid-template-columns: minmax(0, 1fr);
  align-items: center;
  gap: 8px 12px;
  margin-top: 8px;
  padding: 10px 12px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--surface);
}
.feedback-work-controls:has(.feedback-queue-error) { grid-template-areas: "queues" "settings" "error" "toolbar"; }
.feedback-queue-bar { grid-area: queues; min-width: 0; }
.feedback-list-settings {
  grid-area: settings;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-end;
  gap: 5px 10px;
  min-width: 0;
}
.feedback-list-settings > .feedback-result-meta { flex: 0 1 auto; font-size: 12px; color: var(--ink-60); }
.feedback-queue-error { grid-area: error; margin: 0; }
.feedback-work-controls .feedback-manage-toolbar {
  grid-area: toolbar;
  margin: 0;
  padding: 0;
  border: 0;
  background: transparent;
  box-shadow: none;
  backdrop-filter: none;
}
.feedback-manage-toolbar .feedback-filter { font-size: 12px; color: var(--ink-60); }
.feedback-management-settings { position: relative; max-width: 100%; }
.feedback-management-settings summary { width: fit-content; min-height: var(--control-h-sm); padding-inline: 10px; font-size: 12px; font-weight: 600; }
.feedback-management-settings-body {
  position: absolute;
  z-index: var(--z-popover);
  inset-block-start: calc(100% + 4px);
  inset-inline-end: 0;
  width: min(300px, calc(100vw - 36px));
  display: grid;
  gap: 10px;
  padding: 12px;
}

@media (min-width: 768px) {
  .feedback-work-controls {
    grid-template-areas: "queues settings" "toolbar toolbar";
    grid-template-columns: minmax(0, 1fr) auto;
  }
  .feedback-work-controls:has(.feedback-queue-error) { grid-template-areas: "queues settings" "error error" "toolbar toolbar"; }
  .feedback-manage-toolbar .feedback-filter select { max-inline-size: 240px; }
}

.detail-action-area {
  position: sticky;
  z-index: var(--z-sticky-low);
  bottom: 0;
  flex: none;
  max-height: calc(var(--ticket-detail-height, 100dvh) * .55);
  overflow-y: auto;
  overscroll-behavior-y: contain;
  display: grid;
  gap: 10px;
  padding: 10px 16px 12px;
  border-top: 1px solid var(--line);
  border-radius: 0 0 7px 7px;
  background: var(--surface);
}
.detail-action-area > :empty { display: none; }
.detail-action-area:not(:has(button, [role="status"], .feedback-workflow-error)) { display: none; }
.detail-action-area .feedback-reply-form { margin-top: 0; }
.feedback-primary-queues:not(:empty) + .feedback-secondary-queues:not(:empty) { border-inline-start: 1px solid var(--line); }
.feedback-work-queues button,
.feedback-queue-help summary { border: 0; border-radius: 7px; background: transparent; color: var(--ink-60); cursor: pointer; }
.feedback-work-queues button { font: 600 13px var(--font-b); color: var(--ink); }
.feedback-queue-count { font: 400 12px var(--font-d); font-variant-numeric: tabular-nums; color: var(--ink-60); }
.feedback-work-queues button:hover,
.feedback-queue-help summary:hover,
.feedback-queue-help[open] summary { background: var(--surface); color: var(--theme-accent-text, var(--accent-strong)); }
.feedback-claimed-filters { display: flex; flex-wrap: wrap; gap: 6px; }
.feedback-claimed-filters [aria-pressed="true"] { background: var(--feedback-accent-soft); border-color: var(--accent); color: var(--theme-accent-text, var(--accent-strong)); }
.feedback-work-queues button.on { background: var(--feedback-accent-soft); color: var(--theme-accent-text, var(--accent-strong)); box-shadow: inset 0 -2px var(--accent); }
.feedback-work-queues button.on .feedback-queue-count { color: inherit; }
.feedback-work-queues button:focus-visible,
.feedback-queue-help summary:focus-visible,
.feedback-management-settings summary:focus-visible { outline: 2px solid var(--theme-focus, var(--accent)); outline-offset: -2px; }
.feedback-queue-help summary,
.feedback-management-settings summary { list-style: none; }
.feedback-queue-help summary::-webkit-details-marker,
.feedback-management-settings summary::-webkit-details-marker { display: none; }
.feedback-queue-note,
.feedback-management-settings-body { border: 1px solid var(--line); border-radius: 8px; background: var(--surface); }
.feedback-management-settings[open] summary svg { transform: rotate(180deg); }
</style>
<style scoped src="./feedbackManageDesktop.css"></style>
<style scoped src="./feedbackManageMobile.css"></style>
