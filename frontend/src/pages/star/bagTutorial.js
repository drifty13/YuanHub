export const historyTutorialStep = {
  id: 'history', title: '撤销、重做和近期存档',
  paragraphs: ['页面右侧的箭头可以撤销或重做最近的操作，电脑端也可以使用 Ctrl + Z / Ctrl + Y。', '时钟按钮可以查看近期存档，方便回到之前保存的状态。'],
  target: '.review-workspace-tools', scroll: 'preserve', mobileAvoidTarget: true,
}

export const bagTutorialSteps = [
  { id: 'review', title: '检查识别结果', paragraphs: ['识别完成后，可以在这里回看截图和识别结果。', '发现名称、等级或品质有误时，可以查看原图并修改；误识别的内容也可以忽略。', '正常结果通常不需要逐条重新确认。'], target: '.ocr-review', exampleAction: 'review-info', exampleLabel: '查看核对说明' },
  { id: 'bags', title: '认识当前背包', paragraphs: ['这里列出了当前账号的星石，每一行对应一颗星石。', '点击任意一行，即可选中这颗星石，并在右侧查看或修改它的信息。'], target: '.bag-inventory' },
  { id: 'find', title: '查找与查看星石', paragraphs: ['用主星、辅星标签切换大类，也可以按品质和名称筛选、调整排序。', '「星石明细」显示每颗星石；「名称汇总」将同名星石整理在一起，方便查看数量。', '在名称汇总视图中，双击某一组，即可进入这一组的星石明细。'], target: '.bag-filters' },
  { id: 'experience', title: '查看背包与经验星曜', paragraphs: ['这里可以查看和调整背包数量、背包容量，以及现有的橙、紫、白经验星曜数量。', '如果需要核对截图识别出的经验星曜，可以点击「查看经验星曜原图」。'], target: '.bag-summary' },
  { id: 'edit', title: '编辑或新增星石', paragraphs: ['选中一行后，可以直接调整这颗星石的大类、名称、等级和品质。', '点击「当前背包」标题旁的「新增」，填写后点击「保存修改」。', '不再需要的星石，可以使用「删除当前行」。'], target: '#add-current-row', relatedTargets: '[data-edit-panel="current"], #current-rows .is-selected, #current-rows .is-counterpart' },
  historyTutorialStep,
]

const gridTutorialUpdates = {
  bags: { paragraphs: ['主星与辅星分别排列。点按明细里的任意一颗可收起或展开它所在的多颗分组。'] },
  find: { paragraphs: ['可以按品质筛选、搜索名称，或切换排序。', '「星石明细」保留每颗星石，「名称汇总」将同名星石排在一起。'] },
  experience: { paragraphs: ['这里可以查看和调整背包数量、容量，以及橙、紫、白经验星曜数量。'] },
  edit: {
    paragraphs: ['电脑上将鼠标移到单颗星石上，再点铅笔编辑。触屏可长按单颗星石。', '使用「新增」录入一颗空白星石，填写后点「保存修改」。'],
    target: '#add-current-row',
    relatedTargets: '#current-rows .is-selected',
  },
}

export const bagGridTutorialSteps = bagTutorialSteps.map(step => ({ ...step, ...gridTutorialUpdates[step.id] }))

export { growthPlanTutorialSteps } from './growthPlanTutorial.js'

export const bagReviewInfo = {
  title: '怎么看识别结果',
  intro: '每张截图都会保留对应的识别结果。\n一般只需要处理看起来有问题的内容，不用把所有结果重新确认一遍。',
  sections: [
    { title: '查看整页', body: '查看完整原始截图，确认这条结果在截图里的位置和上下文。' },
    { title: '查看全部候选', body: '展开当前图片识别出的全部候选，方便检查漏识或误识。' },
    { title: '保留', body: '将当前候选保留为有效结果。\n正常识别并已经保留的结果，一般不需要再点这个按钮。\n如果有星石被误归到「忽略」，可以用「保留」恢复。' },
    { title: '忽略', body: '这条内容不需要进入背包时，可以忽略。' },
    { title: '修改', body: '名称、等级、品质等识别有误时，可以手动修改。\n确认修改后会立即写回当前背包。' },
  ],
}

// A loaded historical account never opts into a new release's automatic tour.
// OCR success is observed separately; history becoming nonempty cannot opt it in.
export function createBagTutorialGate() {
  let owner = '', eligible = false, observed = false, completed = false
  return {
    loaded(key, hasHistory) {
      if (key !== owner) { owner = key; eligible = false; observed = false; completed = false }
      if (!observed) { eligible = !hasHistory; observed = true }
      return eligible
    },
    ocrCompleted(key) { if (owner === key && eligible) completed = true },
    cancelOcr(key) { if (owner === key) completed = false },
    shouldStart(key, { reviewing, ready, seen, hasEvidence }) {
      return owner === key && eligible && completed && reviewing && ready && !seen && hasEvidence
    },
    reset() { owner = ''; eligible = false; observed = false; completed = false },
  }
}
