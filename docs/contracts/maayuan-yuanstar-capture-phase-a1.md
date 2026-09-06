# MaaYuan × YuanStar 图片采集接点：Phase A1 审计与契约

日期：2026-09-06。范围仅为图片级截图采集和已有 YuanStar 导入链路的接点；不含坐标校准、星石 OCR、网络传输、后端存储或最终背包同步。

## 1. Git 现场

| 仓库 | branch | HEAD | 起始工作树 | 本轮变更 |
| --- | --- | --- | --- | --- |
| `D:\Users\Yan\Projects\MaaYuan-v5-dev` | `v5` | `88ce6af Update homepage from VitePress build (#509)` | clean | 无 |
| `D:\Users\Yan\Projects\YuanHub` | `feat/yuanstar` | `378cb99 fix: sync YuanStar traditional routing and import captions` | clean | 本文档、归档的原提示文件，以及已验证的 YuanStar embed 构建产物 |

未执行 pull、merge、stash、reset、clean、依赖安装、push 或真实 MaaYuan/MuMu 操作。

## 2. YuanStar 当前 overlap 真相

### 用户操作与时机

YuanStar 嵌入页位于 `src/pages/star/index.vue`，实际产品实现是编译后的 `public/yuanstar-embed/yuanstar-embed.js`。用户在“导入识别”页先加入本地图片、确认每张图片属于主星或辅星池，然后在“前一张图片 → 后一张图片”下拉框中点击“添加关系”。该操作发生在 OCR 开始前；OCR 后的“人工核对”只处理行级的 `merge` 或 `keep_separate` 决定。

导入暂存态的图片关系是：

```text
{ pairId, pool: "主星" | "辅星", beforeId, afterId }
```

开始识别前，编译包中的导入构造器会把它变成运行时输入：

```text
{
  schemaVersion: 1,
  jobId,
  images: [{ sourceImageId, sourceOrder, file, confirmedPool }],
  confirmedOverlapPairs: [{ pairId, sourceImageIdA, sourceImageIdB }]
}
```

因此它是图片 pair，不是星石识别结果 pair。图片顺序由 `sourceOrder` 保留。每张图片均须在同一已确认的 `main` 或 `support` 池；经验星曜不接受 overlap pair。

### 进入工作区后的同一表示

默认工作区状态在编译包的 `src/business/model.ts` 段初始化为：

```text
importReview: {
  imagePools: {},
  confirmedImagePools: [],
  overlapPairs: { main: [], support: [] },
  overlapAudit: [],
  imageAudit: {},
  occurrences: {}
}
```

对应的 `src/business/session.ts` 中 `WorkspaceSession.addOverlapPair(pool, beforeId, afterId)` 会验证两图不同、同池、已确认，随后以 `applyPostprocess()` 写入：

```text
snapshot.importReview.overlapPairs[pool].push([beforeId, afterId])
```

持久化为 IndexedDB 数据库 `yuanstar-static` 的 `workspaces`（图片 Blob 位于 `images`，键为 `[accountId, imageId]`）。OCR/reconcile 由 `src/ocr/browser-ocr-runtime.ts` 的 batch input 使用 `confirmedOverlapPairs`，在 `src/business/reconcile.ts` 计算图片对的行级 overlap audit；后续才由 `setRowOverlapResolution(rowReviewId, "merge" | "keep_separate")` 记录人工结果。

结论：machine metadata 应当在既有“导入暂存态 → OCR batch input”边界预填 `confirmedOverlapPairs`，再让既有 reconcile 写入 `importReview.overlapPairs`。不应新建 `machineOverlap`，也不应在 OCR 之后另走一条链。

## 3. MaaYuan visual compare 真相

已完整审阅：

- `agent/custom/action/paged_item_recognition.py`
- `agent/custom/action/agent_info_collector.py`
- `agent/custom/action/inventory_reporting.py`

`PagedItemRecognition` 每页通过 `context.tasker.controller.post_screencap().wait().get()` 取得截图，执行 `post_swipe(*swipe).wait()` 后按 `swipe_wait_ms`（默认 700 ms）等待稳定。`automatic_swipe()` 根据当前自动检测到的布局计算手势；或者使用配置的 `swipe`。当前 `max_pages` 默认 10、最小 2，仅是保护上限。

图片级可复用的最小核心是：

- `detect_auto_layout()`：已有视觉布局检测；
- `_circle_feature()`：把圆形单元缩放为归一化图像向量；
- `find_row_overlap(previous, current, threshold, ...)`：从前页尾部与后页头部找连续重合行；未提供实体/数量参数时只按视觉余弦相似度工作；
- `overlap_candidate_scores()`：仅供诊断，不能作为生产判定。

但现有 `scan_page()` 会同时调用 `recognize_item_grid()`，用 OCR/索引补充实体与数量锚点；因此整个既有 `PagedItemRecognition` 不符合“星石截图完全不做 OCR”。Phase A1 不应直接复用该 action，也不应把当前行数返回值冒充为精确星石 overlap。未来只能在真实星石 ROI 校准后，最小抽出“布局 + 图像向量 + `find_row_overlap`”的无 OCR helper。

当前 bottom 判定是 `overlap == len(page.row_features)`，即候选页所有检测行都与上一页对应，不是通用截图像素完全相等。它可以表达 `no_move`；其他正数 overlap 只是当前物品列表的行重叠计数。Phase A1 没有可靠星石 fixture，故没有把它声称为已验证的 `full_move` / `partial_move` 分类。

## 4. 导航结论

`assets/resource/base/pipeline/pandorabox/analytics.json` 已有“进入界面-背包”和“背包识别-start”路径，也有回主界面的 JumpBack；它随后只扫描鸟食、养成材料和密探心纸，结束文案也明确不含星石。`AgentInfoCollector` 读取的是密探命盘中已装备星石的名称和等级，属于 OCR，不是星石背包截图采集。

没有发现可直接复用、已校准的“任意页面恢复 → 星石背包 → 主星/辅星/经验星石三段”节点或稳定状态机。Phase A1 的正确 MVP 前提是：用户手动进入星石背包的目标列表后启动采集。

## 5. CaptureBatch v1（本地、无 transport）

字段采用 YuanStar 已有 `sourceImageId`、`sourceOrder`、`confirmedOverlapPairs` 与 `gameVersion` 语义。`file` 是本地运行时图像对象；未来 transport 再将其替换为临时资源引用，不能改变图片 ID 或顺序。

```ts
type CaptureStopReason = "bottom_no_move" | "max_pages"
type CaptureSection = "main" | "support" | "experience"

type CaptureImage = {
  sourceImageId: string
  sourceOrder: number
  file: File
}

type CaptureAdjacentRelation = {
  previousSourceImageId: string
  currentSourceImageId: string
  relation: "overlap"
}

type CaptureSectionBatch = {
  images: CaptureImage[]
  adjacentRelations: CaptureAdjacentRelation[]
  complete: boolean
  stopReason: CaptureStopReason
}

type CaptureBatchV1 = {
  schemaVersion: 1
  captureId: string
  source: "maayuan"
  gameVersion: "如鸢" | "代号鸢"
  sections: Partial<Record<CaptureSection, CaptureSectionBatch>>
}
```

约束：`sourceImageId` 与 `sourceOrder` 在整个 batch 中唯一，adapter 按 `sourceOrder` 升序保留图片顺序；relation 只可指向同一段的相邻保存图；`bottom_no_move` 必须为 `complete: true` 且不保存重复候选帧；`max_pages` 必须为 `complete: false`。本 contract 不含任何星石名称、等级、品质、OCR 置信度、实例 ID、目标等级、行/卡片定位或人工审核决定。

## 6. YuanStar machine import adapter 接点

可维护源工作树为 `D:\Users\Yan\AppData\.codex\yuanstar-yuanhub`。接点已实现在 `web/src/product-ocr-import.ts` 的 `createProductImportFromCaptureBatch()`；嵌入模块经 `web/src/product.ts` 的 `YuanStarHandle.importCaptureBatch()` 暴露。它返回并载入完全既有的 `ProductImportImage[]` 与 `ProductOverlapPair[]`，随后仍由现有 `buildProductOcrRuntimeJob()` 和 `ProductOcrImportCoordinator.run()` 运行。

```text
CaptureBatchV1
  -> YuanStarHandle.importCaptureBatch()
  -> createProductImportFromCaptureBatch()
  -> 既有导入图片暂存态（file/sourceImageId/sourceOrder/pool/confirmed）
  -> 既有 buildProductOcrRuntimeJob()
  -> BrowserOcrRuntime.run()
  -> 既有 reconcile / importReview.overlapPairs / 人工核对
```

映射规则：

1. `sections.main|support|experience.images` 按 `sourceOrder` 进入正常图片数组；adapter 直接采用 `sourceImageId`，不要调用手动上传的随机 ID 生成器。
2. 所有图片预填既有的已确认状态；`main`/`support` 的 relation 通过既有 `addProductOverlapPair()` 转换，再由 `buildProductOcrRuntimeJob()` 生成 `{ pairId, sourceImageIdA, sourceImageIdB }` 的 `confirmedOverlapPairs`。
3. `experience` 保持现有无 overlap 语义；若 payload 含该段 relation，adapter 拒绝，而不是猜测转换。
4. adapter 只接收本地 `File` 和 metadata；绝不裁图、跳过区域、标记 OCR 特例，或根据 `source` 选择另一 OCR runtime。
5. `importCaptureBatch()` 要求当前工作区已加载、游戏版本一致且待识别区为空；它不会自动清空或覆盖用户的手动暂存图片，也不会自动启动 OCR。无 CaptureBatch 的手动文件仍走未改动的 `createProductImportImages()` → 人工分类/确认 → `buildProductOcrRuntimeJob()`，因此行为不变。

machine 的正常 full-backpack import 必须同时包含 `main`、`support`、`experience` 三段；任一缺失即在 adapter 边界以 `capture_sections_incomplete` 拒绝。adapter 还会拒绝未知分段、空/重复 image ID、非整数或重复顺序、无图片、相邻关系跨段或非相邻、经验星曜关系、无效来源/游戏版本，以及 `complete` 与 `stopReason` 不一致的 batch。三段全部存在后，任一 section 只要 `complete !== true`，即使其 `max_pages` / `complete:false` 组合本身是有效的采集失败诊断，也会以 `capture_incomplete` 拒绝，不能进入正常 OCR/import 链路。它不调用 OCR、不裁图、不修改坐标，也不增加 machine 专用的图片池或 OCR 状态。

术语边界：未来 MaaYuan → YuanHub Backend 的截图传递才叫 **transport**，本轮未实现；`YuanStarHandle.importCaptureBatch()` 将本地 `File` 放入 YuanStar 既有待识别区才叫 **import**，之后由原有本地 OCR 和人工核对继续处理。

## 7. 本轮实际修改

- `prompts/archive/MaaYuan_YuanStar_capture_overlap_contract_phaseA1_prompt.md`：读取后按用户要求从 `prompts/` 归档到同级 `archive/`。
- `D:\Users\Yan\AppData\.codex\yuanstar-yuanhub\web\src\product-ocr-import.ts`：新增本地 `CaptureBatchV1` contract 与 `createProductImportFromCaptureBatch()`；完全复用既有 manual overlap state / OCR job builder。
- `D:\Users\Yan\AppData\.codex\yuanstar-yuanhub\web\src\product.ts`：在既有 `YuanStarHandle` 增加 `importCaptureBatch()`；仅接受空的待识别区，预填后停在既有 OCR 开始前状态。
- `D:\Users\Yan\AppData\.codex\yuanstar-yuanhub\web\tests\product-ocr-import.test.ts`：覆盖 stable image ID 与顺序、同一 pair 表示、既有 OCR job 接点、以及非相邻 pair 拒绝。
- `Phase A1.1`：adapter 额外拒绝任一不完整 section（`capture_incomplete`）；聚焦测试覆盖 `bottom_no_move/complete:true` 可进入既有 OCR job，以及 `max_pages/complete:false` 必须被阻断。
- `Phase A1.2`：machine full-backpack import 额外要求三段齐全；缺任一段都以 `capture_sections_incomplete` 阻断，三段齐全后才执行 A1.1 的逐段完整性保护。
- `public/yuanstar-embed/yuanstar-embed.js`、`yuanstar-embed.css`、`assets/browser-vision-worker-C9GQrRAi.js`、`ort/ort-wasm-simd-threaded.mjs`：从已验证的 `build:embed` 等价构建输出同步；没有手改压缩文件。
- 本文档：更新审计、最终 contract 和验证结果。

没有改变 MaaYuan 运行逻辑、YuanHub API 或 Backend；不依赖真实坐标；没有新增 UI；手动上传未受影响。

## 8. 验证范围

| 范围 | 结果 |
| --- | --- |
| 静态审计 | 已完成：两个 repo 的 Git 现场、MaaYuan 三个指定 action、背包 pipeline、YuanHub host，以及可维护 YuanStar 源的 `session` / `reconcile` / `product-ocr-import` / `browser-ocr-runtime`。 |
| 单元测试 | 已通过：`web` 的 TypeScript `--noEmit` 与 `product-ocr-import` 聚焦测试。系统 `pnpm` 因 Windows 缓存目录 `EPERM` 无法启动；使用同一项目依赖和 Node 直接执行了等价命令。 |
| 本地构建 | 已通过：`copy-runtime-assets.mjs`，随后 Vite embed build（40 modules）。 |
| 本地逻辑测试 | 已通过 CaptureBatch fixture 的 contract/adapter/OCR-job 映射；没有声称视觉阈值或真实截图识别通过。 |
| MaaYuan/MuMu smoke | 未运行：本轮明确不启动、不校准坐标。 |

## 9. 下一轮唯一需要用户准备的材料

同一游戏版本、同一 MuMu 分辨率/缩放下，主星、辅星、经验星石三段各一组连续原始截图：每组至少包含初始帧、一次明显移动后的帧，以及列表底部一次 `no_move` 候选帧；同时提供各段进入状态与实际滑动前后截图。不得裁剪、压缩或附加 OCR 标注。
