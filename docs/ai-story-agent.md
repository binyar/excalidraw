# AI 故事画布 Agent

## 架构目标

AI 创建采用“主 Agent 完成画布，动画子 Agent 完成时间轴”的严格串行结构。模型不能直接写入 Excalidraw Scene 或 AnimationProject；所有修改都通过有界工具写入 Draft，两个 Draft 校验通过后才由浏览器统一应用。

```text
用户需求
  -> 主 Agent 规划故事
  -> define_story
  -> define_story_spaces
  -> define_canvas_sections
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
  -> delegate_animation
      -> Animation Planner 子 Agent
      -> define_animation_style
      -> define_animation_scenes
      -> define_scene_cues
      -> finalize_animation_plan
      -> 确定性 AnimationPlanCompiler
      -> AnimationProject
  -> StoryArtifact
  -> 确定性 Story Compiler
  -> Excalidraw elements + AnimationProject
  -> Workspace 自动保存
```

## 主 Agent 边界

主 Agent 负责故事目标、节拍、画布内容、布局、连接关系和视觉样式。它拥有多个通用画布工具，而不是一个面向特定图形的生成工具：

- `define_story`
- `define_story_spaces`
- `define_canvas_sections`
- `search_library_assets`
- `add_library_assets`
- `add_canvas_elements`
- `update_element_styles`
- `layout_canvas_elements`
- `connect_canvas_elements`
- `finalize_canvas_draft`
- `delegate_animation`

新 Story 的常规页面内容不再由模型逐个猜测最终 `x/y`。主 Agent 先建立 `Space -> Section -> Element` 归属，并从有限布局类型中选择意图：页面 Section 使用 `row / column / grid`，Section 内部使用 `row / column / grid / overlay / free`。前三种布局确定性分配互不重叠的单元；`overlay` 是显式叠加能力；`free` 仅用于地图、拓扑、路线或必须保留精确相对坐标的自由构图。

`finalize_canvas_draft` 会先运行 Section Layout Compiler，把托管布局物化为普通绝对坐标，再执行引用、唯一 id、元素数量和连接关系校验并冻结。Section 背景和边框由分配区域派生，页面内容被限制在独立的 1280×720 安全舞台中。旧 Story、跨页 master 元素和明确的 `free` Section 继续兼容绝对坐标。冻结之后所有画布工具拒绝修改，动画子 Agent 只能读取该不可变快照。

## 内置资源库

项目在 `excalidraw-app/ai/library-catalog/` 内置 Excalidraw Libraries 资源快照。AI 不会读取或生成资源内部元素 JSON，而是按以下协议使用：

1. `search_library_assets` 使用简短英文关键词检索库名、描述和条目名称，只向模型返回少量候选摘要及稳定 `ref`；
2. `add_library_assets` 接收 `ref` 和目标位置/尺寸，由服务端读取具体 `.excalidrawlib` 条目并冻结到 Canvas Draft；
3. Story Compiler 恢复资源元素、重新生成内部 id、保持组与绑定关系、等比缩放并放到目标区域；
4. 一个资源条目在故事层是一个语义对象，动画轨道会自动展开到条目内全部 Excalidraw 元素。

资源引用使用去掉扩展名后的 `source#itemIndex`，不依赖旧资源包可能缺失的 catalog id。运行 `node scripts/copy-ai-library-catalog.mjs [source-directory]` 可从本地 Excalidraw Libraries 仓库刷新快照。

## 动画子 Agent 边界

`delegate_animation` 会启动独立 Pi Agent。动画子 Agent 是 Planner，没有任何画布写入、关键帧或 AnimationProject 工具，只拥有：

- `define_animation_style`
- `define_animation_scenes`
- `define_scene_cues`
- `finalize_animation_plan`

Planner 必须根据故事节拍、阅读时间、场景切换和停顿显式规划：

- 整个故事的 `durationMs`；
- 全局 `tone` 与 `pace`；
- 每个场景的 `startMs`、`durationMs`、`beatId` 与 `focusTargets`；
- Camera 的语义 framing、transition 与 motion character；
- 元素 enter、emphasize、exit、draw Cue 的场景内时间和语义效果。

Planner 不生成坐标、关键帧、easing 或 spring 参数。`AnimationPlanCompiler` 确定性计算 Camera 三阶段切换、初始隐藏、连接线绘制、motion character 到 Motion easing 的映射，并拒绝 Camera/Object 重叠、越界和悬空引用。Compiler 输出的 `AnimationProject` 才进入编辑器和 Motion Runtime。

不存在 AI 故事固定为 5 秒的兜底。Animation Draft 只在全部轨道结束时间不超过故事总时长时才能冻结。空白手工动画工程的初始时间轴缩短为 1 秒，AI 结果会使用动画子 Agent 规划的真实时长。

## 数据与提交

`StoryArtifact` 包含完整 Canvas Draft 和 Animation Draft。浏览器使用 `compileStoryArtifact()`：

1. 把语义元素编译为可编辑 Excalidraw elements；
2. 把语义 target id 解析为实际 element id；
3. 图形及其文字共享语义目标，动画轨道会自动展开到两者；
4. 按 `storyId` 替换同一 AI 故事，保留其它手工内容；
5. 使用动画子 Agent 规划的时长加载 AnimationProject 并自动播放；
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
