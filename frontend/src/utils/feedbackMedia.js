import { getCurrentInstance, onBeforeUnmount, reactive, ref } from 'vue'
import { uploadMedia } from '../api/media.js'
import { IMAGE_UPLOAD_PROFILES, prepareImageUpload } from './imageUpload.js'

export const FEEDBACK_IMAGE_ACCEPT = 'image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp'
export const FEEDBACK_FILE_ACCEPT = '.txt,.log,.json,.pdf,.zip,text/plain,application/json,application/pdf,application/zip,application/x-zip-compressed'
export const FEEDBACK_MEDIA_ACCEPT = FEEDBACK_IMAGE_ACCEPT
export const MAX_FEEDBACK_MEDIA_COUNT = 10
export const MAX_FEEDBACK_MEDIA_SIZE = 10 * 1024 * 1024

const ACCEPTED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])
const IMAGE_EXTENSIONS = {
  'image/jpeg': new Set(['jpg', 'jpeg']),
  'image/png': new Set(['png']),
  'image/webp': new Set(['webp'])
}
const IMAGE_DEFAULT_EXTENSIONS = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }
const HEIF_BRANDS = new Set(['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'mif1', 'msf1', 'heif'])
const UNSUPPORTED_HEIF = Symbol('unsupported HEIC/HEIF')
const FILE_MIME_TYPES = {
  txt: new Set(['', 'text/plain', 'text/x-log', 'application/octet-stream']),
  log: new Set(['', 'text/plain', 'text/x-log', 'application/octet-stream']),
  json: new Set(['application/json']),
  pdf: new Set(['application/pdf']),
  zip: new Set(['application/zip', 'application/x-zip-compressed'])
}

async function sniffImageType(file) {
  let header
  try {
    header = new Uint8Array(await file.slice(0, 16).arrayBuffer())
  } catch (_) {
    return ''
  }
  if (header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff) return 'image/jpeg'
  if ([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((byte, index) => header[index] === byte)) return 'image/png'

  const signature = String.fromCharCode(...header)
  if (signature.startsWith('RIFF') && signature.slice(8, 12) === 'WEBP') return 'image/webp'
  if (signature.slice(4, 8) === 'ftyp' && HEIF_BRANDS.has(signature.slice(8, 12))) return UNSUPPORTED_HEIF
  return ''
}

async function normalizeSelectedFile(file) {
  const mime = String(file?.type || '').toLowerCase().split(';', 1)[0].trim()
  const name = String(file?.name || '')
  const dot = name.lastIndexOf('.')
  const extension = dot >= 0 ? name.slice(dot + 1).toLowerCase() : ''
  const genericMime = mime === '' || mime === 'application/octet-stream'

  // 部分手机相册提供的文件名和 MIME 与实际图片格式不一致，优先按文件头识别。
  if (isImageType(mime) || (genericMime && !Object.hasOwn(FILE_MIME_TYPES, extension))) {
    const type = await sniffImageType(file)
    if (type === UNSUPPORTED_HEIF) return type
    if (type && typeof File === 'function') {
      if (mime === type && IMAGE_EXTENSIONS[type].has(extension)) return file
      const basename = (dot > 0 ? name.slice(0, dot) : name) || 'image'
      return new File([file], `${basename}.${IMAGE_DEFAULT_EXTENSIONS[type]}`, { type, lastModified: file.lastModified })
    }
  }

  if ((!genericMime && mime !== 'image/jpg') || typeof File !== 'function') return file
  const declaredExtension = name.toLowerCase().split('.').pop()
  const type = [...ACCEPTED_MIME_TYPES].find(type => IMAGE_EXTENSIONS[type].has(declaredExtension))
  if (!type || mime === 'image/jpg' && type !== 'image/jpeg') return file
  return new File([file], file.name, { type, lastModified: file.lastModified })
}

function classifyFile(file) {
  const mime = String(file?.type || '').toLowerCase().split(';', 1)[0].trim()
  const extension = String(file?.name || '').toLowerCase().split('.').pop()
  if (ACCEPTED_MIME_TYPES.has(mime)) return IMAGE_EXTENSIONS[mime].has(extension) ? 'IMAGE' : ''
  return FILE_MIME_TYPES[extension]?.has(mime) ? 'FILE' : ''
}

function revokePreview(item) {
  if (!item?.previewUrl || typeof URL === 'undefined' || typeof URL.revokeObjectURL !== 'function') return
  URL.revokeObjectURL(item.previewUrl)
}

function createPreview(file) {
  if (typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') return ''
  return URL.createObjectURL(file)
}

function isImageType(type) {
  return String(type || '').toLowerCase().startsWith('image/')
}

function normalizeClipboardFile(file, type) {
  if (!file) return null
  const mime = String(file.type || type || '').toLowerCase()
  if (!isImageType(mime)) return null
  if (classifyFile(file) === 'IMAGE' || typeof File !== 'function') return file

  const extension = IMAGE_DEFAULT_EXTENSIONS[mime]
  if (!extension) return file
  const baseName = String(file.name || 'pasted-image').replace(/\.[^.]+$/, '') || 'pasted-image'
  const name = `${baseName}.${extension}`

  return new File([file], name, {
    type: mime,
    lastModified: file.lastModified || Date.now()
  })
}

function getClipboardFile(item) {
  if (item?.kind !== 'file' || typeof item.getAsFile !== 'function') return null
  try {
    const file = item.getAsFile()
    if (!file) return null
    return isImageType(file.type || item.type) ? normalizeClipboardFile(file, item.type) : file
  } catch (_) {
    return null
  }
}

export function useFeedbackMedia() {
  const items = ref([])
  const error = ref('')
  const optimizing = ref(false)
  const uploading = ref(false)
  let preparationVersion = 0

  async function addFiles(files) {
    if (uploading.value || optimizing.value) return
    const selectedFiles = Array.from(files || [])
    if (!selectedFiles.length) return

    error.value = ''
    if (items.value.length + selectedFiles.length > MAX_FEEDBACK_MEDIA_COUNT) {
      error.value = `每条消息最多添加 ${MAX_FEEDBACK_MEDIA_COUNT} 个附件`
      return
    }

    const selectionVersion = preparationVersion
    optimizing.value = true
    let nextFiles
    try {
      nextFiles = await Promise.all(selectedFiles.map(normalizeSelectedFile))
    } finally {
      optimizing.value = false
    }
    if (uploading.value || optimizing.value || selectionVersion !== preparationVersion) return
    if (nextFiles.includes(UNSUPPORTED_HEIF)) {
      error.value = '暂不支持 HEIC/HEIF 图片，请在相册中截图或导出为 JPG 后再添加'
      return
    }

    for (const file of nextFiles) {
      const kind = classifyFile(file)
      if (!kind) {
        error.value = '仅支持 JPG、PNG、WebP、TXT、LOG、JSON、PDF 或 ZIP'
        return
      }
      if (kind !== 'IMAGE' && file.size > MAX_FEEDBACK_MEDIA_SIZE) {
        error.value = '单个附件不能超过 10 MiB'
        return
      }
    }

    const version = ++preparationVersion
    const startIndex = items.value.length
    const batchItems = nextFiles.map(file => ({
      file,
      kind: classifyFile(file),
      previewUrl: classifyFile(file) === 'IMAGE' ? createPreview(file) : '',
      mediaId: null
    }))
    items.value = items.value.concat(batchItems)

    const hasImage = batchItems.some(item => item.kind === 'IMAGE')
    if (!hasImage || typeof Image !== 'function') return
    optimizing.value = true

    try {
      for (let index = 0; index < batchItems.length; index += 1) {
        if (batchItems[index].kind !== 'IMAGE') continue

        const optimized = await prepareImageUpload(batchItems[index].file, IMAGE_UPLOAD_PROFILES.FEEDBACK)
        if (version !== preparationVersion) return

        const item = items.value[startIndex + index]
        if (!item) return
        revokePreview(item)
        item.file = optimized.file
        item.kind = classifyFile(optimized.file)
        item.previewUrl = createPreview(optimized.file)
      }
    } catch (cause) {
      if (version === preparationVersion) {
        items.value.slice(startIndex, startIndex + batchItems.length).forEach(revokePreview)
        items.value.splice(startIndex, batchItems.length)
        error.value = cause?.message || '图片优化失败，请更换图片后重试'
      }
    } finally {
      optimizing.value = false
    }
  }

  async function selectFiles(event) {
    const input = event?.target
    const files = Array.from(input?.files || [])
    if (input) input.value = ''
    await addFiles(files)
  }

  async function handlePaste(event) {
    if (uploading.value || optimizing.value) return

    const clipboardData = event?.clipboardData
    const clipboardItems = Array.from(clipboardData?.items || [])
    const itemFiles = clipboardItems
      .map(getClipboardFile)
      .filter(Boolean)

    const fallbackType = clipboardItems.find(item => item?.kind === 'file' && isImageType(item.type))?.type
    const files = itemFiles.length
      ? itemFiles
      : Array.from(clipboardData?.files || [])
        .map(file => isImageType(file.type || fallbackType) ? normalizeClipboardFile(file, fallbackType) : file)
        .filter(Boolean)
    if (!files.length) return

    event.preventDefault()
    await addFiles(files)
  }

  async function handleDrop(event) {
    if (uploading.value || optimizing.value) return
    const files = Array.from(event?.dataTransfer?.files || [])
    if (!files.length) return
    event.preventDefault?.()
    await addFiles(files)
  }

  function remove(index) {
    if (uploading.value || optimizing.value) return
    const item = items.value[index]
    if (!item) return
    revokePreview(item)
    items.value.splice(index, 1)
    error.value = ''
  }

  function clear() {
    preparationVersion += 1
    items.value.forEach(revokePreview)
    items.value = []
    error.value = ''
  }

  async function uploadAll() {
    if (optimizing.value) throw new Error('图片仍在优化，请稍后再发送')
    uploading.value = true
    try {
      const mediaIds = []
      for (const item of items.value) {
        if (!item.mediaId) {
          const uploaded = await uploadMedia(item.file, true)
          if (!uploaded?.id) throw new Error('上传响应无效')
          item.mediaId = uploaded.id
        }
        mediaIds.push(item.mediaId)
      }
      return mediaIds
    } finally {
      uploading.value = false
    }
  }

  if (getCurrentInstance()) onBeforeUnmount(clear)

  return reactive({
    items,
    error,
    optimizing,
    uploading,
    addFiles,
    selectFiles,
    handlePaste,
    handleDrop,
    remove,
    clear,
    uploadAll
  })
}
