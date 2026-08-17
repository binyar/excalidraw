import {
  dataPresets,
  emphasisPresets,
  entrancePresets,
  transformPresets,
} from "./presets";

export * from "./presets";
export * from "./types";

export const animationPresetCatalog = [
  ...entrancePresets,
  ...emphasisPresets,
  ...transformPresets,
  ...dataPresets,
] as const;

export const animationPresetsByName = Object.fromEntries(
  animationPresetCatalog.map((preset) => [preset.name, preset]),
) as {
  [TName in typeof animationPresetCatalog[number]["name"]]: Extract<
    typeof animationPresetCatalog[number],
    { name: TName }
  >;
};
