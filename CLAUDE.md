# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

The Palladio website / reference app: a thin AngularJS 1.x shell that wires together the Palladio framework and its separately-versioned visualization components (map, graph, table, cards, timeline, timespan, facet). Almost all real functionality lives in those upstream packages, not here.

## Commands

```
yarn install
yarn build        # production: NODE_ENV=production webpack
yarn build-dev    # development webpack build
yarn develop      # webpack --watch
python -m http.server   # serve the repo root, then open index.html
```

There are no tests or linters.

The build uses webpack 4. On Node 17+ it fails with `ERR_OSSL_EVP_UNSUPPORTED` unless you prefix it with `NODE_OPTIONS=--openssl-legacy-provider`. If yarn isn't installed globally, `npx yarn@1 <cmd>` works.

Docker: `docker build --platform linux/amd64 -t palladio-app .` builds the assets with Node, then serves the static files from nginx on port 80. The nginx config is `docker/default.conf.template`, where the image fills in `${FRAME_ANCESTORS}` from the environment. Any new top-level file the page loads must be added to the `COPY` lines in the `Dockerfile`.

To develop against a local checkout of the framework: in the `palladio` repo run `yarn link`, then here run `yarn link palladio`.

## How the build actually works

- The webpack build exists mainly to **copy each dependency's `dist/` folder into `assets/<package>/`** (via CopyWebpackPlugin). `assets/` and `node_modules/` are gitignored, so the app won't load until you build.
- `index.html` loads the copied `assets/*/…min.js` and `.css` files, then loads the app's own sources **directly** as plain `<script>` tags (`js/controllers.js`, `js/directives/*.js`, `js/app.js`). It does not use webpack's bundled `palladio-app.js` output. A new JS file must be added as a `<script>` tag in `index.html`, and its Angular module added to the dependency list in `js/app.js`.
- Dependencies are pinned to GitHub branches (`#1.3.x`, `#1.2.x`, etc.) in `package.json`, not npm versions. To move a component to a new release line, change the branch suffix and reinstall. Recent commits do this, e.g. "Use palladio-graph-component 1.2.x".
- `webpack.config.js` requires loaders and plugins that aren't listed in `devDependencies` (`terser-webpack-plugin`, `css-loader`, `file-loader`, `ngtemplate-loader`, `html-loader`). They resolve transitively from webpack. Keep that in mind if the build breaks after upgrading dependencies.

## App structure

- `js/app.js`: the `palladioApp` module. It lists every framework and component Angular module and sets up ui-router states. Only two are active: `/upload` (`html/upload.html`, `UploadRefineCtrl`) and `/visualization` (`html/visualization.html`, `VisualizationCtrl`, which resolves `dataService.getData()` first).
- `js/controllers.js`: `WorkflowCtrl` is the top-level controller on `<body>`. `UploadRefineCtrl` and `VisualizationCtrl` call `$controller('WorkflowCtrl', {$scope})` to inherit its scope behavior.
- In `VisualizationCtrl`, views get mounted into placeholder divs in `html/visualization.html` with `componentService.promiseAdd('<component>', '#<id>', opts)`. Filters (facet/timeline/timespan) are added on demand with `componentService.add(...)`. The navbar in `index.html` switches between views by setting `layout` (`geo`/`graph`/`table`/`grid`).
- `js/directives/`: data-loading UI for the upload step. `files`/`file` handle file upload and parsing, and "load sample" fetches `sample.json` through `loadService.loadJson`. `refine` handles field metadata and links between tables. `yasgui` is the SPARQL query input (YASQE/YASR).
- Shared services (`dataService`, `loadService`, `componentService`, `palladioService`, `filterService`, `parseService`, `spinnerService`) come from the `palladio` framework package, not this repo.
- **Embed mode** ([js/embed.js](js/embed.js)): `#/visualization?embed=<map|graph|table|gallery>&file=<url>|data=<base64url gzip>` shows one read-only view for iframes (URL format is in the README). `embedService` reads these params straight from `window.location.hash` at startup, and its memoized `load()` is what the `/visualization` route resolve waits on in embed mode. Without that, `VisualizationCtrl` sees empty data and hard-reloads. In embed mode, `WorkflowCtrl` skips the `beforeunload` prompt, `VisualizationCtrl` mounts only the chosen view, and everything gets `showSettings: false`. CSS under `.palladio-embed` hides the remaining chrome. The "Share / Embed" button is in [js/directives/embed.js](js/directives/embed.js) and [html/embed.html](html/embed.html). `embedService.exportProject` is a copy of the framework's `palladioDataDownload` export logic, so keep the two in sync.
- `sample.json` is a saved Palladio project used by "load sample". `sample data/` holds the raw source tables it was built from.
