// List view module

angular.module('palladioCardsComponent', ['palladio', 'palladio.services'])
  .run(['componentService', function(componentService) {
		var compileStringFunction = function (newScope, options) {

			newScope.showSettings = newScope.showSettings === undefined ? false : newScope.showSettings;
			newScope.cardsHeight = newScope.height === undefined ? undefined : newScope.height;
			newScope.functions = {};

			var compileString = '<div class="with-settings" data-palladio-list-view-with-settings ';
			compileString += 'show-settings="showSettings" ';
			compileString += 'cards-height="cardsHeight" ';
			compileString += 'functions=functions ';
      
      if(newScope.titleDim) {
        compileString += 'config-title-dimension="titleDim" ';
      }
      
      if(newScope.subtitleDim) {
        compileString += 'config-sub-title-dimension="subtitleDim" ';
      }
      
      if(newScope.textDim) {
        compileString += 'config-text-dimension="textDim" ';
      }
      
      if(newScope.linkDim) {
        compileString += 'config-link-dimension="linkDim" ';
      }
      
      if(newScope.imgUrlDim) {
        compileString += 'config-img-url-dimension="imgUrlDim" ';
      }
      
      if(newScope.sortDim) {
        compileString += 'config-sort-dimension="sortDim" ';
      }

			compileString += '></div>';

			return compileString;
		};

		componentService.register('cards', compileStringFunction);
	}])
	.directive('palladioListView', ['palladioService', function (palladioService) {

		var directiveDefObj = {
			scope: {
				listDimension: '=listDimension',
        cardsHeight: '=',
				max: '=maxToDisplay',
				imageURLFunc: '=imgUrlAccessor',
				titleFunc: '=titleAccessor',
				subtitleFunc: '=subtitleAccessor',
				textFunc: '=textAccessor',
				linkFunc: '=linkAccessor',
				sortOptions: '=sortOptions'
			},
			link: function (scope, element) {


				///////////////////////////////////////////////////////////////////////
				//
				// Listen for Palladio events we need to respond to.
				//
				///////////////////////////////////////////////////////////////////////

				var uniqueId = "listView" + Math.floor(Math.random() * 10000);
				var deregister = [];
        
        function refresh() {
					if(!scope.cardsHeight) {
						scope.calcHeight = $(window).height();
					} else {
						scope.calcHeight = scope.cardsHeight;
					}

					element.height(scope.calcHeight);
				}

				$(document).ready(refresh);
				$(window).resize(refresh);

				deregister.push(palladioService.onUpdate(uniqueId, function() {
					// Only update if the table is visible.
					if(element.is(':visible')) { buildList(); }
				}));

				// Update when it becomes visible (updating when not visibile errors out)
				scope.$watch(function() { return element.is(':visible'); }, buildList);

				///////////////////////////////////////////////////////////////////////
				//
				// Watch for scope parameter changes that we need to do respond to.
				//
				///////////////////////////////////////////////////////////////////////

				function watchListener(nv, ov) {
					if(nv !== ov) {
						buildList();
					}
				}

				scope.$watch('listDimension', watchListener);
				scope.$watch('max', watchListener);
				scope.$watch('imageURLFunc', watchListener);
				scope.$watch('titleFunc', watchListener);
				scope.$watch('subtitleFunc', watchListener);
				scope.$watch('textFunc', watchListener);
				scope.$watch('linkFunc', watchListener);
				scope.$watch('sortOptions', watchListener);

				///////////////////////////////////////////////////////////////////////
				//
				// Set default values.
				//
				///////////////////////////////////////////////////////////////////////

				var max = scope.max ? scope.max : Infinity;

				///////////////////////////////////////////////////////////////////////
				//
				// Variables global to the list view scope.
				//
				///////////////////////////////////////////////////////////////////////

				var listGroups, listLookup, sortIndex, listDisplay;

				buildList();

				function buildList() {

					if(!scope.titleFunc || !scope.imageURLFunc || !scope.subtitleFunc || !scope.textFunc
						|| !scope.linkFunc || !scope.sortOptions.length ) { return; }

					// Groups
					listGroups = scope.listDimension.group();

					// The grid lookup.
					listLookup = d3.map();

					// This is just a placeholder for the moment.
					sortIndex = 0;

					scope.listDimension.top(Infinity).forEach(function(d) {
						listLookup.set(scope.listDimension.accessor(d), {
							title: scope.titleFunc(d),
							imageURL: scope.imageURLFunc(d),
							subtitle: scope.subtitleFunc(d),
							text: scope.textFunc(d),
							link: scope.linkFunc(d),
							sortBy: scope.sortOptions.map(function(s) { return d[s.attribute]; })
						});
					});

					// If the list already exists, remove it.
					d3.select(element[0])
						.select("div#list-display")
						.remove();

					listDisplay = d3.select(element[0])
						.append("div")
						.attr("class","row")
						.attr("id", "list-display");

					/*d3.select(element[0])
						.append("div")
						.attr("class","clearfix");*/

					updateList();
				}

				// Function to update the grid in the future.
				function updateList() {

					listBoxes = listDisplay.selectAll(".list-wrap")
						.data(listGroups.top(scope.max).filter(function(d){
							return d.value !== 0;
						}), function(d) { return d.key; });

					listBoxes.enter()
						.append("div")
						.attr("class", "col-lg-3 col-md-4 col-sm-6 list-wrap")
						.append("a")
							.attr("href", function(d) { return listLookup.get(d.key).link; })
							.attr("target", "_blank")
							.attr("class", "list-link")
						.append("div")
							.attr("class","list-box")
							.each(buildListBox)

					listBoxes.exit().remove();

					listBoxes.sort(function(a, b) {
							if(listLookup.get(a.key).sortBy[sortIndex] > listLookup.get(b.key).sortBy[sortIndex]) {
								return 1;
							} else {
								return -1;
							}
						});
				}

				function buildListBox() {

					var listBox = d3.select(this);

					listBox.append("div").style("background-image", function(d) {
						return "url(" + listLookup.get(d.key).imageURL + ")";
					}).attr("class", "list-image")
					.append('span').html(function(d){
						return listLookup.get(d.key).imageURL ? '' : 'Image';
					})


					listBox.append("div").text(function(d){
						return listLookup.get(d.key).title;
					}).attr("class", "list-title");

					listBox.append("div").text(function(d){
						return listLookup.get(d.key).subtitle;
					}).attr("class", "list-subtitle");

					listBox.append("div").text(function(d){
						return listLookup.get(d.key).text;
					}).attr("class", "list-text margin-top");
				}


			}
		};

		return directiveDefObj;
	}])
	// Palladio Grid/List View with Settings
	.directive('palladioListViewWithSettings', ['palladioService', 'dataService', function (palladioService, dataService) {

		return {
			scope: {
				cardsHeight: '=',
				showSettings: '=',
        configTitleDimension: '=',
        configSubTitleDimension: '=',
        configTextDimension: '=',
        configLinkDimension: '=',
        configImgUrlDimension: '=',
        configSortDimension: '=',
				functions: '='
			},
			templateUrl: 'partials/palladio-cards-component/template.html',
			link: {
      	pre: function (scope, element, attrs) {
          
					// In the pre-linking function we can use scope.data, scope.metadata, and
					// scope.xfilter to populate any additional scope values required by the
					// template.

					var deregister = [];
          
          scope.uniqueToggleId = "cardView" + Math.floor(Math.random() * 10000);
					scope.uniqueModalId = scope.uniqueToggleId + "modal";
          
          if(scope.configTitleDimension) { scope.titleDim = scope.configTitleDimension; };
          if(scope.configSubTitleDimension) { scope.subtitleDim = scope.configSubTitleDimension; };
          if(scope.configTextDimension) { scope.textDim = scope.configTextDimension; };
          if(scope.configLinkDimension) { scope.linkDim = scope.configLinkDimension; };
          if(scope.configImgUrlDimension) { scope.imgurlDim = scope.configImgUrlDimension; };
          if(scope.configSortDimension) { scope.sortDim = scope.configSortDimension; };

					scope.metadata = dataService.getDataSync().metadata;
					scope.xfilter = dataService.getDataSync().xfilter;

					scope.fields = scope.metadata.sort(function (a, b) { return a.description < b.description ? -1 : 1; });

					scope.urlDims = scope.metadata.filter(function (d) { return d.type === 'url'; })
							.sort(function (a, b) { return a.description < b.description ? -1 : 1; });

					// There can be only one unique key, so no selection for this one.
					if(scope.metadata.filter(function (d) { return d.countBy === true; })[0]) {
						scope.listDim = scope.metadata.filter(function (d) { return d.countBy === true; })[0];
						if(!scope.titleDim) scope.titleDim = scope.listDim;
					}

					scope.id = scope.xfilter.dimension(function (d) { return "" + d[scope.listDim.key]; });
					scope.id.accessor = function (d) { return "" + d[scope.listDim.key]; };
					
					scope.$watch('titleDim', function (nv, ov) {
						if(nv !== ov && nv) {
							scope.titleAccessor = function (d) { return "" + d[nv.key]; };
						} else {
							scope.titleAccessor = function (d) { return "" + d[scope.titleDim.key]; };
						}
					});

					scope.$watch('subtitleDim', function (nv, ov) {
						if(nv !== ov && nv) {
							scope.subtitleAccessor = function (d) { return "" + d[nv.key]; };
						} else {
              if(scope.subtitleDim) {
                scope.subtitleAccessor = function (d) { return "" + d[scope.subtitleDim.key]; };
              } else {
                scope.subtitleAccessor = function (d) { return "Select a subtitle dimension"; };
              }
						}
					});

					scope.$watch('textDim', function (nv, ov) {
						if(nv !== ov && nv) {
							scope.textAccessor = function (d) { return "" + d[nv.key]; };
						} else {
              if(scope.textDim) {
                scope.textAccessor = function (d) { return "" + d[scope.textDim.key]; };  
              } else {
                scope.textAccessor = function (d) { return "Select a text dimension"; };
              }
						}
					});

					scope.$watch('linkDim', function (nv, ov) {
						if(nv !== ov && nv) {
							scope.linkAccessor = function (d) { return "" + d[nv.key]; };
						} else {
              if(scope.linkDim) {
                scope.linkAccessor = function (d) { return "" + d[scope.linkDim.key]; };  
              } else {
                scope.linkAccessor = function (d) { return ""; };
              }
						}
					});

					scope.$watch('imgurlDim', function (nv, ov) {
						if(nv !== ov && nv) {
							scope.imgurlAccessor = function (d) { return "" + d[nv.key]; };
						} else {
              if(scope.imgurlDim) {
                scope.imgurlAccessor = function (d) { return "" + d[scope.imgurlDim.key]; };  
              } else {
                scope.imgurlAccessor = function (d) { return ""; };
              }
						}
					});

					scope.$watch('sortDim', function (nv, ov) {
						if(nv !== ov && nv) {
							scope.sortOptions = [{
								attribute: nv.key
							}];
						} else {
              if(scope.sortDim) {
                scope.sortOptions = [{ attribute: scope.sortDim.key }];  
              } else {
                scope.sortOptions = [{ attribute: scope.listDim.key }];
              }
						}
					});

					// Clean up after ourselves. Remove dimensions that we have created. If we
					// created watches on another scope, destroy those as well.
					scope.$on('$destroy', function () {
						if(scope.id) scope.id.remove();
						deregister.forEach(function(f) { f(); });
					});

					scope.showTitleModal = function(){
            $('#' + scope.uniqueModalId).find('#title-modal').modal('show');
					};

					scope.showSubtitleModal = function(){
            $('#' + scope.uniqueModalId).find('#subtitle-modal').modal('show');
					};

					scope.showTextModal = function(){
            $('#' + scope.uniqueModalId).find('#text-modal').modal('show');
					};

					scope.showLinkModal = function(){
            $('#' + scope.uniqueModalId).find('#link-modal').modal('show');
					};

					scope.showImgURLModal = function(){
            $('#' + scope.uniqueModalId).find('#imgurl-modal').modal('show');
					};

					scope.showSortModal = function(){
            $('#' + scope.uniqueModalId).find('#sort-modal').modal('show');
					};

					function refresh() {
						element.css("min-height",$(window).height()-50);
					}

					$(document).ready(refresh);
					$(window).resize(refresh);

					// State save/load.

					scope.setInternalState = function (state) {
						// Placeholder
						return state;
					};

					// Add internal state to the state.
					scope.readInternalState = function (state) {
						// Placeholder
						return state;
					};

					if(scope.functions) {
						scope.functions['getSettings'] = function() {
							return element.find('.cards-settings')[0]
						}
						scope.functions['importState'] = function(state) {
							importState(state)
							return true
						}
						scope.functions['exportState'] = function() {
							return exportState()
						}
					}

					function importState(state) {
						scope.$apply(function (s) {
							s.titleDim = scope.metadata.filter(function(f) { return f.key === state.titleDim; })[0];
							s.subtitleDim = scope.metadata.filter(function(f) { return f.key === state.subtitleDim; })[0];
							s.textDim = scope.metadata.filter(function(f) { return f.key === state.textDim; })[0];
							s.linkDim = scope.metadata.filter(function(f) { return f.key === state.linkDim; })[0];
							s.imgurlDim = scope.metadata.filter(function(f) { return f.key === state.imgurlDim; })[0];
							s.sortDim = scope.metadata.filter(function(f) { return f.key === state.sortDim; })[0];

							s.setInternalState(state);
						});
					}

					function exportState() {
						return scope.readInternalState({
							titleDim: scope.titleDim.key,
							subtitleDim: scope.subtitleDim ? scope.subtitleDim.key : undefined,
							textDim: scope.textDim ? scope.textDim.key : undefined,
							linkDim: scope.linkDim ? scope.linkDim.key : undefined,
							imgurlDim: scope.imgurlDim ? scope.imgurlDim.key : undefined,
							sortDim: scope.sortDim ? scope.sortDim.key : undefined
						});
					}

					deregister.push(palladioService.registerStateFunctions('listView', 'listView', exportState, importState));
       	},

				post: function(scope, element, attrs) {

					$(document).ready(function(){
						element.find('.settings-toggle').click(function() {
							element.find('.settings').toggleClass('closed');
						});
					});
				}
			}
		};
	}]);

angular.module('palladio').run(['$templateCache', function($templateCache) {
    $templateCache.put('partials/palladio-cards-component/template.html',
        "<div class=\"container-fluid\">\n\n  <div data-palladio-list-view\n    list-dimension=\"id\"\n    cards-height=\"cardsHeight\"\n    max-to-display=\"1000\"\n    img-url-accessor=\"imgurlAccessor\"\n    title-accessor=\"titleAccessor\"\n    subtitle-accessor=\"subtitleAccessor\"\n    text-accessor=\"textAccessor\"\n    link-accessor=\"linkAccessor\"\n    sort-options=\"sortOptions\"></div>\n\n</div>\n\n<!-- Settings -->\n<div class=\"row cards-settings\" data-ng-show=\"showSettings || showSettings === undefined\">\n\n    <div class=\"settings col-lg-4 col-lg-offset-8 col-md-6 col-md-offset-6\">\n      <div class=\"panel panel-default\">\n\n        <a class=\"settings-toggle\" data-toggle=\"tooltip\" data-original-title=\"Settings\" data-placement=\"bottom\">\n          <i class=\"fa fa-bars\"></i>\n        </a>\n\n        <div class=\"panel-body\">\n\n          <div class=\"row\">\n            <div class=\"col-lg-12\">\n              <label>Settings</label>\n            </div>\n          </div>\n\n          <div class=\"row margin-top\">\n            <div class=\"col-lg-4 col-md-4 col-sm-4 col-xs-4 text-right\">\n              <label class=\"inline\">Title</label>\n            </div>\n            <div class=\"col-lg-8 col-md-8 col-sm-8 col-xs-8 col-condensed\">\n              <span class=\"btn btn-default\" ng-click=\"showTitleModal()\">\n                  {{titleDim.description || \"Choose\"}}\n                  <span class=\"caret\"></span>\n              </span>\n            </div>\n          </div>\n\n          <div class=\"row margin-top\">\n            <div class=\"col-lg-4 col-md-4 col-sm-4 col-xs-4 text-right\">\n              <label class=\"inline\">Subtitle</label>\n            </div>\n            <div class=\"col-lg-8 col-md-8 col-sm-8 col-xs-8 col-condensed\">\n              <span class=\"btn btn-default\" ng-click=\"showSubtitleModal()\">\n                  {{subtitleDim.description || \"Choose\"}}\n                  <span class=\"caret\"></span>\n              </span>\n            </div>\n          </div>\n\n          <div class=\"row margin-top\">\n            <div class=\"col-lg-4 col-md-4 col-sm-4 col-xs-4 text-right\">\n              <label class=\"inline\">Text</label>\n            </div>\n            <div class=\"col-lg-8 col-md-8 col-sm-8 col-xs-8 col-condensed\">\n              <span class=\"btn btn-default\" ng-click=\"showTextModal()\">\n                  {{textDim.description || \"Choose\"}}\n                  <span class=\"caret\"></span>\n              </span>\n            </div>\n          </div>\n\n          <div class=\"row margin-top\">\n            <div class=\"col-lg-4 col-md-4 col-sm-4 col-xs-4 text-right\">\n              <label class=\"inline\">Link</label>\n            </div>\n            <div class=\"col-lg-8 col-md-8 col-sm-8 col-xs-8 col-condensed\">\n              <span class=\"btn btn-default\" ng-click=\"showLinkModal()\">\n                  {{linkDim.description || \"Choose\"}}\n                  <span class=\"caret\"></span>\n              </span>\n            </div>\n          </div>\n\n          <div class=\"row margin-top\">\n            <div class=\"col-lg-4 col-md-4 col-sm-4 col-xs-4 text-right\">\n              <label class=\"inline\">Image URL</label>\n            </div>\n            <div class=\"col-lg-8 col-md-8 col-sm-8 col-xs-8 col-condensed\">\n              <span class=\"btn btn-default\" ng-click=\"showImgURLModal()\">\n                  {{imgurlDim.description || \"Choose\"}}\n                  <span class=\"caret\"></span>\n              </span>\n            </div>\n          </div>\n\n          <div class=\"row margin-top\">\n            <div class=\"col-lg-4 col-md-4 col-sm-4 col-xs-4 text-right\">\n              <label class=\"inline\">Sort by</label>\n            </div>\n            <div class=\"col-lg-8 col-md-8 col-sm-8 col-xs-8 col-condensed\">\n              <span class=\"btn btn-default\" ng-click=\"showSortModal()\">\n                  {{sortDim.description || \"Choose\"}}\n                  <span class=\"caret\"></span>\n              </span>\n            </div>\n          </div>\n\n        </div>\n\n      </div>\n    </div>\n\n</div>\n\n<div id=\"{{uniqueModalId}}\">\n  <div id=\"title-modal\" data-modal description=\"Choose title (a unique value)\" dimensions=\"fields\" model=\"titleDim\"></div>\n  <div id=\"subtitle-modal\" data-modal description=\"Choose sub-title\" dimensions=\"fields\" model=\"subtitleDim\"></div>\n  <div id=\"text-modal\" data-modal description=\"Choose text\" dimensions=\"fields\" model=\"textDim\"></div>\n  <div id=\"link-modal\" data-modal description=\"Choose link (URL to launch on click)\" dimensions=\"urlDims\" model=\"linkDim\"></div>\n  <div id=\"imgurl-modal\" data-modal description=\"Choose image (URL of image)\" dimensions=\"urlDims\" model=\"imgurlDim\"></div>\n  <div id=\"sort-modal\" data-modal description=\"Choose sort order dimension\" dimensions=\"fields\" model=\"sortDim\"></div>\n</div>");
}]);