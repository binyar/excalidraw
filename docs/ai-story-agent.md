# AI 故事画布 Agent

## 架构目标

AI 创建采用“主 Agent 编写完整动态故事 DSL，执行工具确定性实现画布与动画”的结构。主 Agent 是唯一的编剧和导演；不存在画布冻结后由动画子 Agent 二次规划故事的步骤。模型不能直接写入 Excalidraw Scene、AnimationProject 或低层关键帧。

```text
用户需求
  -> 主 Agent 规划故事
  -> define_story
  -> define_story_spaces
  -> define_canvas_sections
  -> define_story_direction
  -> define_story_content（每批最多 40 项）
  -> define_story_scene（一次一个场景）
  -> finalize_story_plan
      -> 无参数校验并冻结已分段写入的 DSL
      -> 冻结 StoryDirectorPlan v2
  -> search_library_assets / add_library_assets
  -> add_canvas_elements / update_element_styles
  -> Section Layout Compiler
      -> 测量托管内容期望尺寸
      -> 排列 Section 内部元素
      -> 排列页面 Section
      -> 派生 Section 背景与边框
      -> 物化 1280×720 舞台绝对坐标
  -> connect_canvas_elements
  -> finalize_canvas_draft
  -> compile_story_artifact
      -> 确定性 AnimationPlanCompiler
      -> Camera / Object / Transition Tracks
      -> AnimationProject
  -> StoryArtifact
  -> 确定性 Story Compiler
  -> Excalidraw elements + AnimationProject
  -> Workspace 自动保存
```

## 主 Agent 边界

主 Agent 负责故事目标、节拍、完整时间轴、场景内容、镜头、转场、动作、画布布局、连接关系和视觉样式。它拥有以下规划与执行工具：

- `define_story`
- `define_story_spaces`
- `define_canvas_sections`
- `define_story_direction`
- `define_story_content`
- `define_story_scene`
- `finalize_story_plan`
- `search_library_assets`
- `add_library_assets`
- `add_canvas_elements`
- `update_element_styles`
- `layout_canvas_elements`
- `connect_canvas_elements`
- `finalize_canvas_draft`
- `compile_story_artifact`

新 Story 的常规页面内容不再由模型逐个猜测最终 `x/y`。主 Agent 先建立 `Space -> Section -> Element` 归属，并从有限布局类型中选择意图：页面 Section 使用 `row / column / grid`，Section 内部使用 `row / column / grid / overlay / free`。前三种布局确定性分配互不重叠的单元；`overlay` 是显式叠加能力；`free` 仅用于地图、拓扑、路线或必须保留精确相对坐标的自由构图。

大型 Director DSL 不再作为 `finalize_story_plan` 的单次嵌套参数传输。主 Agent 先用 `define_story_direction` 写入全局导演参数，用可重复调用的 `define_story_content` 分批写入内容，再逐场景调用 `define_story_scene`。每次 Agent 回复只提交一个 Director 工具调用，因此故事长度增长不会截断最终冻结参数。

`finalize_story_plan` 必须发生在任何画布写入之前，并且只接收空对象。它从服务端暂存的分段 DSL 组装完整计划，再对模型常见的可恢复表达问题执行确定性归一化，例如把 `2500ms`、`2.5s` 转成毫秒数值、把空 optional 字符串视为未设置、移除首场景转场、依据 `same-space/new-page` 合同补齐正确的 Camera 或页面转场，以及把 Cue 收回合法时间窗口；修复明细会随工具结果返回。归一化后的 `StoryDirectorPlan v2` 才被冻结为唯一权威源。

`content` 逐项声明最终画布中的全部文本、图形、视觉素材和连接，场景中的 `focusTargets` 与 Cue targets 只能引用这些稳定语义 id。随后画布工具只负责实现 DSL，不能增加未声明内容。冻结后的执行和 `compile_story_artifact` 仍使用严格模式，不会静默改变故事、镜头或 Cue。

`finalize_canvas_draft` 会运行 Section Layout Compiler，把托管布局物化为普通绝对坐标，再校验唯一 id、元素数量、连接关系，以及 Director DSL 声明的每个内容目标是否真实存在。缺失目标会直接失败，不再自动清理故事引用。冻结之后所有画布工具拒绝修改。

## 内置资源库

项目在 `excalidraw-app/ai/library-catalog/` 内置 Excalidraw Libraries 资源快照。AI 不会读取或生成资源内部元素 JSON，而是按以下协议使用：

1. `search_library_assets` 使用简短英文关键词检索库名、描述和条目名称，只向模型返回少量候选摘要及稳定 `ref`；
2. `add_library_assets` 接收 `ref` 和目标位置/尺寸，由服务端读取具体 `.excalidrawlib` 条目并冻结到 Canvas Draft；
3. Story Compiler 恢复资源元素、重新生成内部 id、保持组与绑定关系、等比缩放并放到目标区域；
4. 一个资源条目在故事层是一个语义对象，动画轨道会自动展开到条目内全部 Excalidraw 元素。

资源引用使用去掉扩展名后的 `source#itemIndex`，不依赖旧资源包可能缺失的 catalog id。运行 `node scripts/copy-ai-library-catalog.mjs [source-directory]` 可从本地 Excalidraw Libraries 仓库刷新快照。

## Director DSL 与动画执行边界

主 Agent 必须通过分段 Director 工具，根据故事节拍、阅读时间、场景切换和停顿显式规划；`finalize_story_plan` 只校验和冻结：

- 整个故事的 `durationMs`；
- 全局 `tone` 与 `pace`；
- 每个场景的 `startMs`、`durationMs`、`beatId` 与 `focusTargets`；
- Camera 的语义 framing、transition 与 motion character；
- 元素 enter、emphasize、exit、draw Cue 的场景内时间和语义效果。

主 Agent 不生成坐标、关键帧、easing 或 spring 参数。`compile_story_artifact` 直接将 Director DSL 投影为现有的语义动画计划；`AnimationPlanCompiler` 确定性计算 Camera 三阶段切换、初始隐藏、连接线绘制、motion character 到 Motion easing 的映射，并拒绝 Camera/Object 重叠、越界和悬空引用。执行阶段不得修改场景顺序、时间、镜头或 Cue 意图。

不存在 AI 故事固定为 5 秒的兜底。Animation Draft 只在全部轨道结束时间不超过故事总时长时才能冻结。空白手工动画工程的初始时间轴为 1 秒，AI 结果使用主 Agent 在 Director DSL 中规划的真实时长。

## 数据与提交

`StoryArtifact` 包含权威的 `directorPlan`，以及由它派生的 Canvas Draft 和 Animation Draft。浏览器使用 `compileStoryArtifact()`：

1. 把语义元素编译为可编辑 Excalidraw elements；
2. 把语义 target id 解析为实际 element id；
3. 图形及其文字共享语义目标，动画轨道会自动展开到两者；
4. 按 `storyId` 替换同一 AI 故事，保留其它手工内容；
5. 使用 Director DSL 的总时长加载 AnimationProject 并自动播放；
6. 由现有 Workspace 保存机制把 Scene 和 Animation DSL 一起持久化。

## 运行与验证

```bash
DEEP_SEEK_API_KEY="你的密钥" pnpm dev

pnpm test:typecheck
pnpm exec vitest run src/ai/story/compiler.test.ts
pnpm test:ai
pnpm test:workspace
pnpm build
```
