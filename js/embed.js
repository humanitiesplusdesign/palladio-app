// Embed mode: read-only, single-view Palladio suitable for an <iframe>.
//
// URL format (all parameters live in the hash, so they are never sent to a server):
//   index.html#/visualization?embed=map&file=<url-encoded URL of a Palladio JSON file>
//   index.html#/visualization?embed=graph&data=<base64url(gzip(Palladio JSON))>
//
// `embed` is one of map | graph | table | gallery and turns embed mode on.
angular.module('palladioApp.embed', ['palladio.services', 'palladio'])
	.factory('embedService', function ($q, $http, $rootScope, version, palladioService, dataService, loadService) {

		// Public view names <-> internal layout names used by WorkflowCtrl.
		var VIEW_TO_LAYOUT = { map: 'geo', graph: 'graph', table: 'table', gallery: 'grid' };
		var LAYOUT_TO_VIEW = { geo: 'map', graph: 'graph', table: 'table', grid: 'gallery' };

		// Parse once at startup, straight from the hash, so ui-router state changes
		// can't drop the parameters before we read them.
		// Form-style decoding ('+' means space, so replace it before decoding %2B).
		// A malformed escape must not throw: this runs while the service is built,
		// and an exception here would stop the whole app from starting.
		function tryDecode(str) {
			str = str.replace(/\+/g, ' ');
			try {
				return decodeURIComponent(str);
			} catch (e) {
				return str;
			}
		}

		function parseHashParams(hash) {
			var params = {};
			var q = hash.indexOf('?');
			if (q === -1) return params;
			hash.slice(q + 1).split('&').forEach(function (pair) {
				if (!pair) return;
				var eq = pair.indexOf('=');
				var key = tryDecode(eq === -1 ? pair : pair.slice(0, eq));
				params[key] = eq === -1 ? '' : tryDecode(pair.slice(eq + 1));
			});
			return params;
		}

		var params = parseHashParams(window.location.hash || '');
		var view = VIEW_TO_LAYOUT.hasOwnProperty(params.embed) ? params.embed : null;

		// --- base64url <-> bytes -------------------------------------------------

		function bytesToBase64Url(bytes) {
			var binary = '';
			var chunk = 0x8000;
			for (var i = 0; i < bytes.length; i += chunk) {
				binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
			}
			return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
		}

		function base64UrlToBytes(str) {
			var b64 = str.replace(/-/g, '+').replace(/_/g, '/').replace(/\s/g, '');
			while (b64.length % 4) b64 += '=';
			var binary = atob(b64);
			var bytes = new Uint8Array(binary.length);
			for (var i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
			return bytes;
		}

		function pipe(bytes, stream) {
			return new Response(new Blob([bytes]).stream().pipeThrough(stream)).arrayBuffer()
				.then(function (buf) { return new Uint8Array(buf); });
		}

		// --- public API ----------------------------------------------------------

		// Palladio project JSON -> Promise<base64url(gzip(JSON))>
		function encode(json) {
			if (typeof CompressionStream === 'undefined') {
				return $q.reject(new Error('This browser does not support CompressionStream.'));
			}
			var bytes = new TextEncoder().encode(JSON.stringify(json));
			return $q.when(pipe(bytes, new CompressionStream('gzip'))).then(bytesToBase64Url);
		}

		// base64url(gzip(JSON)) -> Promise<Palladio project JSON>
		function decode(str) {
			if (typeof DecompressionStream === 'undefined') {
				return $q.reject(new Error('This browser does not support DecompressionStream.'));
			}
			return $q.when()
				.then(function () { return pipe(base64UrlToBytes(str), new DecompressionStream('gzip')); })
				.then(function (bytes) { return JSON.parse(new TextDecoder().decode(bytes)); });
		}

		// source: { data: <encoded string> } or { file: <url> }
		function buildUrl(viewName, source) {
			var base = window.location.origin + window.location.pathname;
			var url = base + '#/visualization?embed=' + encodeURIComponent(viewName);
			if (source.data) url += '&data=' + source.data;  // base64url is already URL-safe
			if (source.file) url += '&file=' + encodeURIComponent(source.file);
			return url;
		}

		function shallowCopy(obj) {
			var copy = {};
			for (var attr in obj) {
				if (obj.hasOwnProperty(attr)) copy[attr] = obj[attr];
			}
			return copy;
		}

		// Builds the same project JSON as the Download button.
		// Copied from exportDataModel() in the palladio framework's
		// src/components/palladio-data-download/palladio-data-download.js,
		// which isn't exposed as a service. Keep the two in sync.
		function exportProject(layout, project) {
			var files = dataService.getFiles().map(function (f) {
				f = shallowCopy(f);
				f.autoFields = [];
				f.fields = f.fields.concat([]).map(function (g) {
					g = shallowCopy(g);
					if (g.descriptiveField && g.descriptiveField.key) g.descriptiveField = g.descriptiveField.key;
					g.uniques = [];
					g.errors = [];
					return g;
				});
				if (f.url && f.loadFromURL) {
					f.data = [];
				}
				return f;
			});

			var links = dataService.getLinks().map(function (l) {
				l = shallowCopy(l);
				l.lookup = shallowCopy(l.lookup);
				l.source = shallowCopy(l.source);
				l.lookup.field = shallowCopy(l.lookup.field);
				l.source.field = shallowCopy(l.source.field);
				l.lookup.field.uniques = [];
				l.lookup.field.errors = [];
				l.source.field.uniques = [];
				l.source.field.errors = [];
				if (l.lookup.field.descriptiveField && l.lookup.field.descriptiveField.key) l.lookup.field.descriptiveField = l.lookup.field.descriptiveField.key;
				if (l.source.field.descriptiveField && l.source.field.descriptiveField.key) l.source.field.descriptiveField = l.source.field.descriptiveField.key;
				l.lookup.file = { uniqueId: l.lookup.file.uniqueId };
				l.source.file = { uniqueId: l.source.file.uniqueId };
				return l;
			});

			// angular.toJson drops Angular's $$hashKey properties.
			return JSON.parse(angular.toJson({
				version: version,
				files: files,
				links: links,
				layout: layout,
				metadata: project,
				vis: palladioService.getStateFunctions().map(function (s) {
					return { type: s.type, importJson: s.export() };
				})
			}));
		}

		var service;
		var loading = null;

		// Loads the project named in the URL (data= takes precedence over file=).
		// Memoized: the /visualization route resolve waits on this so the view
		// isn't built before the data exists.
		function load() {
			if (loading) return loading;

			var json;
			if (service.data && typeof DecompressionStream === 'undefined') {
				json = $q.reject(new Error('This browser is too old to open embedded Palladio data. Try a current version of Chrome, Edge, Firefox or Safari.'));
			} else if (service.data) {
				json = decode(service.data).catch(function () {
					throw new Error('The embedded Palladio data in this link is corrupted or incomplete.');
				});
			} else if (service.file) {
				json = $http.get(service.file).then(function (res) { return res.data; }, function () {
					throw new Error('There was a problem loading ' + service.file +
						'. Check that the URL exists, is a Palladio file, and is CORS-enabled.');
				});
			} else {
				json = $q.reject(new Error('This embed link has no data. Add a data= or file= parameter.'));
			}

			loading = json
				.then(function (project) {
					if (!project || !Array.isArray(project.files)) {
						throw new Error('This is not a Palladio project file.');
					}
					return loadService.loadJson(project).then(function () { return project; });
				})
				.then(function () {
					return dataService.getData();
				})
				.catch(function (err) {
					service.error = (err && err.message) || String(err);
					throw err;
				});

			return loading;
		}

		service = {
			active: view !== null,
			view: view,
			layout: view ? VIEW_TO_LAYOUT[view] : null,
			file: params.file || null,
			data: params.data || null,
			error: null,
			load: load,
			VIEW_TO_LAYOUT: VIEW_TO_LAYOUT,
			LAYOUT_TO_VIEW: LAYOUT_TO_VIEW,
			encode: encode,
			decode: decode,
			buildUrl: buildUrl,
			exportProject: exportProject
		};

		return service;
	});
