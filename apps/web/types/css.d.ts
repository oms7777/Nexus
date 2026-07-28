/**
 * Next.js ships declarations for `*.module.css` only, so side-effect imports of a
 * plain stylesheet (e.g. `import "maplibre-gl/dist/maplibre-gl.css"`) have no type.
 * The bundler resolves them fine; this only keeps `tsc --noEmit` honest.
 */
declare module "*.css";
