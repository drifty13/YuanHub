export const DEFAULT_FEEDBACK_SPACE = 'yuanhub'

export function feedbackCategoryLabel(category) {
  return category.key === 'MAAYUAN' && category.label === '麻圆' ? 'MaaYuan（麻圆）' : category.label
}
