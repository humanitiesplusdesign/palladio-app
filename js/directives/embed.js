// "Share / Embed" navbar button: builds a read-only embed URL and <iframe> snippet
// for the current project. See js/embed.js for the URL format.
angular.module('palladioApp.directives.embed', ['palladioApp.embed'])
	.directive('palladioEmbedShare', function ($q, embedService) {
		// Above this many characters, suggest hosting the JSON file instead.
		var LONG_URL_WARNING = 100000;

		return {
			templateUrl: 'html/embed.html',
			scope: true,  // child scope: still inherits layout and project from WorkflowCtrl

			link: function (scope, element) {
				var modal = element.find('.modal');
				// Bootstrap 3 modals inside a fixed navbar end up under their own
				// backdrop, so move the dialog to <body>. It keeps this scope.
				modal.appendTo('body');
				scope.$on('$destroy', function () { modal.remove(); });

				scope.share = {
					view: 'map',
					source: 'data',
					fileUrl: '',
					width: '100%',
					height: '600',
					encoded: null,
					encoding: false,
					error: null,
					copied: null
				};

				scope.viewOptions = [
					{ value: 'map', label: 'Map' },
					{ value: 'graph', label: 'Graph' },
					{ value: 'table', label: 'Table' },
					{ value: 'gallery', label: 'Gallery' }
				];

				scope.openShare = function () {
					var share = scope.share;
					share.view = embedService.LAYOUT_TO_VIEW[scope.layout] || 'map';
					share.encoded = null;
					share.error = null;
					share.copied = null;
					share.encoding = true;
					modal.modal('show');

					// Export inside the promise chain so a failure shows in the dialog
					// instead of silently aborting. The embed= parameter picks the view,
					// so the layout saved here only matters for the saved file itself.
					$q.when()
						.then(function () {
							return embedService.encode(embedService.exportProject(scope.layout, scope.project));
						})
						.then(function (encoded) { share.encoded = encoded; })
						.catch(function (err) { share.error = (err && err.message) || String(err); })
						.finally(function () { share.encoding = false; });
				};

				function attr(value) {
					return String(value).replace(/&/g, '&amp;').replace(/"/g, '&quot;');
				}

				// Build the link and iframe code once per input change rather than on
				// every digest: a data= link can be hundreds of KB.
				scope.out = { url: '', iframe: '', tooLong: false };
				scope.$watchGroup(['share.view', 'share.source', 'share.fileUrl', 'share.encoded',
					'share.width', 'share.height', 'project.title'], function () {
					var share = scope.share;
					var url = '';
					if (share.source === 'data' && share.encoded) {
						url = embedService.buildUrl(share.view, { data: share.encoded });
					} else if (share.source === 'file' && share.fileUrl) {
						url = embedService.buildUrl(share.view, { file: share.fileUrl });
					}
					var title = (scope.project && scope.project.title) || 'Palladio visualization';
					scope.out = {
						url: url,
						iframe: url ? '<iframe src="' + attr(url) + '" title="' + attr(title) + '" width="' + attr(share.width) +
							'" height="' + attr(share.height) + '" style="border:0" loading="lazy"></iframe>' : '',
						tooLong: share.source === 'data' && url.length > LONG_URL_WARNING
					};
					share.copied = null;
				});

				// Clipboard API needs a secure context (https or localhost); fall back to
				// selecting the textarea and execCommand('copy') elsewhere.
				scope.copy = function (which, textareaId) {
					var text = which === 'url' ? scope.out.url : scope.out.iframe;
					if (!text) return;
					var done = function () { scope.$evalAsync(function () { scope.share.copied = which; }); };
					var fallback = function () {
						var el = document.getElementById(textareaId);
						el.focus();
						el.select();
						var ok = false;
						try { ok = document.execCommand('copy'); } catch (e) { /* unsupported */ }
						if (ok) {
							done();
						} else {
							scope.$evalAsync(function () { scope.share.copied = 'manual'; });
						}
					};
					if (navigator.clipboard && navigator.clipboard.writeText) {
						navigator.clipboard.writeText(text).then(done, fallback);
					} else {
						fallback();
					}
				};
			}
		};
	});
