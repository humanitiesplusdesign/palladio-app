var app = angular.module('palladioApp', [
	'palladio',
	'palladio.controllers',
	'palladio.services',
	'palladio.directives',
	'palladio.filters',
	
	'palladioApp.directives.files',
	'palladioApp.directives.file',
	'palladioApp.directives.refine',
	'palladioApp.directives.yasgui',
	'palladioApp.directives.transform',

	'ui.codemirror',
	'ui.bootstrap',
	'ui.router',
	'ui.sortable',
	'ui.select',
	'colorpicker.module',

	'palladioDataUpload',
	'palladioDataDownload',

	// Palette
	'palladioPalette',

	// Filters
  'palladioTimelineComponent',
	'palladioFacetComponent',
	'palladioTimespanComponent',
	// Views
	'palladioCardsComponent',
	'palladioMapComponent',
	'palladioTableComponent',
	'palladioSelectionView',
	'palladioGraphComponent',
	'palladioDurationView']
	)
	.config(function($stateProvider, $urlRouterProvider) {

		$urlRouterProvider.otherwise("/upload");

		$stateProvider
			// .state('/', {
			// 	url: '/',
			// 	templateUrl: 'html/start.html',
			// })
			.state('/upload', {
				url: '/upload',
				templateUrl: 'html/upload.html',
				controller: 'UploadRefineCtrl'
			})
			// .state('/link', {
			// 	url: '/link',
			// 	templateUrl: 'html/link.html'
			// })
			.state('/visualization', {
				url: '/visualization',
				templateUrl: 'html/visualization.html',
				controller: 'VisualizationCtrl',
				resolve: {
					data: function (dataService) {
						return dataService.getData();
					}
				}
			});
	});
