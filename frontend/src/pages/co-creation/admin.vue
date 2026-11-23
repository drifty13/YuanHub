<template>
  <div class="feedback-page">
    <IslandSidebar />
    <main id="main-content">
      <header class="page-header page-header--mobile-context"><div class="wrap">
        <router-link class="page-header-back" to="/manage" aria-label="返回管理工作台"><ArrowLeft :size="16" aria-hidden="true" /> 返回管理工作台</router-link>
        <h1 class="page-header-title">开发目标管理</h1>
        <p class="page-header-description">规划开发目标、维护验收进度。</p>
      </div></header>
      <section class="feedback-content"><div class="wrap">
        <div class="goal-workspace-toolbar">
          <h2>开发目标</h2>
          <router-link class="goal-public-view" to="/co-creation">查看公开开发目标</router-link>
          <button class="feedback-primary-action goal-create-action" type="button" :disabled="busy" @click="openEditor()"><Plus :size="18" aria-hidden="true" />新增目标</button>
        </div>
        <p v-if="notice" role="status" class="goal-save-notice">{{ notice }}</p>
        <form v-if="form" class="goal-editor" aria-label="开发目标编辑" @submit.prevent="save">
          <h2>{{ editingId ? '编辑开发目标' : '新增开发目标' }}</h2>
          <p class="goal-admin-context">保存后立即展示给所有用户，请只填写适合公开的内容。</p>
          <fieldset :disabled="busy">
            <label class="full">目标标题<input ref="titleInput" v-model="form.title" class="feedback-form-control" required maxlength="120" /></label>
            <label class="full">目标说明<textarea v-model="form.description" class="feedback-form-control" required rows="4" maxlength="3000" placeholder="说明要解决什么问题，以及预期交付什么" /></label>
            <label>推进阶段<select v-model="form.stage" class="feedback-form-control"><option v-for="stage in DEVELOPMENT_STAGES" :key="stage.key" :value="stage.key">{{ stage.label }}</option></select></label>
            <label>目标版本（可选）<input v-model="form.targetVersion" class="feedback-form-control" maxlength="80" placeholder="例如 0.2.0" /></label>
            <label>目标日期（可选）<input v-model="form.targetDate" class="feedback-form-control" type="date" /></label>
            <section class="full criteria-editor" aria-label="验收清单">
              <h3>验收标准</h3><p>勾选表示已确认通过。全部通过后才可以标记目标完成。</p>
              <div v-for="(criterion, index) in form.criteria" :key="index" class="criterion-row">
                <label class="criterion-check"><input v-model="criterion.completed" type="checkbox" :aria-label="'第 ' + (index + 1) + ' 项已通过验收'" /></label>
                <input v-model="criterion.title" class="feedback-form-control" required maxlength="200" :aria-label="'第 ' + (index + 1) + ' 项验收标准'" placeholder="可明确判断是否完成的交付标准" />
                <button class="feedback-button" type="button" :disabled="form.criteria.length <= 1" :aria-label="'移除第 ' + (index + 1) + ' 项验收标准'" @click="form.criteria.splice(index, 1)">移除</button>
              </div>
              <button class="feedback-button" type="button" :disabled="form.criteria.length >= 20" @click="form.criteria.push({ title: '', completed: false })">添加验收标准</button>
            </section>
          </fieldset>
          <div v-if="error" class="feedback-form-error" role="alert">{{ error }}<button v-if="conflict" class="feedback-button" type="button" :disabled="busy" @click="reloadEditor">重新加载目标</button></div>
          <div class="goal-editor-actions"><button class="feedback-button" type="button" :disabled="busy" @click="closeEditor">取消</button><button class="feedback-primary-action" type="submit" :disabled="busy">{{ busy ? '处理中…' : '保存并公开' }}</button></div>
        </form>
        <DevelopmentRoadmap ref="roadmap" managed @edit="openEditor" />
      </div></section>
    </main>
  </div>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, ref } from 'vue'
import { Plus, ArrowLeft } from '@lucide/vue'
import IslandSidebar from '@/components/IslandSidebar.vue'
import DevelopmentRoadmap from '@/components/co-creation/DevelopmentRoadmap.vue'
import { DEVELOPMENT_STAGES, getAdminDevelopmentGoal, saveDevelopmentGoal } from '@/api/developmentGoals.js'
import { auth } from '@/store/auth.js'
import { useUnsavedChanges } from '@/utils/useUnsavedChanges.js'
import '@/styles/page-header.css'

const form = ref(null), editingId = ref(''), original = ref(''), busy = ref(false), error = ref(''), conflict = ref(false), notice = ref('')
const titleInput = ref(null), roadmap = ref(null)
let session = 0, mounted = true
const dirty = computed(() => form.value !== null && JSON.stringify(form.value) !== original.value)
const confirmDiscard = useUnsavedChanges(dirty, '开发目标')
const userId = () => String(auth.userInfo?.id || '')

async function openEditor(goal = null) {
  if (busy.value || !await confirmDiscard()) return
  session += 1
  editingId.value = goal?.id || ''
  form.value = goal ? {
    title: goal.title, description: goal.description, stage: goal.stage,
    criteria: goal.criteria.map(item => ({ ...item })), feedbackIds: [...goal.feedbackIds],
    targetVersion: goal.targetVersion, targetDate: goal.targetDate, version: goal.version
  } : { title: '', description: '', stage: 'PLANNED', criteria: [{ title: '', completed: false }], feedbackIds: [], targetVersion: '', targetDate: '', version: 0 }
  original.value = JSON.stringify(form.value)
  error.value = ''; conflict.value = false; notice.value = ''
  await nextTick()
  titleInput.value?.focus(); titleInput.value?.scrollIntoView?.({ block: 'center' })
}
async function closeEditor() {
  if (busy.value || !await confirmDiscard()) return
  session += 1; form.value = null; error.value = ''
}
async function reloadEditor() {
  if (busy.value || !await confirmDiscard()) return
  const current = session, identity = userId()
  busy.value = true
  try {
    const goal = await getAdminDevelopmentGoal(editingId.value)
    if (!mounted || current !== session || identity !== userId()) return
    original.value = JSON.stringify(form.value)
    busy.value = false
    await openEditor(goal)
  } catch (e) { if (mounted && current === session && identity === userId()) error.value = e.message || '重新加载失败' }
  finally { if (mounted && current === session) busy.value = false }
}
async function save() {
  if (busy.value || !form.value) return
  if (!form.value.title.trim() || !form.value.description.trim() || form.value.criteria.some(item => !item.title.trim())) { error.value = '请填写目标标题、说明及每项验收标准'; return }
  if (form.value.stage === 'COMPLETED' && form.value.criteria.some(item => !item.completed)) { error.value = '全部验收标准通过后才能标记完成'; return }
  const current = session, identity = userId()
  busy.value = true; error.value = ''; conflict.value = false
  try {
    await saveDevelopmentGoal(editingId.value, form.value)
    if (!mounted || current !== session || identity !== userId()) return
    form.value = null; notice.value = '开发目标已保存并公开。'; session += 1
    await roadmap.value?.reload()
  } catch (e) {
    if (mounted && current === session && identity === userId()) { error.value = e.message || '保存失败，编辑内容已保留'; conflict.value = e.status === 409 }
  } finally { if (mounted) busy.value = false }
}
onBeforeUnmount(() => { mounted = false; session += 1 })
</script>

<style src="../../styles/feedback-workspace.css"></style>
<style src="../../styles/feedback-workspaceDesktop.css"></style>
<style src="../../styles/feedback-workspaceMobile.css"></style>
<style scoped>
/* 刻意共享字段外观与动效；布局和密度由独立双端文件持有。 */
.goal-workspace-toolbar { border-bottom: 1px solid var(--feedback-line); }
.goal-workspace-toolbar h2 { color: var(--theme-strong-text, var(--tea)); }
.goal-public-view { color: var(--theme-accent-text, var(--accent-strong)); text-decoration: underline; }
.goal-admin-context { color: var(--feedback-warn); }
.goal-save-notice { color: var(--feedback-success); }
.goal-editor { border: 1px solid var(--feedback-line); border-radius: 12px; background: var(--feedback-panel); }
.goal-editor h2 { color: var(--feedback-text); }
.goal-editor fieldset { border: 0; }
.goal-editor label { color: var(--feedback-text); }
.goal-editor h3 { color: var(--feedback-text); }
.criteria-editor > p { color: var(--feedback-text-muted); }
.feedback-content :is(button,a,summary):focus-visible,.feedback-content :deep(:is(button,a,summary):focus-visible) { outline: 2px solid var(--theme-focus, var(--accent)); outline-offset: 3px; }
</style>
<style scoped src="./coCreationAdminDesktop.css"></style>
<style scoped src="./coCreationAdminMobile.css"></style>
