import {
  getContainRect,
  getVideoFileExtension,
  resolveVideoRecorderMimeType,
} from "./videoRecorder";

describe("animation video recorder", () => {
  it("prefers H.264 MP4 and falls back through browser-supported codecs", () => {
    expect(resolveVideoRecorderMimeType(() => true)).toBe(
      "video/mp4;codecs=avc1.42E01E",
    );
    expect(
      resolveVideoRecorderMimeType(
        (mimeType) => mimeType === "video/mp4;codecs=avc1",
      ),
    ).toBe("video/mp4;codecs=avc1");
    expect(
      resolveVideoRecorderMimeType(
        (mimeType) => mimeType === "video/webm;codecs=vp8",
      ),
    ).toBe("video/webm;codecs=vp8");
    expect(resolveVideoRecorderMimeType(() => false)).toBeNull();
  });

  it("uses a filename extension matching the recorded MIME type", () => {
    expect(getVideoFileExtension("video/mp4;codecs=avc1.42E01E")).toBe("mp4");
    expect(getVideoFileExtension("video/webm;codecs=vp9")).toBe("webm");
  });

  it("letterboxes the live story canvas without distorting its aspect ratio", () => {
    expect(getContainRect(1000, 1000, 1280, 720)).toEqual({
      x: 280,
      y: 0,
      width: 720,
      height: 720,
    });
    expect(getContainRect(1920, 1080, 1280, 720)).toEqual({
      x: 0,
      y: 0,
      width: 1280,
      height: 720,
    });
  });
});
