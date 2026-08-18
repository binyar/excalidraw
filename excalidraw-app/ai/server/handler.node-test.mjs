import assert from "node:assert/strict";
import test from "node:test";

import { transcriptToUiMessages } from "./handler.mjs";

test("history merges one user run into one assistant card with tools", () => {
  const artifact = {
    kind: "story-artifact",
    artifactId: "artifact-1",
    canvas: { id: "story-1", title: "未来故事" },
  };
  const messages = transcriptToUiMessages([
    { role: "user", content: [{ type: "text", text: "创建故事" }] },
    {
      role: "assistant",
      content: [
        { type: "thinking", thinking: "先规划，再执行。" },
        { type: "text", text: "我先进行规划。" },
        {
          type: "toolCall",
          id: "call-story",
          name: "define_story",
          arguments: { title: "未来故事" },
        },
        {
          type: "toolCall",
          id: "call-search",
          name: "search_library_assets",
          arguments: { query: "future" },
        },
      ],
    },
    {
      role: "toolResult",
      toolCallId: "call-story",
      toolName: "define_story",
      content: [{ type: "text", text: "完成" }],
      isError: false,
    },
    {
      role: "toolResult",
      toolCallId: "call-search",
      toolName: "search_library_assets",
      content: [{ type: "text", text: "找到素材" }],
      isError: false,
    },
    {
      role: "assistant",
      content: [
        { type: "thinking", thinking: "工具已完成。" },
        { type: "text", text: "故事画布和动画已经生成。" },
      ],
    },
    {
      role: "toolResult",
      toolCallId: "call-artifact",
      toolName: "delegate_animation",
      content: [{ type: "text", text: "成品已生成" }],
      details: artifact,
      isError: false,
    },
  ]);

  assert.equal(messages.length, 2);
  assert.equal(messages[0].role, "user");
  assert.equal(messages[1].role, "assistant");
  assert.equal(
    messages[1].parts.filter((part) => part.type === "dynamic-tool").length,
    2,
  );
  assert.equal(
    messages[1].parts.find((part) => part.type === "text")?.text,
    "故事画布和动画已经生成。",
  );
  assert.deepEqual(
    messages[1].parts
      .filter((part) => part.type === "data-agent-note")
      .map((part) => part.data.text),
    ["我先进行规划。"],
  );
  assert.ok(messages[1].parts.some((part) => part.type === "data-task-plan"));
});

test("history bounds merged reasoning shown in the UI", () => {
  const messages = transcriptToUiMessages([
    { role: "user", content: [{ type: "text", text: "创建故事" }] },
    {
      role: "assistant",
      content: [{ type: "thinking", thinking: "思".repeat(20_000) }],
    },
  ]);
  const reasoning = messages[1].parts.find((part) => part.type === "reasoning");

  assert.ok(reasoning.text.length < 13_000);
  assert.match(reasoning.text, /已截断显示/);
});
