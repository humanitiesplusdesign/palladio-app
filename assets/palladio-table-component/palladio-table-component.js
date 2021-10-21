angular.module('palladioTableComponent', ['palladio', 'palladio.services'])
	.run(['componentService', function(componentService) {
		var compileStringFunction = function (newScope, options) {

			newScope.showSettings = newScope.showSettings === undefined ? false : newScope.showSettings;
			newScope.tableHeight = newScope.height === undefined ? undefined : newScope.height;
			newScope.maxDisplay = newScope.maxDisplay === undefined ? Infinity : newScope.maxDisplay;
			newScope.functions = {};

			var compileString = '<div class="with-settings" data-palladio-table-view-with-settings ';
			compileString += 'show-settings="showSettings" ';
			compileString += 'max-display="maxDisplay" ';
			compileString += 'functions=functions ';
			compileString += 'table-height="tableHeight" ';

			if(newScope.dimensions) {
				compileString += 'config-dimensions="dimensions" ';
			}

			if(newScope.row) {
				compileString += 'config-row="row" ';
			}

			compileString += '></div>';

			return compileString;
		};

		componentService.register('table', compileStringFunction);
	}])
	// Palladio Table View
	.directive('palladioTableView', ['palladioService', function (palladioService) {

		return {

			scope : {
				dimensions : '=',
				dimension : '=',
				maxDisplay : '=',
				tableHeight: '=',
				xfilter: '=',
				exportFunc: '='
			},

			link: function (scope, element, attrs) {

				function refresh() {
					if(!scope.tableHeight) {
						scope.calcHeight = $(window).height();
					} else {
						scope.calcHeight = scope.tableHeight;
					}

					element.height(scope.calcHeight);
					$(element[0].nextElementSibling).height(scope.calcHeight);
				}

				$(document).ready(refresh);
				$(window).resize(refresh);

				var uniqueDimension;
				var sortFunc = function() { };

				var sorting, desc = true;

				var search = '';

				var dims = [];

				var table, headers, rows, cells;

				scope.exportFunc = function () {

					var text =
						d3.csv.format(
							cells.map(function (r) {
								// Build rows
								var obj = {};
								r.forEach(function (c) { obj[c.__data__.key] = c.__data__.value; });
								return obj;
							})
						);

					var title = 'Palladio table export.csv';

					function getBlob() {
						return window.Blob || window.WebKitBlob || window.MozBlob;
					}

					var BB = getBlob();

					var isSafari = (navigator.userAgent.indexOf('Safari') != -1 && navigator.userAgent.indexOf('Chrome') == -1);

					if (isSafari) {
						var csv = "data:text/csv," + text;
						var newWindow = window.open(csv, 'download');
					} else {
						var blob = new BB([text], { type: "data:text/csv" });
						saveAs(blob, title);
					}

				};

				function update() {
					if (!scope.dimension || !uniqueDimension || dims.length === 0) return;

					if (!sorting) sorting = dims[0].key;

					table = d3.select(element[0]).select("table");

					if(table.empty()) {
						table = d3.select(element[0]).append("table")
								.attr("class","table table-striped");

						table.append("thead").append("tr");
						table.append("tbody");
					}

					headers = table.select("tr")
						.selectAll("th")
						.data(dims, function (d) { return d.key; });

					headers.exit().remove();
					headers.enter().append("th")
						.text(function(d, i){
							return d.key + " ";
						})
						.style("cursor","pointer")
						.on("click", function(d) {
								desc = sorting == d.key ? !desc : desc;
								sorting = d.key;
								sortFunc = function (a, b) { return desc ? a[sorting] < b[sorting] ? 1 : -1 : a[sorting] < b[sorting] ? -1 : 1; };
								update();
							})
						.append("i")
						.style("margin-left","5px");

					headers.order();

					var tempArr = [];
					var nested = d3.nest()
							.key(uniqueDimension.accessor)
							.rollup(function(arr) {
								// Build arrays of unique elements for each scope dimension
								return dims.map(function (d) {
									tempArr = [];
									arr.forEach(function (a) {
										if(tempArr.indexOf(a[d.key]) === -1 && a[d.key]) {
											tempArr.push(a[d.key]);
										}
									});
									return { key: d.key, values: tempArr };
								}).reduce(function(prev, curr) {
									// Then build an object like the original object concatenating those values
									// Currently we just comma-delimit them, which can be a problem with some data sets.
									prev[curr.key] = curr.values.join(', ');
									return prev;
								}, {});
							})
							.entries(uniqueDimension.top(Infinity))
							.map(function (d) {
								d.values[scope.dimension.key] = d.key;
								return d.values;
							});

					var fullData = nested.filter(function (d){
									if(search) {
										return dims.map(function (m) {
											return d[m.key];
										}).join().toUpperCase().indexOf(search.toUpperCase()) !== -1;
									} else {
										return true;
									}
								}).sort(sortFunc);
					var limitedData = fullData.slice(0,scope.maxDisplay);

					// Update first header with information about number of records displayed
					d3.select(headers[0][0]).text(function(d) {
						return d.key + " " + "(" + limitedData.length + " of " + fullData.length + " rows displayed) ";
					}).append("i")
						.style("margin-left","5px");

					// Finish building the headers
					headers.select("i")
						.attr("class", function(){ return desc ? "fa fa-sort-asc" : "fa fa-sort-desc"; })
						.style("opacity", function(d){ return d.key == sorting ? 1 : 0; });

					headers.order();

					rows = table.select("tbody")
							.selectAll("tr")
							.data(limitedData,
								function (d) {
									return dims.map(function(m){
										return d[m.key];
									}).join() + uniqueDimension.accessor(d);
							});

					rows.exit().remove();
					rows.enter().append("tr");

					rows.order();

					cells = rows.selectAll("td")
						.data(function(d){ return dims.map(function(m){ return { key: m.key, value: d[m.key] }; }); },
								function(d) { return d.key; });

					cells.exit().remove();
					cells.enter().append("td");
					cells.html(function(d){
						// if URL let's create a link
						if ( d.value.indexOf("https://") === 0 || d.value.indexOf("http://") === 0 || d.value.indexOf("www.") === 0 ) {
							return "<a target='_blank' href='" + d.value + "'>" + d.value + "</a>";
						}
						return d.value;
					});

					cells.order();

				}

				var uniqueId = "tableView" + Math.floor(Math.random() * 10000);
				var deregister = [];

				deregister.push(palladioService.onUpdate(uniqueId, function() {
					// Only update if the table is visible.
					if(element.is(':visible')) { update(); }
				}));

				// Update when it becomes visible (updating when not visibile errors out)
				scope.$watch(function() { return element.is(':visible'); }, update);

				scope.$watchCollection('dimensions', function() {
					updateDims();
					update();
				});

				scope.$watch('dimension', function () {
					updateDims();
					if(scope.dimension) {
						if(uniqueDimension) uniqueDimension.remove();
						uniqueDimension = scope.xfilter.dimension(function (d) { return "" + d[scope.dimension.key]; });
						uniqueDimension.accessor = function (d) { return "" + d[scope.dimension.key]; };
					}
					update();
				});
				
				function updateDims() {
					if(scope.dimension) {
						dims = [scope.dimension].concat(scope.dimensions);
					}
				}


				scope.$on('$destroy', function () {
					if(uniqueDimension) uniqueDimension.remove();
					deregister.forEach(function(f) { f(); });
				});

				deregister.push(palladioService.onSearch(uniqueId, function(text) {
					search = text;
					update();
				}));
			}
		};
	}])

	// Palladio Table View with Settings
	.directive('palladioTableViewWithSettings', ['palladioService', 'dataService', function (palladioService, dataService) {

		return {
			scope: {
				tableHeight: '=',
				showSettings: '=',
				maxDisplay: '=',
				configDimensions: '=',
				configRow: '=',
				functions: '='
			},
			templateUrl : 'partials/palladio-table-component/template.html',
			link: {

				pre: function (scope, element, attrs) {

					// In the pre-linking function we can use scope.data, scope.metadata, and
					// scope.xfilter to populate any additional scope values required by the
					// template.

					var deregister = [];

					scope.metadata = dataService.getDataSync().metadata;
					scope.xfilter = dataService.getDataSync().xfilter;

					scope.uniqueToggleId = "tableView" + Math.floor(Math.random() * 10000);
					scope.uniqueModalId = scope.uniqueToggleId + "modal";

					scope.fields = scope.metadata.sort(function (a, b) { return a.description < b.description ? -1 : 1; });
					scope.tableDimensions = [];

					// Set up count selection.
					// scope.countDims = scope.metadata.filter(function (d) { return d.countable === true; })
					// 		.sort(function (a, b) { return a.countDescription < b.countDescription ? -1 : 1; });
					scope.countDims = scope.metadata
							.sort(function (a, b) { return a.description < b.description ? -1 : 1; });
					scope.countDim = null;

					if(scope.configRow) {
						scope.countDim = scope.countDims.filter(function(d) { return d.key === scope.configRow.key; })[0];
					}

					if(scope.configDimensions) {
						scope.configDimensions.forEach(function(d) {
							scope.tableDimensions.push(scope.fields.filter(function(f) { return f.key === d.key; })[0]);
						});

						// Re-order fields so that selected dimensions are in the same order. Otherwise alphabetical.
						scope.fields = scope.fields.sort(function (a, b) {
							return scope.tableDimensions.indexOf(a) < scope.tableDimensions.indexOf(b) ? -1 : 1; 
						});
					}

					scope.getCountDescription = function (field) {
						// return field.countDescription;
						return field.description;
					};
					scope.showCountModal = function () { $('#' + scope.uniqueModalId).find('#count-modal').modal('show'); };

					scope.showModal = function(){
						$('#table-modal').modal('show');
					};

					scope.fieldDescriptions = function () {
						return scope.tableDimensions.map( function (d) { return d.description; }).join(", ");
					};

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

					scope.exportCsv = function () {};

					if(scope.functions) {
						scope.functions['getSettings'] = function() {
							return element.find('.table-settings')[0];
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
							scope.tableDimensions = state.tableDimensions.map(function(d) {
								return s.fields.filter(function(f) { return f.key === d.key })[0]
							});
							scope.countDim = state.countDim ? s.fields.filter(function(f) { return f.key === state.countDim.key; })[0] : null;
							scope.maxDisplay = state.maxDisplay === undefined ? Infinity : state.maxDisplay;

							scope.setInternalState(state);
						});
					}

					function exportState() {
						return scope.readInternalState({
							tableDimensions: scope.tableDimensions.map(function(d) { return { key: d.key }; }),
							countDim: scope.countDim ? { key: scope.countDim.key } : null,
							maxDisplay: scope.maxDisplay
						});
					}

					deregister.push(palladioService.registerStateFunctions(scope.uniqueToggleId, 'tableView', exportState, importState));

					scope.$on('$destroy', function () {
						deregister.forEach(function (f) { f(); });
					});

				},

				post: function(scope, element, attrs) {

					element.find('.settings-toggle').click(function() {
						element.find('.settings').toggleClass('closed');
					});


				}
			}
		};
	}]);

angular.module('palladio').run(['$templateCache', function($templateCache) {
    $templateCache.put('partials/palladio-table-component/template.html',
        "<div class=\"\">\n\n\t\t<div data-ng-show=\"countDim\"\n\t\t\tdata-palladio-table-view\n\t\t\tdimension=\"countDim\"\n\t\t\ttable-height=\"tableHeight\"\n\t\t\tdimensions=\"tableDimensions\"\n      max-display=\"maxDisplay\"\n\t\t\txfilter=\"xfilter\"\n\t\t\texport-func=\"exportCsv\">\n\t\t</div>\n\n</div>\n\n<!-- Settings -->\n<div class=\"row table-settings\" data-ng-show=\"showSettings || showSettings === undefined\">\n\n    <div class=\"settings col-lg-4 col-lg-offset-8 col-md-6 col-md-offset-6\">\n      <div class=\"panel panel-default\">\n\n        <a class=\"settings-toggle\" data-toggle=\"tooltip\" data-original-title=\"Settings\" data-placement=\"bottom\">\n          <i class=\"fa fa-bars\"></i>\n        </a>\n\n        <div class=\"panel-body\">\n\n          <div class=\"row\">\n            <div class=\"col-lg-12\">\n              <label>Settings</label>\n            </div>\n          </div>\n\n          <div class=\"row margin-top\">\n            <div class=\"col-lg-4 col-md-4 col-sm-4 col-xs-4 text-right\">\n              <label class=\"inline\">Row dimension</label>\n            </div>\n            <div class=\"col-lg-8 col-md-8 col-sm-8 col-xs-8 col-condensed\">\n              <span class=\"btn btn-default\" ng-click=\"showCountModal()\">\n                  {{countDim.description || \"Choose\"}}\n                  <span class=\"caret\"></span>\n              </span>\n\t\t\t\t\t\t\t<p class=\"help-block\">At least one row per value in this dimension. Multiple values will be displayed as lists in each cell.</p>\n\n            </div>\n          </div>\n\n          <div class=\"row margin-top\">\n            <div class=\"col-lg-4 col-md-4 col-sm-4 col-xs-4 text-right\">\n              <label class=\"inline\">Dimensions</label>\n            </div>\n            <div class=\"col-lg-8 col-md-8 col-sm-8 col-xs-8 col-condensed\">\n\t\t\t\t\t\t\t<span class=\"btn btn-default\" ng-click=\"showModal()\">\n                  {{fieldDescriptions() || \"Choose\"}}\n                  <span class=\"caret\"></span>\n              </span>\n            </div>\n          </div>\n\n\t\t\t\t\t<div class=\"row margin-top\">\n            <div class=\"col-lg-4 col-md-4 col-sm-4 col-xs-4 text-right\">\n            </div>\n            <div class=\"col-lg-8 col-md-8 col-sm-8 col-xs-8 col-condensed\">\n\n              <a class=\"pull-right\"\n\t\t\t\t\t\t\ttooltip=\"Download data (csv)\"\n\t\t\t\t\t\t\ttooltip-animation=\"false\"\n\t\t\t\t\t\t\ttooltip-append-to-body=\"true\"\n\t\t\t\t\t\t\tng-click=\"exportCsv()\">\n\t\t\t\t\t\t\t\t<i class=\"fa fa-download margin-right\"></i>Download\n\t\t\t\t\t\t\t</a>\n\n            </div>\n          </div>\n\n\n        </div>\n      </div>\n    </div>\n\n</div>\n\n<div id=\"{{uniqueModalId}}\">\n\t<div id=\"table-modal\" data-modal description=\"Choose data dimensions\" dimensions=\"fields\" model=\"tableDimensions\" sortable=\"true\"></div>\n\t<div id=\"count-modal\" data-modal description=\"Choose key dimension (one row for each value of this dimension)\" dimensions=\"countDims\" model=\"countDim\" description-accessor=\"getCountDescription\"></div>\n</div>\n");
}]);