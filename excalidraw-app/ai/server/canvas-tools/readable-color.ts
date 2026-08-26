export const DEFAULT_SHAPE_BACKGROUND_COLOR = "#E7F5FF";
const DEFAULT_DARK_TEXT_COLOR = "#1F2937";
const DEFAULT_LIGHT_TEXT_COLOR = "#F8FAFC";
const MIN_TEXT_CONTRAST_RATIO = 4.5;

type RgbaColor = {
  r: number;
  g: number;
  b: number;
  a: number;
};

const parseHexColor = (value: unknown): RgbaColor | null => {
  const match = /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec(
    String(value || "").trim(),
  );
  if (!match) {
    return null;
  }
  const hex = match[1];
  const expanded =
    hex.length <= 4
      ? [...hex].map((character) => `${character}${character}`).join("")
      : hex;
  return {
    r: Number.parseInt(expanded.slice(0, 2), 16),
    g: Number.parseInt(expanded.slice(2, 4), 16),
    b: Number.parseInt(expanded.slice(4, 6), 16),
    a:
      expanded.length === 8
        ? Number.parseInt(expanded.slice(6, 8), 16) / 255
        : 1,
  };
};

const compositeOverWhite = (color: RgbaColor): RgbaColor => ({
  r: color.r * color.a + 255 * (1 - color.a),
  g: color.g * color.a + 255 * (1 - color.a),
  b: color.b * color.a + 255 * (1 - color.a),
  a: 1,
});

const relativeLuminance = (color: RgbaColor) => {
  const linear = (channel: number) => {
    const normalized = channel / 255;
    return normalized <= 0.04045
      ? normalized / 12.92
      : ((normalized + 0.055) / 1.055) ** 2.4;
  };
  return (
    linear(color.r) * 0.2126 +
    linear(color.g) * 0.7152 +
    linear(color.b) * 0.0722
  );
};

const contrastRatio = (left: RgbaColor, right: RgbaColor) => {
  const lighter = Math.max(relativeLuminance(left), relativeLuminance(right));
  const darker = Math.min(relativeLuminance(left), relativeLuminance(right));
  return (lighter + 0.05) / (darker + 0.05);
};

export const resolveReadableTextColor = (
  backgroundColor: unknown,
  preferredTextColor: unknown,
) => {
  const background = compositeOverWhite(
    parseHexColor(backgroundColor) ??
      (parseHexColor(DEFAULT_SHAPE_BACKGROUND_COLOR) as RgbaColor),
  );
  const preferred = parseHexColor(preferredTextColor);
  if (
    preferred &&
    contrastRatio(background, compositeOverWhite(preferred)) >=
      MIN_TEXT_CONTRAST_RATIO
  ) {
    return String(preferredTextColor);
  }

  return [DEFAULT_DARK_TEXT_COLOR, DEFAULT_LIGHT_TEXT_COLOR].sort(
    (left, right) =>
      contrastRatio(
        background,
        compositeOverWhite(parseHexColor(right) as RgbaColor),
      ) -
      contrastRatio(
        background,
        compositeOverWhite(parseHexColor(left) as RgbaColor),
      ),
  )[0];
};
