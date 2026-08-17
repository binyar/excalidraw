/**
 * Points Excalidraw's dynamically registered font faces at this application.
 *
 * Vite serves imported fonts through `/@fs/` in development and emits them
 * under `/fonts/` in production. Using the current origin keeps both modes
 * local and prevents Excalidraw from falling back to its public esm.sh CDN.
 * Fonts are not preloaded; the browser requests only the faces needed by the
 * current scene.
 *
 * @returns {import("vite").PluginOption}
 */
module.exports.woff2BrowserPlugin = () => ({
  name: "woff2BrowserPlugin",
  transformIndexHtml(html) {
    return html.replace(
      "<!-- PLACEHOLDER:EXCALIDRAW_APP_FONTS -->",
      `<script>
        window.EXCALIDRAW_ASSET_PATH = "/";
      </script>`,
    );
  },
});
