import {
  consumePendingAiCreatePrompt,
  getPendingAiThinkingEnabled,
  hasPendingAiCreatePrompt,
  savePendingAiCreatePrompt,
} from "../ai/pendingPrompt";

describe("pending AI create prompt", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });

  it("hands a workspace prompt to the editor exactly once", () => {
    savePendingAiCreatePrompt("workspace-1", "  创建审批流程  ", {
      thinkingEnabled: true,
    });

    expect(hasPendingAiCreatePrompt("workspace-1")).toBe(true);
    expect(getPendingAiThinkingEnabled("workspace-1")).toBe(true);
    expect(consumePendingAiCreatePrompt("workspace-1")).toBe("创建审批流程");
    expect(consumePendingAiCreatePrompt("workspace-1")).toBeNull();
    expect(getPendingAiThinkingEnabled("workspace-1")).toBe(true);
  });
});
