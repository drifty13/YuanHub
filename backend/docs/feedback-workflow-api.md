# 反馈工单流转接口

## 反馈广场下线

公开列表 `GET /v1/reports/public`、相似查询 `GET /v1/reports/public/similar`、详情 `GET /v1/reports/public/{id}`，以及支持与取消支持 `POST/DELETE /v1/reports/{id}/support` 已移除。`GET /v1/reports/public/spaces` 和 `GET /v1/reports/public/spaces/{id}` 继续提供专区元数据。

历史工单、公开字段、支持记录及开发目标关联保留。管理员的发布、取消公开和公开状态接口沿用原权限。网页工作台移除了这些入口，结案继续使用原默认值。

## MaaYuan 独立诊断中心（2026-11-11）

接收端仍为 `POST /open-api/maayuan/diagnostics`，v1/v2 协议、连接码鉴权、配额、图片解码、返回体及事件回执不变，详见 [开发者 API](../../frontend/docs/developers/api.md) 的同名章节。接收不再调用 `FeedbackReportService.createDiagnostic`：图片预算、媒体元数据、新事件、问题组和随机事件回执在原 Hub Mongo 事务内提交，不生成工单、不发逐条通知、不提供上报用户沟通入口。`createDiagnostic` 保留供旧工单兼容，普通反馈路径不变。

`FeedbackTicketQueryRepository.search` 在分页和计数前统一排除 `source=maayuan_diagnostic`，覆盖管理队列、个人列表、队列计数、前端未读扫描及 `/open-api/feedback/queue`。原诊断筛选参数可以保留，但不能绕过排除条件。旧工单不迁移、不主动批量删除，按 ID 查看及原附件鉴权路径保留，并继续原有 90 天清理。

用户通知分页与未读计数通过 `NotificationRepository` 排除 `refType=FEEDBACK` 且 `refId` 以保留前缀 `rpt_diag_` 开头的旧诊断通知，避免历史回复继续产生个人反馈未读角标；原通知数据保留，不批量改为已读或删除。

新集合与索引：

- `maayuan_diagnostic_events`：`_id=eventId`，保存认证推导的 userId/accountId、createdAt、复用的 FeedbackDiagnosticSummary（issue 可选 node）、manifestAssetId、校验后的完整 trace、图片 assetId/role/可选 issueIndex、可选 traceIndex/nodeRoi、问题组 signatures。索引为 createdAt、signatures；事件响应不返回上报用户和账号 ID；旧事件 trace 缺省空数组。
- `maayuan_diagnostic_issues`：永久问题组，索引为 `{status:1,lastSeenAt:-1}`、reason。键为 `原因|对象`（reason 缺省取 code；仅 identity_unresolved/data_review 有 operatorIds 时使用每个 `op:<operatorId>`，identity_unresolved 无 ID 但有 OCR 样本时使用首条 `ocr:<样本>`；其余 issue 有 node 时用 `node:<node>`、subjectKind=node，无 node 才用 `stage:<stage>`），ID 为键的 SHA-1 十六进制前 24 位，落点为 `MaayuanDiagnosticIssueRecorder.Signature`。无 node 的旧签名、operator/ocr_name 分支不变，不回填或合并历史组。
- 身份类 identity_unresolved 的 operator/ocr_name 对象以 code 代替 reason 作为签名原因；同事件与其他非 collector_exception issue 具有相同明确 reason 的外层 collector_exception 不参与分组，事件摘要仍保留所有 issue；组 `reason` 为签名原因，新增去重 `reasons` 记录实际 issue.reason（缺省取 code，旧文档默认空数组），管理端与 AI 响应随问题组返回该字段。
- 同一事件内按签名分组，只增加一次 eventCount，并合并 stages；新增 operatorIds 收集进入该组的 issue 的 operatorIds，沿用 recent() 去重保留最近 10 个，旧文档默认空数组，管理端与 AI 响应透传，详情环境区非空时显示「涉及密探」，中文名由只读目录解析，未命中保留原 ID；最近非空候选列表取当前事件，OCR 样本去重保留最近 8 条，MaaFW/资源/目录版本各保留最近去重 10 个，resourceCounts/uiScriptCounts 每个事件各计一次。FIXED 再次出现时回到 NEW 并记 regressedAt；IGNORED 只累计不重开。用户集合不永久存储，详情基于保留期内事件按 userId 去重计数。

上述 stage/node 分支中，issue.node 为 `(direct)` 时回退 `stage:<stage>`，避免跨阶段合组；nodes 聚合时过滤该值（含已有列表），服务端字段校验仍接受它。operator/ocr_name 分组规则不变。

管理端基路径 `/v1/admin/maayuan-diagnostics` 使用 JWT，复用 `FeedbackAccessService.operatorAreas(userId)` 包含 MAAYUAN 的判断，与原 UNASSIGNED 诊断工单的工作台可见规则一致（含超级管理员），不使用宽泛的旧 manageAreas 代替岗位授权。Integration Token 在 `/open-api/maayuan-diagnostics` 读取时逐请求校验当前账号的 `MAAYUAN_DIAGNOSTICS_READER` 角色或 MAAYUAN 运营资格，同时要求令牌具有 `diagnostics:read` 且板块显式包含 MAAYUAN。只有新角色时仅可签发该单一 scope、单一板块的个人令牌；完整清单和分析写入仍需运营资格，日志与状态更新仍走管理端。此角色不提供通用后台或 Beta 资格。按人授权前先更新所有后端实例，再发布前端，避免旧实例读取新角色枚举。开发者接入步骤见[开发者 API](../../frontend/docs/developers/api.md#让-ai-只读诊断)。

| 相对端点 | 功能 |
|---|---|
| `GET /issues` | status（NEW 默认 / FIXED / IGNORED / ALL）、reason（精确匹配组的 reason 或 reasons）、q（subject/OCR/目录名称与别名）、sort（lastSeen 默认 / count / firstSeen），分页（page 从 1 开始、每页默认 20、最多 100；管理端 pageSize、AI page_size）。返回分页问题组、statusCounts、reasonCounts 与三项全局统计（pendingCount、recentEventCount、regressedCount）。状态计数忽略当前状态，原因计数忽略当前原因，其余搜索条件保留；reasonCounts 仍按组的 reason 聚合 |
| `GET /issues/{id}` | 问题组、近 90 天去重用户数、最近 20 个事件摘要、subjectInCatalog 及对象/候选中文名。使用 `OperatorCatalogService.catalogReadOnly()`，不触发 seed/backfill；OCR 名字与目录名称或分隔的 alias 精确匹配，其他对象为 null |
| `GET /events/{eventId}` | 完整摘要、内联 manifest JSON、图片列表（带 role 与 expired）；无明确协议关联时 issueIndex 为 null |
| `GET /events/{eventId}/media/{assetId}` | 校验事件引用、diagnosticEventId、privateStorage 和保留期后，复用 MediaStorageService.loadAuthorizedAsset 返回私有文件流，Cache-Control no-store/private；跨事件或过期均为 404 |
| `PATCH /issues/{id}`（仅管理端） | `{status,note?}`，NEW/FIXED/IGNORED；备注最多 4000 字，记录 statusUpdatedBy/statusUpdatedAt |
| `PUT /issues/{id}/analysis`（仅 AI） | summary ≤4000、suggested_action ≤40、source ≤40（均必填非空）、model 可选 ≤120；写 agentAnalysis，返回所写分析，不修改状态或返回事件数据 |

两个新增 IntegrationScope 为 `diagnostics:read`（上述四个 GET）与 `diagnostics:analysis:write`（PUT 分析，不隐含读取权限）。原有 Token 管理端点不变，普通连接码不会因此取得后台诊断权限。AI 无状态修改端点；管理端及 AI 共用诊断读取语义，错误通过 IntegrationExceptionHandler 返回真实 HTTP 状态。

图片保留 14 天；event 和 manifest 保留 90 天；问题组及累计计数永久保留。读取立即拒绝过期事件和文件，图片元数据删除后在事件响应中标记 expired；每小时清理真实文件和元数据，再删除过期事件，问题组不参与清理。原有旧诊断工单清理保留，普通工单和附件不参与诊断清理。随机回执独立保留，过期后重试不重新累计。

全局图片预算仍为 10 GiB；不足时保存无图事件及 manifest。接收事务失败只清理未被已提交事件引用的本次媒体，并保持原有预算回滚及孤儿文件回收。问题组并发写冲突会回滚整个事件，由客户端使用相同 eventId 重试，避免丢失或重复累计。

前端 `/maayuan-diagnostics` 与反馈管理路由同级鉴权，以桌面表格/手机卡片承载问题组，右侧抽屉（手机全屏）提供结论、处理、环境、最近事件、完整证据及原始数据；反馈页只保留次级入口，旧详情图片也改为 contain。现有 MaayuanDiagnosticServiceMongoTest 与 feedbackPages.spec.js 中直接冲突的断言已静态更新，未运行检查；新中心的权限、事务、聚合及运行时 UI 均待另行授权验证。

### 背包漏扫与数量可疑诊断（2026-11-13）

`schema_version=1` 新增 `feature=inventory_bag_scan`，使用原 intents → 逐张 PUT → complete 流程。解析器按 feature 隔离：背包仅接受 builtin catalog、outcome=data_review；issues 为 1～2 项、每种 code 最多一次，可含 bag_item_missing（stage=bag_tab1、count=1，reason 仅 tianjifuchuan_missing / fuchuan_missing / both_missing）和 bag_count_suspect；两条同时出现时 stage 必须一致。其余 issue 字段为空或省略（仍拒绝 null）；images 为 1～12 张连续 index 的 bag_page，禁止 operator_id/trace_index/node_roi。每张为物品格区域的原始 JPEG，≤512 KiB，ROI/尺寸检查、可选 trace 和脱敏日志沿用。密探场景拒绝新 code/role 和 bag_cells，原有校验、三图上限及响应不变；旧 multipart 不扩容。

`bag_count_suspect` 的 stage 仅 bag_tab1 / bag_tab3_1 / bag_tab3_2，reason 仅 page_conflict / threshold_disagree / edge_zone / mixed，count 为 1～64 且等于顶层 bag_cells 长度。有该 code 时必须提供 bag_cells，否则必须省略。每格仅含 entity_type（item / agent）、entity_id（`^[a-z0-9_]{1,64}$`）、chosen、reasons、readings；chosen 为 0～99999999 的整数或显式 null（未采用），reasons 是 page_conflict / threshold_disagree / edge_zone 的非空不重复子集。readings 为 1～8 项，仅含 image_index（必须引用本事件图片）、count_box（resolution 内的整帧四整数正宽高矩形）、count（同 chosen 范围或显式 null）、raw（`^[0-9]{0,8}$`）、score（数值 0～1，客户端保留 3 位小数）、source（primary / fallback）。chosen 和 count 必须出现；仅这两个位置允许 null，不接受未知字段、重复键或类型强转，不含账号名、连接码或 OCR 文本。manifest 仍限 64 KiB；intent 正文上限为 68 KiB，为 uploads/log 封装预留空间。客户端超限时从末尾截掉 bag_cells 并同步修正 count，不得截成空列表后继续携带该 code。

背包问题组键为 `inventory_bag_scan|bag_item_missing|<reason>|stage:bag_tab1`，仍以 SHA-1 十六进制前 24 位为 ID；subjectKind=stage、subject=bag_tab1，不依赖 operatorIds。密探签名保持原样，不迁移历史数据。现有持久化与中心查询直接支持多图和空密探 ID；权限、私有存储、保留期、配额（每账号每日 30 包/20 MiB，用户每分钟 6 次/每日 100 次）及 10 GiB 全局预算不变。

数量可疑沿用相同签名格式：`inventory_bag_scan|bag_count_suspect|<reason>|stage:<stage>`，按 code + reason + stage 聚合，事件计数与 FIXED 后复发规则沿用。bag_cells 随原 maayuan_diagnostic_events 文档保存，不新建集合；仅管理端事件详情增加 bag_cells，非管理端内联 manifest 不增加此字段。证据区按格显示目录中文名（未知时 ID）、各图片读数、chosen（null 显示「未采用」）和中文原因；读数可点击复用原放大图标出 count_box，图片不可用时仍显示坐标，窄屏表格局部横滚。旧事件缺少 bag_cells 时不显示明细。

诊断中心沿用列表、原因筛选和事件证据入口，新增「背包识别」「背包漏扫」「天机符传未识别 / 符传未识别 / 两种符传均未识别」中文标签。bag_page 显示「背包页面 · 第 N 页」，按扫描页序逐张放大，不显示「未识别密探」。可选 trace 的 bag_tab1 显示「背包物品页」，图片状态、过期提示与重试沿用。

必须先部署 YuanHub，再发布 MaaYuan；旧 Hub 拒绝新 feature（422），客户端须吞掉诊断失败，不影响库存任务。本次只实现并静态审查 diff，验证预算为 0，未运行测试、构建或浏览器验收。

### 可选运行日志（2026-11-12）

直传 intents 新增可选 `log:{size,content_md5}`，每事件最多一份脱敏 UTF-8 gzip 日志，压缩大小 1～262144 字节，解压最多 1048576 字节。MD5 沿用图片规则；日志与图片合计消耗 packet 字节配额和 10 GiB 全局预算。仅 accepted 且请求有 log 时返回 `log_upload:{method,url,headers,expires_in}`，签名 headers 为 Content-Type: application/gzip、Content-MD5、Content-Length；预算不足仍返回 accepted_without_images 且不提供日志地址。无 log 的旧请求、multipart 通道和 Integration Token 结构化响应保持原样。

日志 MediaAsset 为 privateStorage、FILE / application/gzip、storageBackend=cos，绑定 diagnosticEventId 与 ownerUserId，14 天过期，存于 `diagnostics/logs/{medId}.log.gz`。事件可选保存 `log:{assetId,status,size}`，size 为压缩字节数。complete 请求仍是 `{}`，没有图片也可完成日志；要求认证用户和绑定账号与事件一致，资产 owner/eventId/privateStorage 校验与图片一致。HEAD 大小一致后有界读取，gzip 流式解压最多读取 1 MiB + 1 字节，严格检查 UTF-8；ready/missing/invalid 通过事务条件更新，invalid 删除对象，missing/invalid 释放预算且不重复释放。complete 响应仅在事件有日志时返回 `log:{status}`。14 天清理沿用图片路径，删除对象和元数据、释放尚未释放的额度，事件引用保留用于过期提示。

仅管理端事件详情新增可选 `log:{asset_id,status,size,expired}`；`GET /v1/admin/maayuan-diagnostics/events/{eventId}/log` 与 media 共用 authorized / requireAccess，返回解压文本 `text/plain; charset=utf-8`，no-store/private、nosniff；无日志、未完成、missing/invalid、过期或资产归属不符均为真实 HTTP 404，临时 COS 故障为 503。日志不增加 AI 接口或签发 GET URL。前端证据区有日志才显示「运行日志」，ready 时按需加载查看、下载 `<eventId>.log`、复制；图片与 Trace 保留原布局和行为。

部署前须为同一私有桶的 `diagnostics/logs/*` 配置与图片相同的 PutObject/GetObject/DeleteObject/HeadObject 最小权限，以及该前缀上传后 15 天过期删除生命周期（孤儿对象兜底）；应用层仍为 14 天。先部署 YuanHub，再发布 MaaYuan；旧服务端收到带 log 的 intent 返回 400 时客户端去掉 log 重试一次，退回 multipart 不带日志。详细协议见 [开发者 API](../../frontend/docs/developers/api.md#可选运行日志)。本次不修改远端权限或生命周期。

### 识别轨迹、失败画面与节点分组（schema_version=1）

新增字段均为可选兼容增量，严格模式继续拒绝未知键、重复键、null 和类型强转。**发布顺序必须是 YuanHub 后端先发布，再发布 MaaYuan 客户端**；旧后端会将新增字段视为未知字段返回 400。字段完整定义见 [开发者 API](../../frontend/docs/developers/api.md#maayuan-百宝箱诊断)。

- 顶层 trace 缺省空数组，最多 64 步，t 按非递减排序。kind 仅 reco/action；node 为 1～64 字符，匹配 `[\p{L}\p{N}_\-·@ ]+`，为契约所述兜底节点额外允许固定值 `(direct)`；stage 沿用 issue.stage；hit 必填布尔值；n 为 1～10000，t/dt 为 0～86400000 毫秒，dt 可省略。仅 reco 可带 algo（1～32 个 ASCII 字母/数字/下划线）、score（-1～100000，最多 3 位有效小数）；box 为 resolution 内的四整数矩形，w/h >0。仅 OCR reco 可带 text，1～32 字符，复用 OCR/SENSITIVE 校验；客户端还有短汉字/数字的更严格过滤。摘要与图片档均可发送 trace。
- issue.node 可选，采用同一节点规则，由客户端关联同阶段最后一次未命中的识别步骤；服务端不推断。图片 trace_index 为 0～63 的整数且小于 trace 长度；node_roi 为 resolution 内的四整数正宽高矩形；两字段均仅 last_frame 可带。manifest 原样保存校验后的值，multipart 与直传共用解析、持久化路径，不新增数据迁移。
- 问题组 nodes 最近去重保留 10 个；管理端问题组非空时返回 nodes，事件详情额外返回 trace、summary.issues[].node 和 images[].trace_index/node_roi（实体字段为 camelCase，JSON 沿用 snake_case）。旧事件不补写。保留期、配额、幂等、事务和权限规则不变。
- 管理抽屉新增识别轨迹时间线，展示时间、中文阶段、节点、算法、结果、折叠次数、最高分和短 OCR 文本；突出当前组相关 issue.node 在同阶段最后一个未命中 reco，last_frame 引用的步骤标「对应画面」。缩略图与放大图均叠加黄色虚线节点 ROI 和绿/红识别框，按 resolution、图片 roi 及 contain 实际内容区定位，并随尺寸变化重算。原列表、备注、证据过期提示与重试路径保留，手机沿用全屏抽屉。

`/open-api/maayuan-diagnostics/*` 保持既有请求与结构化响应字段，包括内联 manifest 的原字段投影，不透出本次新增节点/轨迹字段；读取完整 manifest 附件仍返回实际保存的协议文件。该兼容投影在共享读取服务完成，Integration Token Controller、`PUT /issues/{id}/analysis` 及分析实现未改动。

交给后端验证会话运行（本次实现会话未运行 Gradle）：

```bash
cd backend
./gradlew ktlintCheck
./gradlew test --tests 'com.lhs.share.openapi.diagnostics.*' --tests 'com.lhs.share.openapi.*Feedback*ContractTest'
./gradlew integrationTest --tests 'com.lhs.share.openapi.diagnostics.MaayuanDiagnosticServiceMongoTest'
```

## 反馈专区兼容接口与主站迁移

合作专区已废弃，历史板块与工单由 [主站合并脚本](../scripts/migrations/20261121-feedback-merge-spaces-into-yuanhub.js) 统一归入 `yuanhub`。脚本默认按专区预览板块数、工单数和待修改的板块 key。显式设置 `APPLY=1` 后，脚本在同一 MongoDB 事务内按版本更新目录、停用并保留合作专区、记录一条 `FEEDBACK_SPACE_UPDATED` 审计，并更新工单归属。事务中断可重跑，已迁移的目录不会再次升版或记审计。目录按请求读库，提交后无需重启后端。

若迁移时仍有人提交反馈，等在途请求结束后再预览一次。旧请求可能在事务快照之后写入合作专区工单，有剩余时可重跑。

- 新工单保存 `spaceId`，请求 JSON 使用 `space_id`，省略时默认 `yuanhub`。迁移只更新工单中非空、非主站的 `spaceId`。缺失或 null 继续按主站读取。板块 key 全局唯一，岗位授权仍按原 key 生效。提交和调整处理板块时仍校验专区一致。
- `GET /v1/reports/access` 增加 `spaces`（开放专区及本人可管理的停用专区）、`manageable_spaces`；板块选项增加 `space_id`。可选 `spaceId` 仅收窄目录。实际管理范围来自运营岗位与板块授权；旧授权不会自动变成新专区岗位，超级管理员保留全范围。
- `GET /v1/reports`、`GET /v1/admin/feedback/queue` 接受 `spaceId`。管理查询必须在数据库分页/计数前交集专区和岗位板块；无授权专区返回业务 403。省略或 `all` 聚合本人授权范围，不授予额外权限。个人 `mine=true` 只查本人，省略或 `all` 可查本人所有专区历史。搜索、队列计数遵守同一条件。
- 详情、附件、回复、状态、流转、候选人和逐工单已读仍根据真实工单授权，改请求参数或编号不会扩权。前端批量已读只发送当前管理范围的未读工单及消息边界。
- `GET /v1/reports/public/spaces` 返回开放专区；`GET /v1/reports/public/spaces/{id}` 返回单个专区元数据（包含停用状态，便于历史入口）。元数据不包含成员和私有工单。`POST /v1/admin/feedback-spaces` 接受 `{id,label}`；`PUT /v1/admin/feedback-spaces/{id}` 接受 `{label,active}`，均须原 `admin:feedback_access:manage` 权限。稳定 ID 不可更改，`all` 保留，主站不可停用；创建时仅新增一个真实“其他问题”板块。沿用目录乐观锁、hub 事务及 `FEEDBACK_SPACE_UPDATED` 审计。

板块创建接受 `space_id`（默认主站）；排序额外传 `space_id` 时，新旧 key 数组须包含该专区完整目录，其他专区顺序保持；省略维持旧全目录排序契约。成员仍通过既有反馈授权接口保存完整岗位及板块集合，不能把当前专区以外的已有授权清空。停用仅阻止新建反馈，历史处理和本人记录仍可用。

`GET /v1/admin/feedback/version-options?spaceId=...` 先校验管理范围。产品版本目录目前仅属于主站，合作专区返回空选项，不能关联主站版本；既有主站版本功能保留。原 OpenAPI token 尚无专区声明，自动化列表、详情、附件及分析继续限制于 `yuanhub` 和原 token 板块交集，不自动扩展到新专区。

统一反馈中心发布时先更新后端，再更新网页。旧网页仍按具体专区查询。新网页按所选板块提交真实的 `space_id`，跨专区的个人列表和管理队列显式传 `spaceId=all`。网页发布和历史数据迁移分别执行。迁入主站的工单随后按主站和现有令牌板块范围鉴权。

### 反馈图片存储边界

反馈客户端使用 `POST /v1/media/upload?feedback=true`，图片也写入现有私有文件目录，上传响应 `url=null`。消息图片返回 `private_storage=true` 和空 URL，由 `GET /v1/reports/{id}/attachments/{mediaId}` 鉴权读取；私有图片和文件都须是工单实际引用的未删除资产。合作专区拒绝引用普通上传入口生成的公开图片。普通非反馈图片上传保持原行为。

**历史限制：旧图片原先位于公开 `/media/`，本次没有移动、删除文件或撤销既有 URL。已有静态地址仍具有原来的可访问性，不能视为已经完成隐私迁移。** 新专区不接收这些公开图片；如需收紧旧主站图片访问，需另行确认资产共享关系和 URL 兼容方案后实施迁移。没有对现有开发/生产数据库运行迁移。

## 附件数量

`POST /v1/reports` 和 `POST /v1/reports/{id}/messages` 的 `media_ids` 允许 0–10 个，图片与普通文件共用额度；用户追加与管理员回复使用同一上限。超过 10 个返回业务 `status_code=400`。媒体存在、上传者归属、未删除和 ID 不重复的约束继续生效。单个文件上传大小与图片压缩规则不变。

## 类型与活动日历板块

`type` 可选 `BUG`（问题反馈）、`EXPERIENCE`（体验优化）、`FEATURE`（功能建议）、`CONTENT`（内容问题）、`ACCOUNT`（账号问题）、`REPORT`（举报）、`OTHER`（其他）；与反馈板块 `category` 独立。旧 `type=FEEDBACK`、`category=类型`、`area=板块` 请求继续兼容；不迁移历史工单或将 OTHER 自动改成日历。未知的新建类型仍返回业务 400。

`GET /v1/reports/access` 的 `available_categories` / `available_areas` / `available_work_areas` 使用同一动态目录中的可见板块；`category_catalog` 返回完整目录（含 `hidden`，旧数据默认 `false`），供板块管理和历史名称展示。缺少日历的空库或旧目录提供 `CALENDAR` /「活动日历」且只出现一次；已有同名自定义板块复用其 key，并通过可选 `builtin_key=CALENDAR` 标识语义。该标识只供来源预填，提交、筛选、授权和流转必须使用返回的实际 key，不能把别名当成授权。自定义日历改名后标识仍保留。目录读取不写库；后续管理员目录编辑沿用原乐观锁持久化补齐结果。

普通用户可选日历提交自己的工单，但不因此获得管理权限。非超级管理员必须显式授予实际日历 key 的运营范围；活动日历内容维护权限不授予反馈查看或操作权。超级管理员延续已有全部目录范围语义。未修改授权集合、历史归属、消息与未读字段。

日历入口 `/feedback?new=1&category=CALENDAR` 默认问题反馈；招募线索入口额外携带 `type=CONTENT`。前端等待目录后解析到实际 key，不从链接读取正文、账号或日程。

`POST /v1/reports` 接受 `public_consent`，默认 false，与 `client_info_consent` 独立。默认私下提交无需标题；`public_consent=true` 时 `title`（最多 120 字符）必填，空标题返回业务 400，且不读取附件或保存工单。授权不会自动发布，创建时可见性仍为 PRIVATE。

用户和管理员的私有详情返回 `public_consent`。缺少字段的旧请求/旧文档视为未授权，不自动补授权。管理员发布接口 `PATCH /v1/admin/feedback/{id}/publish` 先校验原有管理权限，再要求工单 `public_consent=true`，未授权返回业务 403 且不写公开字段。管理员不能代替用户修改授权；已公开的历史记录仍可经管理员接口更新状态或取消公开。未授权的历史记录不能重新发布或修改公开摘要。

运营在工单详情中执行接单、接手、转交运营和调整负责板块。工单状态由详情接口的 `workflow_stage` 返回；`PROCESSING` 表示已接单，重新打开详情不需要再次接单。

`GET /v1/admin/feedback/{id}/assignees` 返回当前工单可转交的运营候选人：`[{"id":"user-id","user_name":"姓名"}]`。请求者须能控制该处理中工单。结果只包含当前负责板块有运营权限的已激活用户及已激活超级管理员，排除当前负责人。无候选人时返回空数组；权限不足返回 403，工单不可转交返回 409。提交转交时仍由 `POST /v1/admin/feedback/{id}/assign` 重新校验目标权限。

`POST /v1/admin/feedback/{id}/work-area` 调整负责板块。已移除 `POST /v1/admin/feedback/{id}/handoff` 和 `POST /v1/admin/feedback/{id}/return`（含撤回）。转交运营与接手仍生成 `FEEDBACK_ASSIGNED`，原负责人、新负责人和操作人按账号去重。历史流转记录及 `FEEDBACK_DEV_HANDOFF`、`FEEDBACK_DEV_RETURN` 通知保留原始标题、说明和时间，停止生成新的程序交接通知。

`GET /v1/admin/feedback/queue` 接受 `queue`（默认 `UNASSIGNED`）、`page`（默认 1）、`pageSize`（默认 20，1–100）、`workArea`、`type`、`q`、`sortBy`（默认 `updatedAt`，仅 `createdAt`/`updatedAt`）和 `sortOrder`（默认 `desc`，仅 `asc`/`desc`，不区分大小写）。无效队列或排序返回业务 400。筛选、授权和队列条件在数据库分页前生效，返回的 `total` 是全部匹配数。管理员界面可用相同筛选、`page=1&pageSize=1` 获取每个可见队列数量。

| 队列 | 服务端条件 |
| --- | --- |
| `UNASSIGNED` 待接单 | 开放、未合并、无运营负责人，阶段不是 PROCESSING |
| `CLAIMED` 已接单 | 开放、未合并，阶段为 PROCESSING 或已有运营负责人，包含其他运营接的单 |
| `CLOSED` 已结束 | 已结案或驳回，未合并 |
| `ALL` 全部 | 授权范围内的所有状态，默认隐藏已合并来源，搜索时可查到来源 |

`CLAIMED` 可叠加 `mine=true`（运营负责人为当前账号）和 `needsReply=true`（最后一条 REPORTER 消息之后没有 ADMIN 回复），两者默认 false，其他队列忽略。个人反馈接口 `GET /v1/reports?mine=true` 仍按提交人过滤。管理端返回 `reports`、`total`、`page`、`page_size`、`mine`、`sort_by`、`sort_order`（响应中的 `mine` 表示个人列表模式，管理队列恒为 false），列表项的 `operator_assignee_user_id`、`operator_assignee_name`、`needs_reply` 供界面显示。过滤条件同时作用于列表、分页和计数。开放 API 的两个参数为 `mine` 和 `needs_reply`，仍取令牌所有者、授权板块与令牌板块的交集。

先更新全部后端实例，再切换前端和 MCP 调用方。旧 DEV_HANDOFF 工单按运营负责人是否存在归入已接单或待接单，正常操作按新阶段写入。旧程序岗位在授权迁移后获得对应运营权限，迁移前编辑这类账号授权返回 409，以保护待合并的板块。

从 backend/ 运行 `mongosh "$SHARE_MONGO_HUB_URI" --quiet --file scripts/migrations/20261123-feedback-operator-workflow.js` 预览工单编号、阶段、账号和板块。生产写入需另行确认。APPLY=1 时在同一事务内转换工单和授权，分别写入工单处理记录与管理员审计。仅原有 DEVELOPER 岗位可合并其程序板块，其他账号的残留字段不产生授权。历史 developerReturnedAt 保留在数据库，应用不读取或更新它。

## 2026-10-16：取消可见反馈类型，保留底层兼容

普通反馈表单向 `POST /v1/reports` 发送 `type=OTHER`、动态 `category` 和 `public_consent=false`，省略标题。兼容请求使用 `public_consent=true` 时仍要求非空标题。客户端信息同意独立，默认 false。请求/响应字段、全部旧类型枚举、FEEDBACK 解析及内部类型筛选接口保留；不迁移历史类型或授权。前端工作台不发送类型筛选。

举报（`REPORT`，含旧 `FEEDBACK/category=REPORT`）仅供授权人员处理，发布返回业务 403。举报不允许通过类型更新改成普通工单，也不能与普通工单相互合并；已公开普通工单不能改为 REPORT。发布与类型写入的原子条件同样校验此边界，避免并发绕过。举报仍可由原有授权方查看、回复、流转、结案或取消误公开。

待接单和已接单为主要入口，已结束和全部为次级入口。全管理范围已读不受当前筛选限制。

## 板块排序

`PUT /v1/admin/feedback-categories/order` 接受 `{"keys":["OTHER","CALENDAR"],"expected_keys":["CALENDAR","OTHER"]}`（示例仅含两个板块，实际必须包含完整 `category_catalog` 的全部 key，包括隐藏项）。`keys` 是新顺序，`expected_keys` 是客户端读取时的原顺序；响应为按新顺序排列的完整板块数组。权限沿用 `admin:feedback_access:manage`，无权限返回业务 403；重复、遗漏或未知 key 返回 400；原顺序过期或目录乐观锁冲突返回 409，客户端刷新后重试。

数组顺序直接持久化到现有目录，不新增字段或迁移数据。排序保留 key、名称、builtin_key、hidden、历史工单和授权。隐藏项仍参与排序，可见选项仅过滤隐藏项并保留相对顺序；新板块仍追加末尾。相同顺序不写库、不重复审计。实际变更在 hub 事务内记录 `FEEDBACK_CATEGORY_REORDERED`，`feedback_category_order` 前后快照为板块名称数组，供审计页面按当时名称显示。

用户执行下方已有目录测试命令即可覆盖排序新增用例。

## 板块隐藏与恢复

`PUT /v1/admin/feedback-categories/{key}/visibility` 接受 `{"hidden":true}` 隐藏，`{"hidden":false}` 恢复；响应为含 `key`、`label`、`builtin_key`、`hidden` 的目录项。沿用 `admin:feedback_access:manage` 权限和目录乐观锁：无权限、板块不存在、并发目录变更分别返回业务 403、404、409。重复设置不写库、不重复审计；变更使用 `FEEDBACK_CATEGORY_VISIBILITY_UPDATED` 审计及 `feedback_category_hidden` 前后快照。

隐藏适用于内置和自定义板块。前端用户提交/筛选、管理员筛选/调整板块/授权选择只用可见项；板块管理保留隐藏项和恢复入口。所有板块隐藏时可选目录为空，仍能查看、处理历史工单。历史名称、key、已有授权和流转权限保留；隐藏不是撤销权限，也不改变旧客户端/直接 API 的板块参数接受范围。隐藏后改名不恢复显示，自定义日历仍沿用原 key 和 builtin_key，不补建另一个可见日历。

验证（用户执行，Mongo 仅使用 TestMongo 自有一次性容器）：

```bash
./gradlew test --tests '*FeedbackCategoryServiceTest' --tests '*FeedbackAccessServiceTest' --tests '*FeedbackCategoryControllerContractTest' --console=plain
./gradlew integrationTest --tests '*FeedbackCategoryMongoTest' --console=plain
```
