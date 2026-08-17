/**
 * Product-facing Motion guidance derived from the Motion AI Kit's universal
 * animation best practices. PiAgent cannot call the developer-facing `/motion`
 * skill or hosted MCP directly, so this context maps those principles onto the
 * semantic Planner tools that the animation sub-agent can actually execute.
 */
export const MOTION_ANIMATION_SKILL = `
## Motion 动画技能

最终动画由 Motion Runtime 执行。你不直接生成 JavaScript、CSS、motion.animate()、AnimationProject、关键帧或 easing 参数；你只编写 StoryAnimationPlan。确定性 AnimationPlanCompiler 会将场景和 Cue 编译为 AnimationProject，MotionAdapter 再交给 Motion 执行。

### 动画设计原则
1. 先表达叙事意图，再选择动画。进入用于建立信息层级，强调用于引导注意，退出用于结束当前语义，Camera 或舞台转场用于切换故事空间。章节转场不能代替 Object 动画：每章至少要有本章对象的进入或绘制，以及章节内强调；下一章不再使用的对象要在转场窗口前退出。无需给纯装饰对象堆叠多余动作。
2. transform.x、transform.y、transform.scale、transform.rotate 属于物理运动，适合 spring。文字阅读、透明度、颜色、连线绘制和精确同步更适合 preset 或 cubic-bezier。离散状态轨道不配置 easing（也不使用 steps），只在关键帧时刻切换。
3. 企业汇报、流程审批、数据看板等严肃场景应克制弹性和过冲；活泼宣传、庆祝和人物插画可以使用更明显的弹性。物体越重，通常 mass 越高、stiffness 越低或 damping 越高。
4. 可中断、可感知惯性的移动优先 spring。需要准时抵达旁白节点、Camera 切换窗口或并行动画同步点时，优先 cubic-bezier/preset，避免未稳定的 spring 在轨道末尾被截断。
5. 一段动作只承担一个主要意图。不要同时对同一对象堆叠 position、scale、rotate、opacity 的大幅变化。相同语义的列表使用轻微 stagger，不要逐项使用完全不同的效果。
6. 默认时长参考：微反馈 120-240ms；普通进入/强调 300-700ms；较大空间移动 600-1200ms；Camera reframe 900-1800ms。必须根据距离、信息密度和阅读时间调整，而不是机械套用。
7. 关键帧上的 easing 控制“从当前关键帧到下一个关键帧”的区段。最后一个关键帧无需 easing。hold 用于保持当前值直到下一帧。
8. 元素是否存在于当前画布交互层由离散的 element.visibility 控制，不由 opacity 控制。enter 会在动作开始时从 hidden 切为 visible，exit 会在动作完成时从 visible 切为 hidden；hidden 元素既不绘制也不能被选择。opacity 只用于 visible 阶段的淡入淡出。Planner 必须用 enter/exit 表达真实显隐，Compiler 会自动生成可在时间轴编辑的状态轨道。
9. 外观变化使用 type=style、effect=style，并填写 styleProperty/styleValue；不要把样式变化伪装成 emphasize。属性必须严格按元素类型选择：rectangle/diamond 支持完整图形样式和 roundness，ellipse 不支持 roundness；line 支持背景、填充、描边以及 roundness；arrow 只支持 opacity、描边颜色/宽度/样式和 roughness；freedraw 支持 opacity、描边颜色/宽度、背景和填充，但不支持 strokeStyle、roughness、roundness；独立 text 只支持 opacity、fontSize、fontFamily、textAlign，不支持任何图形描边、背景、填充、边框或 roundness，仅绑定到非箭头容器的文字才支持 verticalAlign；image 只支持 opacity 和 roundness；iframe/embeddable 按编辑器原生边框能力配置；frame/magicframe 只支持 opacity。当前 Canvas Draft 的 connector 最终物化为 arrow，library asset 默认按 opacity 的保守能力处理。

### 样式属性精确值
- visual.opacity：0..1；颜色使用 #RRGGBBAA。
- visual.fillStyle：hachure | cross-hatch | solid | zigzag。
- visual.strokeStyle：solid | dashed | dotted；visual.strokeWidth 为非负数；visual.roughness 为 0 | 1 | 2。
- visual.roundness：规范关键帧值使用圆角进度 0..1；UI 的直角/圆角选项写入 0/1，Agent 也应优先输出 0/1。旧项目的 sharp/round 输入仍兼容。关键帧之间必须按 easing 连续插值圆角半径。
- text.fontSize：正数；text.fontFamily：1 手写体、2 无衬线、3 等宽体、5 Excalifont。
- text.textAlign：left | center | right；text.verticalAlign：top | middle | bottom。
- 只有 fillStyle、strokeStyle、roughness（线条风格）、fontFamily、textAlign、verticalAlign 和 element.visibility 是离散状态：只在关键帧时刻切换，不得配置 easing 或关键帧连线。roughness 的 0/1/2 是枚举 ID，不是可插值的度量值。roundness、strokeWidth、fontSize 以及颜色都是连续动画属性；颜色按 RGBA 分量插值。

### Motion character
- precise：精确、克制、准时完成，适合汇报、流程、数据与 Camera Zoom。
- gentle：柔和自然，适合一般内容进入和相邻区域平移。
- snappy：快速响应但不过度弹跳，适合强调和较短移动。
- heavy：体现重量和惯性，适合大型卡片或沉稳章节。
- elastic：明显弹性，只适合活泼、庆祝和插画场景。
- dramatic：更强的节奏与景别变化，适合章节转折。

### 工具映射
- define_animation_style：定义全局时长、tone 和 pace。
- define_animation_scenes：定义场景边界、故事节拍、焦点和 Camera 意图。
- define_scene_cues：逐章定义元素入场、章节内强调、样式变化、转场前出场和连线绘制的语义动作；每章必须调用且不得提交空 cues。
- finalize_animation_plan：调用确定性 Compiler，生成 Motion Runtime 可执行的 AnimationProject。

在 finalize_animation_plan 前检查：每章是否都有可编辑的 Object 轨道、后续元素是否通过 enter 在入场前保持 hidden、上一章对象是否通过 exit 在转场前变为 hidden、是否错误地只用 opacity 模拟显隐、章节内是否存在清晰的强调节奏、Camera/舞台转场是否与 Object Cue 冲突、spring 是否有足够稳定时间、所有轨道是否落在故事总时长内。只有 Transition 轨道而没有 Object 轨道的计划是不完整的。`;
