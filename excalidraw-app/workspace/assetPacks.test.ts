import { describe, expect, it } from "vitest";

import { getAssetPackIdFromPath, isAssetLibraryPath } from "./assetPacks";

describe("asset library routes", () => {
  it("recognizes the list and detail routes", () => {
    expect(isAssetLibraryPath("/assets")).toBe(true);
    expect(isAssetLibraryPath("/assets/")).toBe(true);
    expect(isAssetLibraryPath("/assets/cloud-pack")).toBe(true);
    expect(isAssetLibraryPath("/files")).toBe(false);
  });

  it("decodes a pack id from a detail route", () => {
    expect(getAssetPackIdFromPath("/assets/cloud%20pack")).toBe("cloud pack");
    expect(getAssetPackIdFromPath("/assets")).toBeNull();
  });
});
