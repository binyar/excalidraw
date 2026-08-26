import { Type } from "@earendil-works/pi-ai";

import { elementSchema, styleSchema } from "./schemas.ts";
import {
  assertCanvasDraftCapacity,
  assertDirectorFrozen,
  assertMutable,
} from "./state-guards.ts";
import { defineTool, resultText } from "./tool-types.ts";

import type {
  CanvasDraftConnector,
  CanvasDraftElement,
} from "../../../../src/ai/story/types.ts";
import type { CanvasDraftState } from "./state.ts";

const getConnectorSpacingWarning = (
  connector: CanvasDraftConnector,
  from: CanvasDraftElement,
  to: CanvasDraftElement,
) => {
  const fromCenterX = from.x + from.width / 2;
  const fromCenterY = from.y + from.height / 2;
  const toCenterX = to.x + to.width / 2;
  const toCenterY = to.y + to.height / 2;
  const deltaX = Math.abs(toCenterX - fromCenterX);
  const deltaY = Math.abs(toCenterY - fromCenterY);
  const requiredGap = 96;
  const horizontalGap = deltaX - (from.width + to.width) / 2;
  const verticalGap = deltaY - (from.height + to.height) / 2;
  const actualGap = deltaX >= deltaY ? horizontalGap : verticalGap;
  if (actualGap < requiredGap) {
    return `连接线 ${connector.id} 的节点净距为 ${Math.max(
      0,
      Math.round(actualGap),
    )}px，建议至少 ${requiredGap}px；连接已保留，可后续调整布局。`;
  }
  return null;
};

export const createElementTools = (state: CanvasDraftState) => [
  defineTool({
    name: "add_canvas_elements",
    label: "添加画布元素",
    description:
      "添加可编辑图形或独立文字。新故事的顶层内容应提供 sectionId，由 Section 布局在冻结前确定性计算坐标；此时 x/y 可以省略，width/height 只是期望尺寸。只有 free Section 或未托管的兼容内容才直接填写左上角 x/y。卡片全部文案必须直接写入父图形的 label，并使用 style.textAlign/style.verticalAlign 控制对齐，禁止创建子文字。",
    parameters: Type.Object({
      elements: Type.Array(elementSchema, { minItems: 1, maxItems: 80 }),
    }),
    executionMode: "sequential",
    async execute(_id, params) {
      assertMutable(state);
      assertDirectorFrozen(state);
      const existingIds = new Set([
        ...state.elements.map((element) => element.id),
        ...state.connectors.map((connector) => connector.id),
      ]);
      const pendingElements = [];
      for (const element of params.elements) {
        if (existingIds.has(element.id)) {
          throw new Error(`画布语义 id 重复：${element.id}`);
        }
        if (Boolean(element.parentId) !== Boolean(element.layout)) {
          throw new Error(`元素 ${element.id} 必须同时提供 parentId 和 layout`);
        }
        if (element.type === "text" && element.parentId) {
          throw new Error(
            `卡片内文字 ${element.id} 必须直接写入父图形 ${element.parentId} 的 label；只有图标资源可以使用 parentId + layout`,
          );
        }
        if (
          element.sectionId &&
          !state.sections.some((section) => section.id === element.sectionId)
        ) {
          throw new Error(
            `元素 ${element.id} 引用了不存在的 Section ${element.sectionId}`,
          );
        }
        if (
          !element.parentId &&
          !element.sectionId &&
          (element.x === undefined ||
            element.y === undefined ||
            element.width === undefined ||
            element.height === undefined)
        ) {
          throw new Error(
            `未托管到 Section 的顶层元素 ${element.id} 必须提供 x、y、width 和 height`,
          );
        }
        const nextElement = {
          ...structuredClone(element),
          x: element.x ?? 0,
          y: element.y ?? 0,
          width: element.width ?? (element.type === "text" ? 240 : 200),
          height: element.height ?? (element.type === "text" ? 48 : 120),
          ...(element.sectionId
            ? {
                layoutFrame: {
                  x: element.x ?? 0,
                  y: element.y ?? 0,
                  width: element.width ?? (element.type === "text" ? 240 : 200),
                  height:
                    element.height ?? (element.type === "text" ? 48 : 120),
                  ...(element.style?.fontSize
                    ? { fontSize: element.style.fontSize }
                    : {}),
                },
              }
            : {}),
        };
        existingIds.add(element.id);
        pendingElements.push(nextElement);
      }
      assertCanvasDraftCapacity(state, pendingElements.length);
      state.elements.push(...pendingElements);
      if (pendingElements.some((element) => element.sectionId)) {
        state.layoutNeedsMaterialization = true;
      }
      return resultText(`已添加 ${params.elements.length} 个画布元素。`);
    },
  }),
  defineTool({
    name: "update_canvas_elements",
    label: "修改现有画布元素",
    description:
      "二次编辑时原位更新现有语义元素。省略的字段保持当前值和几何信息不变，用户可见文案必须使用中文。",
    parameters: Type.Object({
      updates: Type.Array(
        Type.Object({
          elementId: Type.String({ minLength: 1, maxLength: 64 }),
          label: Type.Optional(Type.String({ maxLength: 500 })),
          role: Type.Optional(Type.String({ maxLength: 64 })),
          sectionId: Type.Optional(
            Type.String({ minLength: 1, maxLength: 64 }),
          ),
          x: Type.Optional(Type.Number({ minimum: -20_000, maximum: 20_000 })),
          y: Type.Optional(Type.Number({ minimum: -20_000, maximum: 20_000 })),
          width: Type.Optional(Type.Number({ minimum: 1, maximum: 4000 })),
          height: Type.Optional(Type.Number({ minimum: 1, maximum: 4000 })),
          style: Type.Optional(styleSchema),
        }),
        { minItems: 1, maxItems: 80 },
      ),
    }),
    executionMode: "sequential",
    async execute(_id, params) {
      assertMutable(state);
      assertDirectorFrozen(state);
      const resolved = params.updates.map((update) => {
        const element = state.elements.find(
          (candidate) => candidate.id === update.elementId,
        );
        if (!element) {
          throw new Error(`找不到元素：${update.elementId}`);
        }
        if (
          update.sectionId &&
          !state.sections.some((section) => section.id === update.sectionId)
        ) {
          throw new Error(
            `元素 ${element.id} 引用了不存在的 Section ${update.sectionId}`,
          );
        }
        return { element, update };
      });
      resolved.forEach(({ element, update }) => {
        const nextSectionId = update.sectionId ?? element.sectionId;
        if (nextSectionId) {
          element.layoutFrame = {
            x: update.x ?? element.layoutFrame?.x ?? element.x,
            y: update.y ?? element.layoutFrame?.y ?? element.y,
            width: update.width ?? element.layoutFrame?.width ?? element.width,
            height:
              update.height ?? element.layoutFrame?.height ?? element.height,
            ...(update.style?.fontSize || element.layoutFrame?.fontSize
              ? {
                  fontSize:
                    update.style?.fontSize ?? element.layoutFrame?.fontSize,
                }
              : {}),
          };
        }
        const { elementId: _elementId, style, ...fields } = update;
        Object.assign(element, fields);
        if (style) {
          element.style = { ...element.style, ...style };
        }
        if (nextSectionId) {
          state.layoutNeedsMaterialization = true;
        }
      });
      return resultText(`已原位修改 ${resolved.length} 个现有画布元素。`);
    },
  }),
  defineTool({
    name: "remove_canvas_items",
    label: "删除现有画布内容",
    description:
      "按用户要求删除现有语义元素、资源库条目或连接线。相关连接线和故事节拍引用会被自动清理。",
    parameters: Type.Object({
      ids: Type.Array(Type.String({ minLength: 1, maxLength: 64 }), {
        minItems: 1,
        maxItems: 80,
      }),
    }),
    executionMode: "sequential",
    async execute(_id, params) {
      assertMutable(state);
      assertDirectorFrozen(state);
      const requested = new Set<string>(params.ids);
      const removed = new Set<string>();
      const managedItemIds = new Set(
        [...state.elements, ...state.libraryAssets]
          .filter((item) => item.sectionId)
          .map((item) => item.id),
      );
      const removeMatching = <TItem extends { id: string; parentId?: string }>(
        items: TItem[],
      ): TItem[] =>
        items.filter((item) => {
          const shouldRemove =
            requested.has(item.id) ||
            (item.parentId && requested.has(item.parentId));
          if (shouldRemove) {
            removed.add(item.id);
          }
          return !shouldRemove;
        });
      state.elements = removeMatching(state.elements);
      state.libraryAssets = removeMatching(state.libraryAssets);
      if ([...removed].some((id) => managedItemIds.has(id))) {
        state.layoutNeedsMaterialization = true;
      }
      state.connectors = state.connectors.filter((connector) => {
        const shouldRemove =
          requested.has(connector.id) ||
          removed.has(connector.from) ||
          removed.has(connector.to);
        if (shouldRemove) {
          removed.add(connector.id);
        }
        return !shouldRemove;
      });
      const missing = params.ids.filter((id) => !removed.has(id));
      if (removed.size === 0) {
        throw new Error(`找不到要删除的画布内容：${missing.join("、")}`);
      }
      return resultText(
        `已删除 ${removed.size} 个画布条目${
          missing.length ? `；未找到 ${missing.join("、")}` : ""
        }。`,
      );
    },
  }),
  defineTool({
    name: "update_element_styles",
    label: "设置元素样式",
    description: "更新画布草稿中现有元素的视觉样式。",
    parameters: Type.Object({
      updates: Type.Array(
        Type.Object({
          elementId: Type.String({ minLength: 1, maxLength: 64 }),
          style: styleSchema,
        }),
        { minItems: 1, maxItems: 80 },
      ),
    }),
    executionMode: "sequential",
    async execute(_id, params) {
      assertMutable(state);
      assertDirectorFrozen(state);
      const nextStyles = new Map<string, CanvasDraftElement["style"]>();
      for (const update of params.updates) {
        const element = state.elements.find(
          (candidate) => candidate.id === update.elementId,
        );
        if (!element) {
          throw new Error(`找不到元素：${update.elementId}`);
        }
        nextStyles.set(element.id, { ...element.style, ...update.style });
      }
      for (const [elementId, style] of nextStyles) {
        const element = state.elements.find(
          (candidate) => candidate.id === elementId,
        );
        if (!element) {
          throw new Error(`找不到元素：${elementId}`);
        }
        element.style = style;
      }
      return resultText(`已更新 ${params.updates.length} 个元素的样式。`);
    },
  }),
  defineTool({
    name: "layout_canvas_elements",
    label: "布局画布元素",
    description: "将画布草稿中的现有元素按水平、垂直或网格方式排列。",
    parameters: Type.Object({
      elementIds: Type.Array(Type.String(), { minItems: 1, maxItems: 80 }),
      direction: Type.Union([
        Type.Literal("horizontal"),
        Type.Literal("vertical"),
        Type.Literal("grid"),
      ]),
      originX: Type.Number({ minimum: -20_000, maximum: 20_000 }),
      originY: Type.Number({ minimum: -20_000, maximum: 20_000 }),
      gapX: Type.Number({ minimum: 0, maximum: 2000 }),
      gapY: Type.Number({ minimum: 0, maximum: 2000 }),
      columns: Type.Optional(Type.Number({ minimum: 1, maximum: 20 })),
    }),
    executionMode: "sequential",
    async execute(_id, params) {
      assertMutable(state);
      assertDirectorFrozen(state);
      const arrangedElements = params.elementIds.map((elementId) => {
        const element = state.elements.find(
          (candidate) => candidate.id === elementId,
        );
        if (!element) {
          throw new Error(`找不到元素：${elementId}`);
        }
        return element;
      });
      let cursorX = params.originX;
      let cursorY = params.originY;
      arrangedElements.forEach((element, index) => {
        if (params.direction === "horizontal") {
          element.x = cursorX;
          element.y = params.originY;
          cursorX += element.width + params.gapX;
        } else if (params.direction === "vertical") {
          element.x = params.originX;
          element.y = cursorY;
          cursorY += element.height + params.gapY;
        } else {
          const columns =
            params.columns || Math.ceil(Math.sqrt(params.elementIds.length));
          const column = index % columns;
          const row = Math.floor(index / columns);
          const maxWidth = Math.max(
            ...arrangedElements.map((candidate) => candidate.width),
          );
          const maxHeight = Math.max(
            ...arrangedElements.map((candidate) => candidate.height),
          );
          element.x = params.originX + column * (maxWidth + params.gapX);
          element.y = params.originY + row * (maxHeight + params.gapY);
        }
      });
      return resultText(`已完成 ${params.elementIds.length} 个元素的布局。`);
    },
  }),
  defineTool({
    name: "fit_canvas_element_to_content",
    label: "按内容调整包围元素",
    description:
      "在目标内容完成创建和布局后，根据目标元素的共同包围盒与统一内边距，确定性调整一个现有顶层图形的位置和尺寸。适用于背景、章节边框和分组轮廓；不会移动或缩放目标内容。",
    parameters: Type.Object({
      elementId: Type.String({ minLength: 1, maxLength: 64 }),
      targetIds: Type.Array(Type.String({ minLength: 1, maxLength: 64 }), {
        minItems: 1,
        maxItems: 80,
      }),
      padding: Type.Number({ minimum: 0, maximum: 1000 }),
    }),
    executionMode: "sequential",
    async execute(_id, params) {
      assertMutable(state);
      assertDirectorFrozen(state);
      const element = state.elements.find(
        (candidate) => candidate.id === params.elementId,
      );
      if (!element) {
        throw new Error(`找不到要调整的元素：${params.elementId}`);
      }
      if (element.type === "text" || element.parentId) {
        throw new Error(
          `元素 ${params.elementId} 必须是可作为背景或边框的顶层图形`,
        );
      }
      if (element.sectionId) {
        throw new Error(
          `托管到 Section 的背景 ${params.elementId} 会由布局编译器自动调整，无需调用 fit_canvas_element_to_content`,
        );
      }
      if (params.targetIds.includes(params.elementId)) {
        throw new Error(`包围元素 ${params.elementId} 不能包含自身`);
      }
      const allItems = [...state.elements, ...state.libraryAssets];
      const targets = [...new Set(params.targetIds)].map((targetId) => {
        const target = allItems.find((candidate) => candidate.id === targetId);
        if (!target) {
          throw new Error(`找不到要包围的目标元素：${targetId}`);
        }
        return target;
      });
      const left = Math.min(...targets.map((target) => target.x));
      const top = Math.min(...targets.map((target) => target.y));
      const right = Math.max(
        ...targets.map((target) => target.x + target.width),
      );
      const bottom = Math.max(
        ...targets.map((target) => target.y + target.height),
      );
      element.x = left - params.padding;
      element.y = top - params.padding;
      element.width = right - left + params.padding * 2;
      element.height = bottom - top + params.padding * 2;
      return resultText(
        `已按 ${targets.length} 个目标元素调整 ${params.elementId} 的包围尺寸。`,
        {
          kind: "fitted-canvas-element",
          elementId: params.elementId,
          targetIds: targets.map((target) => target.id),
          padding: params.padding,
          bounds: {
            x: element.x,
            y: element.y,
            width: element.width,
            height: element.height,
          },
        },
      );
    },
  }),
  defineTool({
    name: "connect_canvas_elements",
    label: "连接画布元素",
    description:
      "仅在存在明确业务关系时选择性创建可编辑箭头，例如流程流转、因果、依赖、层级或数据流。不得用箭头表示演示顺序、视觉引导、装饰或动画顺序。",
    parameters: Type.Object({
      connectors: Type.Array(
        Type.Object({
          id: Type.String({ minLength: 1, maxLength: 64 }),
          from: Type.String({ minLength: 1, maxLength: 64 }),
          to: Type.String({ minLength: 1, maxLength: 64 }),
          label: Type.Optional(Type.String({ maxLength: 160 })),
          role: Type.Optional(Type.String({ maxLength: 64 })),
          relationship: Type.Union([
            Type.Literal("process-flow"),
            Type.Literal("causal"),
            Type.Literal("dependency"),
            Type.Literal("hierarchy"),
            Type.Literal("data-flow"),
          ]),
          meaning: Type.String({ minLength: 2, maxLength: 200 }),
          style: Type.Optional(styleSchema),
        }),
        { minItems: 1, maxItems: 120 },
      ),
    }),
    executionMode: "sequential",
    async execute(_id, params) {
      assertMutable(state);
      assertDirectorFrozen(state);
      const spacingWarnings = [];
      const elementIds = new Set(state.elements.map((element) => element.id));
      const allIds = new Set([
        ...elementIds,
        ...state.connectors.map((connector) => connector.id),
      ]);
      for (const connector of params.connectors) {
        if (allIds.has(connector.id)) {
          throw new Error(`画布语义 id 重复：${connector.id}`);
        }
        if (!elementIds.has(connector.from) || !elementIds.has(connector.to)) {
          throw new Error(`连接线 ${connector.id} 引用了不存在的元素`);
        }
        if (
          /(阅读|展示|下一页|下一个|动画|出场|视觉|装饰|排版|顺序)/.test(
            connector.meaning,
          )
        ) {
          throw new Error(
            `连接线 ${connector.id} 没有表达有效业务关系；阅读、展示和动画顺序应通过布局与时间轴表达`,
          );
        }
        const from = state.elements.find(
          (element) => element.id === connector.from,
        );
        const to = state.elements.find(
          (element) => element.id === connector.to,
        );
        if (!from || !to) {
          throw new Error(`连接线 ${connector.id} 引用了不存在的元素`);
        }
        const spacingWarning = getConnectorSpacingWarning(connector, from, to);
        if (spacingWarning) {
          spacingWarnings.push(spacingWarning);
        }
        allIds.add(connector.id);
      }
      for (const connector of params.connectors) {
        state.connectors.push(structuredClone(connector));
      }
      return resultText(
        `已添加 ${params.connectors.length} 条连接线。${
          spacingWarnings.length > 0 ? ` ${spacingWarnings.join(" ")}` : ""
        }`,
        spacingWarnings.length > 0
          ? { kind: "connector-spacing-warnings", warnings: spacingWarnings }
          : undefined,
      );
    },
  }),
];
