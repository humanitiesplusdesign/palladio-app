// Facet filter module

angular.module('palladioFacetComponent', ['palladio', 'palladio.services'])
	.run(['componentService', function(componentService) {
		var compileStringFunction = function (newScope, options) {

			// Options
			//		showControls: true
			//		showAccordion: true
			//		showSettings: true
			//		showDropArea: true
			//		dimensions: []
			//		aggregation: []
			//		height: 300px
			//    onRemove: function() { ... }

			newScope.showControls = newScope.showControls === undefined ? true : newScope.showControls;
			newScope.showAccordion = newScope.showAccordion === undefined ? true : newScope.showAccordion;
			newScope.showDropArea = newScope.showDropArea === undefined ? true : newScope.showDropArea;
			newScope.showSettings = newScope.showSettings === undefined ? true : newScope.showSettings;
			newScope.dimensions = newScope.dimensions === undefined ? [] : newScope.dimensions;
			newScope.aggregation = newScope.aggregation === undefined ? false : {
				key: newScope.aggregation.key,
				type: newScope.aggregation.countable ? 'count' : 'sum',
				field: newScope.aggregation,
				fileId: newScope.aggregation.originFileId ? newScope.aggregation.originFileId : 0
			};
			newScope.height = newScope.height === undefined ? "300px" : newScope.height;
			newScope.onRemove = newScope.onRemove === undefined ? function() {} : newScope.onRemove;
			newScope.functions = {};

			var compileString = '<div data-palladio-facet-filter ';

			compileString += 'show-controls=showControls ';
			compileString += 'show-accordion=showAccordion ';
			compileString += 'show-drop-area=showDropArea ';
			compileString += 'show-settings=showSettings ';
			compileString += 'height=height ';
			compileString += 'on-remove=onRemove() ';
			compileString += 'functions=functions ';

			if(newScope.dimensions.length > 0) {
				compileString += 'config-dimensions="dimensions" ';
			}

			if(newScope.aggregation) {
				compileString += 'config-aggregation="aggregation" ';
			}

			compileString += '></div>';

			return compileString;
		};

		componentService.register('facet', compileStringFunction);
	}])
	.directive('palladioFacetFilterSettings', [function() {
		return {
			require: '^palladioFacetFilter',
			scope: { },
			templateUrl: 'partials/palladio-facet-component/settings.html',
			link: {
				pre: function(scope, element, attrs, facetCtrl) {
					scope.facetScope = facetCtrl.getScope();
				}
			}
		}
	}])
	.directive('palladioFacetFilter', ['palladioService', 'dataService', '$compile', function (palladioService, dataService, $compile) {
		return {
			scope : {
				height: '=',
				showControls: '=',
				showAccordion: '=',
				showDropArea: '=',
				showSettings: '=',
				configDimensions: '=',
				configAggregation: '=',
				onRemove: '&onRemove',
				functions: '='
			},
			templateUrl : 'partials/palladio-facet-component/template.html',
			controller: ['$scope', function($scope) {
				this.getScope = function () {
					return $scope;
				}
			}],
			link : {
				pre : function(scope, element) {

					var numericHeight;
					var headerHeight = 30;
					var minCellHeight = 20;

					if(!scope.height) {
						scope.calcHeight = "200px";
						numericHeight = 200;
					} else {
						scope.calcHeight = scope.height;
						numericHeight = +scope.calcHeight.substring(0, (scope.calcHeight.length - 2));
					}

					numericHeight = numericHeight - headerHeight;
					scope.dropMarginTop = (numericHeight - 100)/3 + 'px';

					// In the pre-linking function we can use scope.data, scope.metadata, and
					// scope.xfilter to populate any additional scope values required by the
					// template.

					var deregister = [];

					scope.metadata = dataService.getDataSync().metadata;
					scope.xfilter = dataService.getDataSync().xfilter;

					scope.uniqueToggleId = "facetFilter" + Math.floor(Math.random() * 10000);
					scope.uniqueToggleHref = "#" + scope.uniqueToggleId;
					scope.uniqueModalId = scope.uniqueToggleId + "modal";

					scope.dimensions = [];
					scope.config = {};
					scope.title = "Facet Filter";

					scope.remove = function() {
						scope.$destroy();
						angular.element(element).remove();
						scope.onRemove();
					}

					scope.dropModel = false;

					scope.$watch('dropModel', function() {
						if(scope.dropModel) {
							scope.dims = scope.dims.concat(scope.dropModel);
							scope.dropModel = false;
						}
					});

					// Set up aggregation selection.
					scope.getAggDescription = function (field) {
						if(field.type === 'count') {
							return 'Number of ' + field.field.countDescription;
						} else {
							return 'Sum of ' + field.field.description + ' (from ' + countDims.get(field.fileId).countDescription + ' table)';
						}
					};

					var countDims = d3.map();
					scope.metadata.filter(function (d) { return d.countable === true; })
						.forEach(function (d) {
							countDims.set(d.originFileId ? d.originFileId : 0, d);
						});

					scope.aggDims = scope.metadata.filter(function (d) { return d.countable === true || d.type === 'number'; })
						.map(function (a) {
							return {
								key: a.key,
								type: a.countable ? 'count' : 'sum',
								field: a,
								fileId: a.originFileId ? a.originFileId : 0
							};
						})
						.filter(function(d) { return countDims.get(d.fileId) ? true : false; })
						.sort(function (a, b) { return scope.getAggDescription(a) < scope.getAggDescription(b) ? -1 : 1; });


					scope.aggDim = scope.configAggregation ? scope.configAggregation : scope.aggDims[0];
					scope.$watch('aggDim', function () {
						if(scope.aggDim.key) {

							// Rebuild the facets with the new grouping.
							var selection = d3.select(element[0]).select('.inner-facet-container');
							var facets = selection
								.selectAll('.facet')
									.data(scope.dims, function(d) { return calculateDomKey(d.key); });

							facets.each(function (d) {
								buildFacetData(d);
							});

							updateFacets();
						}
					});
					scope.showAggModal = function () { $('#' + scope.uniqueModalId).find('#facet-agg-modal').modal('show'); };

					scope.showModal = function () { $('#' + scope.uniqueModalId).find('#facet-modal').modal('show'); };

					scope.fieldDescriptions = function () {
						return scope.dims.map( function (d) { return d.description; }).join(", ");
					};

					scope.countDescription = function () {
						if(scope.uniqueDimension) {
							return scope.uniqueDimension.countDescription;
						} else {
							return false;
						}
					};

					scope.getCountDescription = function (field) {
						return field.countDescription;
					};

					scope.uniqueDimension = undefined;

					// There can be only one unique key, so no selection for this one.
					if(scope.metadata.filter(function (d) { return d.countBy === true; })[0]) {
						scope.uniqueDimension = scope.metadata.filter(function (d) { return d.countBy === true; })[0];
						scope.config.uniqueDimension = scope.uniqueDimension.key;
					}

					scope.fields = scope.metadata.filter(function () {
						return true;
					}).sort(function (a, b) { return a.description < b.description ? -1 : 1; });

					// Get the countable fields.
					scope.countFields = scope.metadata.sort(function (a, b) { return a.countDescription < b.countDescription ? -1 : 1; });

					// If configuration dimensions are provided, default to those.
					if(scope.configDimensions) {
						scope.dims = scope.configDimensions;
					} else {
						scope.dims = [];
					}

					scope.check = function (d) {
						return scope.dims.map(function (g) { return g.key; }).indexOf(d.key) !== -1;
					};

					scope.$watch('dims', function () {

						scope.dims.forEach(function(d) {
							// If the dim has not already been updated with dimensions/groups,
							// update it.
							if(d.dimension === undefined) {
								buildFacetData(d);
							}
						});

						var selection = d3.select(element[0]).select('.inner-facet-container');

						var facetContainers = selection
							.selectAll('.facet-container')
								.data(scope.dims, function(d) { return calculateDomKey(d.key); });
								
						var newFacetContainers = facetContainers.enter()
							.append('div')
								.style('height', function() { return scope.calcHeight; })
								.attr('class', 'facet-container');
								
						var buttonGroup = newFacetContainers
							.append('div')
								.classed('facet-header', true)
								.style('height', headerHeight)
								.text(function(d) { return d.description + " (" + d.group.size() + ")"; })
							.append("span")
								.attr("class", "mode-buttons")
							.append("div").attr("class", "btn-group");;

						newFacetContainers
							.append('div')
								.classed('facet', true)
								.style('height', function() { return (numericHeight) + "px"; })
								
						var facets = facetContainers.select('.facet');

						var count = scope.dims.length;

						// Extend the width of the inner- and mid-facet-container
						selection
							.style('width', (225 * count) + 'px');
						selection.select('.mid-facet-container')
							.style('width', (225 * count) + 'px');

						var cells = facets.selectAll('.cell')
								.data(function (d) { return d.group.top(Infinity)
											.map(function(g) {
												return buildCellData(g,d);
											}); },
										function (d) { return d.key; });

						// Highlight/filter option
						// buttonGroup.append("a").attr("class", "btn-mini")
						// 		.classed('active', function(d) { return !d.highlight; })
						// 		.on("click", function(d, i) {
						// 			if(!d.highlight) {
						// 				d.highlight = true;

						// 				// Switch icon
						// 				d3.select(this).select('i').classed('fa-square', false);
						// 				d3.select(this).select('i').classed('fa-square-o', true);

						// 				// Remove filter and update
						// 				d.dimension.filterAll();
						// 				palladioService.removeFilter(scope.uniqueToggleId + d.facetKey);
						// 				applyFilterOrHighlight(d);
						// 				palladioService.update();
						// 			} else {
						// 				d.highlight = false;
						// 				// Switch icon
						// 				d3.select(this).select('i').classed('fa-square', true);
						// 				d3.select(this).select('i').classed('fa-square-o', false);

						// 				// Remove highlight and update
						// 				palladioService.removeHighlight();
						// 				applyFilterOrHighlight(d);
						// 				palladioService.update();
						// 			}
						// 			d3.select(this).classed('active', !d.highlight);
						// 		})
						// 		.append("i").attr("class", "fa fa-square");

						// Sort options twiddle the cells.
						buttonGroup.append("a").attr("class", "btn-mini")
							.attr("tooltip","Select")
							.attr("tooltip-append-to-body","true")
								.on("click", function(d) {
									$(this).toggleClass('active');
									// Remove all current filter values.
									d.filters.splice(0, d.filters.length);
									if(d3.select(this).classed("active")) {
										d.group.all().forEach(function (g) {
											d.filters.push(g.key);
										});
										d.dimension.filterFunction(function() { return true; });
										palladioService.setFilter(
											scope.uniqueToggleId + d.key,
											d.description,
											d.filters.join(', '),
											function() {
												d.filters.splice(0, d.filters.length); // Maintain the reference
												d.dimension.filterAll();
												palladioService.removeFilter(scope.uniqueToggleId + d.key);
												palladioService.update();
											}
										);
									} else {
										d.dimension.filterAll();
										palladioService.removeFilter(scope.uniqueToggleId + d.key);
									}
									palladioService.update();
								})
								.append("i").attr("class", "fa fa-check-square-o");

						buttonGroup.append("a").attr("class", "btn-mini")
								.on("click", function(d, i) {
									$(this).toggleClass('active');
									// Note that we have to reselect just the cells in this facet.
									if(d3.select(this).classed("active")) {
										d3.selectAll(cells[i]).sort(function(a,b) {
											return d3.ascending(a.key, b.key);
										});
										// Switch icon
										d3.select(this).select('i').classed('fa-sort-alpha-asc', false);
										d3.select(this).select('i').classed('fa-sort-numeric-desc', true);
									} else {
										d3.selectAll(cells[i]).sort(function(a,b) {
											return d3.descending(a.displayValue, b.displayValue);
										});
										// Switch icon
										d3.select(this).select('i').classed('fa-sort-alpha-asc', true);
										d3.select(this).select('i').classed('fa-sort-numeric-desc', false);
									}
								})
								.append("i").attr("class", "fa fa-sort-alpha-asc");

						if(scope.showSettings) {
							// Only allow closing the facet if settings are displayed ... for now.
							buttonGroup.append("a").attr("class", "btn-mini")
								.on("click", function (d) {
									if(d.highlight) {
										// If highlighting is in place, remove it.
										palladioService.removeHighlight();
									}
									scope.$apply(function(s) {
										s.dims = s.dims.filter(function (g) {
											return g.key !== d.key;
										});
									});
								})
								.append("i").attr("class", "fa fa-times");	
						}

						var newCells = cells.enter()
							.append('div')
								.classed('cell', true)
								.on('click', filterCell );

						newCells.append('div')
								.classed('cell-text', true);

						newCells.append('div')
								.classed('cell-value', true);

						newCells.call(updateCell);

						// Remove facets.
						facetContainers.exit().each(function(d) {
							palladioService.removeFilter(scope.uniqueToggleId + d.key);
							removeFacetData(d);
							palladioService.update();
						});

						facetContainers.exit().remove();
					});


					function buildFacetData(data) {
						if(data.dimension) {
							data.dimension.filterAll();
							data.dimension.remove();
						}
						data.dimension = scope.xfilter.dimension(function (l) { return "" + l[data.key]; });
						var exceptionKey, summationKey;
						exceptionKey = countDims.get(scope.aggDim.fileId).key;
						summationKey = scope.aggDim.key;
						var countReducer = reductio()
								.exception(function (d) { return d[exceptionKey]; })
									.exceptionCount(true);
						countReducer.value("of")
							.filter(function(d, nf) { return nf; })
							.exception(function (d) { return d[exceptionKey]; })
								.exceptionCount(true);
						var sumReducer = reductio()
							.exception(function (d) { return d[exceptionKey]; })
								.exceptionSum(function(d) { return +d[summationKey]; });
						sumReducer.value("of")
							.filter(function(d, nf) { return nf; })
							.exception(function (d) { return d[exceptionKey]; })
								.exceptionSum(function(d) { return +d[summationKey]; });
						data.group = scope.aggDim.type === "count" ?
							countReducer(data.dimension.group()) :
							sumReducer(data.dimension.group());
						if(scope.aggDim.type === "count") {
							data.group.order(function (d) { return d.exceptionCount; });
						} else {
							data.group.order(function (d) { return d.exceptionSum; });
						}
						var topValue = scope.aggDim.type === "count" ?
							data.group.top(1)[0].value.exceptionCount :
							data.group.top(1)[0].value.exceptionSum;
						var total = scope.aggDim.type === "count" ?
							d3.sum(data.group.all(), function (d) { return d.value.exceptionCount; }) :
							d3.sum(data.group.all(), function (d) { return d.value.exceptionSum; });
						var topRange = topValue / total * numericHeight > minCellHeight*2 ? topValue / total * numericHeight : minCellHeight*2;

						topRange = Math.floor(topRange) - 2;

						data.scale = d3.scale.linear()
							.domain([1, topValue])
							.range([minCellHeight, topRange]);

						data.domKey = calculateDomKey(data.key);
						data.filters = [];
						data.highlight = false;
					}

					function removeFacetData(data) {
						if(data.dimension) {
							data.dimension.filterAll();
							data.dimension.remove();
						}
						data.dimension = undefined;
						data.group = undefined;
						data.scale = undefined;
						data.domKey = undefined;
						data.filters = undefined;
					}

					function updateCell(sel) {
						sel.classed('filter-value', function(d) {
								return d.inFilter;
							}).transition()
								// .style('height', function (d) { return d.displayValue > 0 ? d.scale(d.displayValue) + 'px' : '3px'; });
								.style('height', function (d) { return d.displayValue > 0 ? minCellHeight + 'px' : '3px'; });

						sel.select('.cell-text')
							.text(function(d) { return d.displayValue > 0 ? d.key : ''; });

						sel.select('.cell-value')
							.text(function(d) { return d.displayValue > 0 ? d.displayValue + " / " + d.unfilteredValue : ''; });
							
						// Title for facets that will display the full text
						sel.attr('title', function(d) { return d.key; });
					}

					function buildCellData(cellData, facetData) {
						cellData.scale = facetData.scale;
						cellData.facetKey = facetData.key;
						cellData.facetDescription = facetData.description;
						cellData.dimension = facetData.dimension;
						cellData.filters = facetData.filters;
						cellData.highlight = function () { return facetData.highlight; };
						cellData.inFilter = cellData.filters.indexOf(cellData.key) !== -1;
						if(scope.aggDim.type === "count") {
							cellData.displayValue = cellData.value.exceptionCount;
							cellData.unfilteredValue = cellData.value.of.exceptionCount;
						} else {
							cellData.displayValue = cellData.value.exceptionSum;
							cellData.unfilteredValue = cellData.value.of.exceptionSum;
						}
						return cellData;
					}

					function filterCell(d) {
						if(d.filters.indexOf(d.key) !== -1) {
							// It's already in the filter.
							d.filters.splice(d.filters.indexOf(d.key),1);
						} else {
							// It's not in the filter.
							d.filters.push(d.key);
						}

						applyFilterOrHighlight(d);

						palladioService.update();
					}

					function applyFilterOrHighlight(d) {
						if(typeof d.highlight === 'function' ? !d.highlight() : !d.highlight) {
							if(d.filters.length === 1) {
								d.dimension.filterExact(d.filters[0]);
							} else {
								d.dimension.filterFunction(filterFunction.bind(null, d));
							}

							if(d.filters.length > 0) {
								deregister.push(
									palladioService.setFilter(
										scope.uniqueToggleId + d.facetKey,
										d.facetDescription,
										d.filters.join(', '),
										function() {
											d.filters.splice(0, d.filters.length); // Maintain the reference
											d.dimension.filterAll();
											palladioService.removeFilter(scope.uniqueToggleId + d.facetKey);
											palladioService.update();
										}
									)
								);
							} else {
								palladioService.removeFilter(scope.uniqueToggleId + d.facetKey);
							}
						} else {
							deregister.push(palladioService.setHighlight(highlightFunction.bind(null, d.dimension.accessor, d)));
						}
					}

					function filterFunction(d, v) {
						return d.filters.indexOf(v) !== -1 || d.filters.length === 0;
					}

					function highlightFunction(accessor, facet, v) {
						return facet.filters.indexOf(accessor(v)) !== -1 || facet.filters.length === 0;
					}

					function calculateDomKey(key) {
						return key.split("\n").join("").split('?').join("").split('"').join("").split(")").join("").split("(").join("").split(" ").join("").split(".").join("").split("#").join("").split("/").join("").split(",").join("").split("[").join("").split("]").join("").split("{").join("").split("}").join("");
					}

					function updateFacets() {
						var selection = d3.select(element[0]).select('.inner-facet-container');

						var facets = selection
							.selectAll('.facet')
								.data(scope.dims, function(d) { return calculateDomKey(d.key); });

						var cells = facets.selectAll('.cell')
							.data(function (d) { return d.group.top(Infinity)
											.map(function(g) {
												return buildCellData(g,d);
											}); },
										function (d) { return d.key; });

						cells.call(updateCell);
					}

					var updateCallback = palladioService.onUpdate(scope.uniqueToggleId, updateFacets);

					deregister.push(updateCallback);

					// Clean up after ourselves. Remove dimensions that we have created. If we
					// created watches on another scope, destroy those as well.
					scope.$on('$destroy', function () {
						scope.dims.map(function(d) {
							removeFacetData(d);
						});

						deregister.forEach(function (f) { f(); });

						// Get rid of the modal.
						$('#' + scope.uniqueModalId).remove();
					});

					scope.filterReset = function () {
						scope.dims.forEach(function(d) {
							d.filters = [];
							d.dimension.filterAll();
							palladioService.removeFilter(scope.uniqueToggleId + calculateDomKey(d.key));
						});
						palladioService.update();
					};

					scope.functions = {
						getSettings: function() {
							return element.find('.facet-settings')[0];
						}
					}

					scope.functions['importState'] = function(state) {
						importState(state)
						return true
					}
					scope.functions['exportState'] = function() {
						return exportState()
					}

					// State save/load.

					var importState = function(state) {
						scope.config = state.config;
						scope.$digest();

						// Remove default dims. We have to copy the array to do this in order to trigger
						// our watcher.
						while(scope.dims.length > 0) {
							if(scope.dims.length > 1) {
								scope.dims = scope.dims.slice(0, scope.dims.length - 1);
							} else {
								scope.dims = [];
							}
							scope.$digest();
						}

						// Need to do this one-by-one because of the way we watch for changes.
						// Important to iterate through the state, not the scope, to maintain order.
						state.dimKeys.forEach(function(d) {
							scope.fields.filter(function(f) { return f.key === d; })
								.forEach(function(d) {
									scope.addKey = d.key;
									scope.$digest();
								});
						});

						// Set the aggregation.
						if(state.aggDimKey) scope.aggDim = scope.aggDims.filter(function(f) { return f.key === state.aggDimKey; })[0];

						// Recalculate domKeys (in case we change format)
						state.domKeys = state.dimKeys.map(function(k) { return calculateDomKey(k); });

						scope.$digest();

						// Grab the facets from the DOM. We're going to click on them to filter.
						var facetSelection = d3.select(element[0]).selectAll('.facet')[0];

						// Set up the filters.
						state.filters.forEach(function(f, i) {
							var simpleArrayOfKeys = [];
							if(f && f[0] && typeof f[0] === 'string') {
								// New format.
								simpleArrayOfKeys = f;
							} else if(f) {
								simpleArrayOfKeys = f.map(function(d) { return d.key; });
							}

							if(simpleArrayOfKeys.length) {
								// Filter the cells to the ones in the saved filter.
								var cells = d3.select(facetSelection[i]).selectAll('.cell')
										.filter(function(d) {
											return simpleArrayOfKeys.indexOf(d.key) !== -1;
										}).each(function() {
											this.click();
										});
							}
						});
					};

					var exportState = function() {
						return {
							config: scope.config,
							aggDimKey: scope.aggDim.key,
							dimKeys: scope.dims.map(function(d) { return d.key; }),
							domKeys: scope.dims.map(function(d) { return calculateDomKey(d.key); }),
							filters: scope.dims.map(function(d) { return d.filters; })
						};
					};

					deregister.push(palladioService.registerStateFunctions(scope.uniqueToggleId, 'facet', exportState, importState));
				},

				post : function(scope, element, attrs) {

					$(element[0]).find('.toggle').on("click", function() {
						$(element[0]).find('.settings-panel').toggle(0, function() {
							$(element[0]).find('.view').toggleClass('span12');
							$(element[0]).find('.view').toggleClass('span10');
						});
					});

					// Move the modal out of the fixed area.
					$(element[0]).find('#facet-modal').parent().appendTo('body');
				}
			}
		};
	}]);

function elastic_list() {

  // Colors from colorbrewer2.org

	var height = 350,
			width = 200,
			group = null,
      all = null,
      dimension = null,
      filter = d3.map(),
      mode = 0,  // 0 = filter, 1 = global, 2 = lock
      maxCells = Infinity,
      resort = false,
      selection = null,
      minCellHeight = 20,
      emptyCellHeight = 2,
      scrollbarWidth = 0,
      scrollbarElement = null,
      cellMargin = 2,
      cellWidth = function() {
        return width - scrollbarWidth;
      },
      backgroundColor = "white",
      initialGroupMetaData = { },
      initialGroups = [ ],
      initialAgg = 0,
      initialCardinality = 0,
      uniqueDimension = null,
      aggregationType = null,
      aggregateKey = null,

      groupValue = function(v) { return v; },
      groupDisplayValue = function(v) { return v; },

      // Sort ordering - g and h are groups (g.key and g.value are available)
      // By default, sort descending by value.
      compareFunction = function(g, h) {
        return h.value.data.agg - g.value.data.agg;
      },

      // Call this after filter selection/deselection
      callback = function() { return true; },

      // drawCell context
      cellColorScale = d3.scale.quantize().range(["#EFF3FF", "#BDD7E7", "#6BAED6", "#DDDDDD"]).domain([1,0]),
      cellSizeScale = null,
      emptyCellColor = "#D9D9D9",
      filterColor = "#A8DDB5",
      totalAgg = 0,

      // cells.each(drawcell) - "this" is a svg "g" DOM object
      // default function can be over-ridden for fanciness
      redrawCell = function(sel) {
        var g = d3.select(sel);
        var rect = g.select("rect");
        var labelText = g.select(".label");
        var elementsText = g.select(".elements");

        g.classed("empty", function (d) { return d.group.value.data.agg === 0; });

        rect
          .classed("filtered", function (d) {
              return filter.has(d.group.key);
            })
          .transition(500).delay(500).attr("height", function(d) {
              // Make sure cells have a minimum height.
              return cellHeight(cellSizeScale(d.group.value.data.agg), d.group.value.data.agg); })
            .attr("fill", function(d) {
              if(filter.has(d.group.key)) {
                return filterColor;
              } else {
                if(d.group.value.data.agg === 0) {
                  return emptyCellColor;
                } else {
                  // Show the local profile by comparing the current % of the total for the group value to the
                  // initial % of total for the group value.
                  return cellColorScale(Math.abs((d.group.value.data.agg / totalAgg) - initialGroupMetaData[d.group.key].percentage));
                }
              }
            });
            

        g.transition(500).delay(1000).attr("transform", function(d, i) {
            return "translate(0, " + d.heightbefore + ")"; });

        labelText.text(function(d) { if(d.group.value.data.agg !== 0) return groupDisplayValue(d.group.key); });
        elementsText
          .text(function(d) { if(d.group.value.data.agg !== 0) return "" + d.group.value.data.agg + " / " + initialGroupMetaData[d.group.key].value; });
      },

      // cells.each(drawcell) - "this" is a svg "g" DOM object
      // default function can be over-ridden for fanciness
      initializeCell = function(sel) {

        var g = d3.select(sel);
        var rect = g.select("rect");
        var labelText = g.select(".label");
        var elementsText = g.select(".elements");

        if(rect.empty()) {
          g.on("click", function(d) {
            if(!g.classed("empty")) {
              if(filter.has(d.group.key)) {
                filter.remove(d.group.key);
              } else {
                filter.set(d.group.key, true);
              }
              dimension.filter(function(v) {
                return filter.has(groupValue(v)) || filter.keys().length === 0;
              });
              updateInternal();
              callback();
            }
          });

          rect = g.append("rect")
              .attr("width", cellWidth());
              
        }

        if(labelText.empty()) {
          labelText = g.append("text")
              .attr("class", "label")
              .attr("x", cellMargin)
              .attr("y", "1em")
              .attr("dx","2px")
              .attr("dy","2px")
          //    .attr("font-family", "Helvetica")
              .attr("font-size", "0.8em");
        }

        if(elementsText.empty()) {
          elementsText = g.append("text")
            .attr("class", "elements")
            .attr("x", cellWidth() - cellMargin)
            .attr("y", "1em")
            .attr("dx","-2px")
            .attr("dy","2px")
          //  .attr("font-family", "Helvetica")
            .attr("font-size", "0.8em")
            .attr("text-anchor", "end");
        }
      };

  // "sel" should be an "svg" or "g" element.
  function my(sel) {
    selection = sel;
    selection.style("height", height).style("width", width);

    group = dimension.group(groupValue);

    // Custom reducers to handle situations where there are multiple records for single "entity"
    // For example, we might have a data set of people and a person can have multiple occupations.
    // This is modeled with multiple records per person to show the mulitple occupations.

    var helpers = crossfilterHelpers.countByDimensionWithInitialCountAndData(
      function (v) { return v[uniqueDimension]; },
      function (d, p, t) {
        if(p === undefined) {
          p = { agg: 0, initialAgg: 0 };
        }
        if(t === 'add') {
          // Adding a new record.
          if(aggregationType === 'COUNT') {
            p.agg++;
          } else {
            p.agg = p.agg + (+d[aggregateKey] ? +d[aggregateKey] : 0); // Make sure to cast or you end up with a String!!!
          }
          if(p.agg > p.initialAgg) p.initialAgg = p.agg;
        } else {
          // Removing a record.
          if(aggregationType === 'COUNT') {
            p.agg--;
          } else {
            p.agg = p.agg - (+d[aggregateKey] ? +d[aggregateKey] : 0); // Make sure to cast or you end up with a String!!!
          }
        }
        return p;
      }
    );

    var reduceAdd = helpers.add;
    var reduceRemove = helpers.remove;
    var reduceInitial = helpers.init;

    function orderValue(p) {
      return p.data.agg;
    }

    // If uniqueDimension is defined, use it for counting.
    if(uniqueDimension !== undefined && aggregationType) {
      group.reduce(reduceAdd, reduceRemove, reduceInitial);
      group.order(orderValue);
    } else {
    // Otherwise, use default counting.
      group.reduce(
        function(p, v) {
          ++p.data.agg;
          if(p.data.agg > p.data.initialAgg) p.data.initialAgg = p.data.agg;
          return p;
        }, function(p, v) {
          --p.data.agg;
          return p;
        }, function() {
          return { count: 0, initialCount: 0, data: { agg: 0, initialAgg: 0 } };
        }
      );
    }

    all = group.top(Infinity);

    // Save the initial count to calculate proportions for local profile.
    initialAgg = all.reduce(function(prev, curr) { return prev + curr.value.data.initialAgg; }, 0);

    // Save hash of initial grouping values and percentages for local profile display.
    all.map(function(g){
      initialGroupMetaData[g.key] = { "value": g.value.data.initialAgg, "percentage": g.value.data.initialAgg / initialAgg };
    });

    // Save off initial group values for global display, locking counts with deep-ish copy.
    all.map(function(g){
      initialGroups.push({ "key": g.key, "value": { "count": g.value.initialCount, data: { agg: g.value.data.initialAgg } } });
    });

    // Set sort order - default to frequency ordering
    initialGroups.sort(compareFunction);
    all.sort(compareFunction);

    // Save the initial cardinality for the cell height scale calculation.
    initialCardinality = all.length;

    initialize();

    return {  update: updateInternal,
              selection: selection,
              resetFilter: resetFilter,
              lockMode: lockMode,
              filter: getFilterText,
              filterInternal: filterInternal,
              globalMode: globalMode,
              filterMode: filterMode,
              mode: my.mode,
              toggleResort: toggleResort,
              toggleLabelSort: toggleLabelSort,
              selectAll: selectAll,
              deselectAll: deselectAll };
  }

  function initialize() {

    // Cells    
    var cells = selection.selectAll(".cell")
        .data(generate_cell_data(all),
              function(d) { return d.group.key; });

    cells.enter().append("g")
        .attr("class", "cell");

    // Use queue.js for delayed execution.
    var q = queue();
    function enqueueCellInitialize() { q.defer(initializeCell, this); }

    // Initialize the cells (this can be user-specified).
    cells.each(enqueueCellInitialize);

    q.defer(function() {
      // Scrollbars
      if(scrollbarElement !== null) {
        scrollbarElement.height(height);
        //scrollbarElement.jScrollPane();
      }
    });

  }

  function updateInternal() {

    if(resort) {
      all.sort(compareFunction);
    }

    if(mode != 2) {
      if(mode === 0){
        updateWithGroups(all);
      } else {
        updateWithGroups(initialGroups);
      }
    }

    function updateWithGroups(groups) {

      var cspacing = 5,
          ctopmargin = cspacing,
          cleftmargin = cspacing;

      // Update global parameters with values based on new filters.
      totalAgg = groups.reduce(function(prev, curr) { return prev + curr.value.data.agg; }, 0); // Count of all groups

      // Set up the scale we use to calculate cell height.
      cellSizeScale = d3.scale.linear()
        .range([0, height - ((initialCardinality + 1) * cellMargin)])
        .domain([0, totalAgg]);

      // Cells    
      var cells = selection.selectAll(".cell")
          .data(generate_cell_data(groups),
                function(d) { return d.group.key; });

      if(resort) {
        cells.order();
      }

      // <nastiness>
      // Accumulator for totalHeight to which we'll stretch the selection
      var totalHeight = cellMargin; // Start with 0 height

      cells.each(function(){
        var cell = d3.select(this);
        var d = cell.datum();
        d.heightbefore = totalHeight; // Override to use scaled height for display
        totalHeight = totalHeight + cellHeight(cellSizeScale(d.group.value.data.agg), d.group.value.data.agg) + cellMargin;
        cell.datum(d); // Reset the data on the cell with the new height.
      });
      // </nastiness>

      // Use queue.js for delayed execution.
      var q = queue();
      function enqueueCellRedraw() {
        q.defer(redrawCell, this);
      }

      // Draw the cells (this can be user-specified).
      // Variables available:
      //
      //    totalAgg = dimension.groupAll().value();
      cells.each(enqueueCellRedraw);

      // Stretch the height of the selection to the totalHeight.
      q.defer(function() {
        selection.style("height", totalHeight);
      });

      // Update scrollbars after all the cells finish rendering.
      q.defer(function() {
        if(scrollbarElement && scrollbarElement.data('jsp')) {
          //scrollbarElement.data('jsp').reinitialise();
        }
      });

    }
  }

  // We generate an array of the data elements needed for cell in format
  // {  "group": a crossfilter group as represented as an element of group.all()
  //    "heightbefore": the number of elements in groups larger than this one }
  function generate_cell_data(groups) {

    var heightBefore = 0; // Accumulator for the size of the group before the current element.

    return groups.map(function(a, i) {
      heightBefore = heightBefore + a.value.value;

      return {
        "group": a,
        // This is raw size, but we'll scale to the real display height later
        "heightbefore": heightBefore - a.value.data.agg
      };
    });
  }

  // Ensure that cells have a minimum height after being scaled however we're scaling them.
  function cellHeight(scaled, value) {
    if(scaled < minCellHeight) {
      if(value === 0) {
        return emptyCellHeight;
      } else {
        return minCellHeight;
      }
    } else {
      return scaled;
    }
  }

  function resetFilter() {
    filter = d3.map();
    dimension.filterAll();
    callback();
  }

  function lockMode() {
    mode = 2;
  }

  function filterMode() {
    mode = 0;
    updateInternal();
  }

  function globalMode() {
    mode = 1;
    updateInternal();
  }

  function toggleResort() {
    if(resort === false) {
      resort = true;
      compareFunction = function(g, h) {
        return h.value.data.agg - g.value.data.agg;
      };
      updateInternal();
    } else {
      compareFunction = function(g, h) {
        return initialGroupMetaData[h.key].value - initialGroupMetaData[g.key].value;
      };
      updateInternal();
      resort = false;
    }
  }

  var labelSort = false;
  function toggleLabelSort() {
    if(labelSort === false) {
      compareFunction = function(g, h) {
        if(h.key > g.key) { return -1; } else { return 1; }
      };
      labelSort = true;
    } else {
      if(resort === false) {
        compareFunction = function(g, h) {
          return initialGroupMetaData[h.key].value - initialGroupMetaData[g.key].value;
        };
      } else {
        compareFunction = function(g, h) {
          return h.value.data.agg - g.value.data.agg;
        };
      }
      labelSort = false;
    }

    if(resort === false) {
      resort = true;
      updateInternal();
      resort = false;
    } else { updateInternal(); }
  }

  function getFilterText() {
    return filter.keys().map(function(f) {
      return groupDisplayValue(f);
    }).join(", ");
  }

  function filterInternal(value) {
    if (!arguments.length) return filter.entries();
    filter = d3.map();
    value.forEach(function(e) { filter.set(e.key, e.value); });

    dimension.filter(function(v) {
      return filter.has(groupValue(v)) || filter.keys().length === 0;
    });

    callback();
  }

  function selectAll() {
    filter = d3.map();
    
    all.forEach(function (a) {
      filter.set(a.key, true);
    });
    
    dimension.filter(function(v) {
      return filter.has(groupValue(v)) || filter.keys().length === 0;
    });
    
    callback();
  }

  function deselectAll() {
    filter = d3.map();
    dimension.filterAll();
    callback();
  }

  my.width = function(value) {
    if (!arguments.length) return width;
    width = value;
    return my;
  };

  my.height = function(value) {
    if (!arguments.length) return height;
    height = value;
    return my;
  };

  my.dimension = function(value) {
    if (!arguments.length) return dimension;
    dimension = value;
    return my;
  };

  my.callback = function(value) {
    if (!arguments.length) return callback;
    callback = value;
    return my;
  };

  my.redrawCell = function(value) {
    if (!arguments.length) return drawCell;
    drawCell = value;
    return my;
  };

  my.initializeCell = function(value) {
    if (!arguments.length) return initializeCell;
    initializeCell = value;
    return my;
  };

  my.groupValue = function(value) {
    if (!arguments.length) return groupValue;
    groupValue = value;
    return my;
  };

  my.groupDisplayValue = function(value) {
    if (!arguments.length) return groupDisplayValue;
    groupDisplayValue = value;
    return my;
  };

  my.compareFunction = function(value) {
    if (!arguments.length) return compareFunction;
    compareFunction = value;
    return my;
  };

  my.minCellHeight = function(value) {
    if (!arguments.length) return minCellHeight;
    minCellHeight = value;
    return my;
  };

  my.mode = function(value) {
    if (!arguments.length) return mode;
    mode = value;
    return my;
  };

  my.resort = function(value) {
    if (!arguments.length) return resort;
    resort = value;
    return my;
  };

  my.scrollbarWidth = function(value) {
    if (!arguments.length) return scrollbarWidth;
    scrollbarWidth = value;
    return my;
  };

  my.scrollbarElement = function(value) {
    if (!arguments.length) return scrollbarElement;
    scrollbarElement = value;
    return my;
  };

  my.uniqueDimension = function(value) {
    if (!arguments.length) return uniqueDimension;
    uniqueDimension = value;
    return my;
  };

  my.aggregateKey = function(value) {
    if (!arguments.length) return aggregateKey;
    aggregateKey = value;
    return my;
  };

  my.aggregationType = function(value) {
    if (!arguments.length) return aggregationType;
    aggregationType = value;
    return my;
  };

  return my;
}
angular.module('palladio').run(['$templateCache', function($templateCache) {
    $templateCache.put('partials/palladio-facet-component/template.html',
        "<div class=\"row\" ng-show=\"collapse\" ng-init=\"collapse=false\">\n\t<div class=\"col-lg-12\">\n\t\t{{title}}<span class=\"text-muted margin-left small\">Facet</span>\n\t\t<a class=\"btn btn-default btn-xs pull-right\"\n\t\t\ttooltip-animation=\"false\"\n\t\t\ttooltip-append-to-body=\"true\"\n\t\t\ttooltip-placement=\"left\"\n\t\t\ttooltip=\"Expand\"\n\t\t\tng-click=\"collapse=false\">\n\t\t\t<i class=\"fa fa-chevron-up\"></i>\n\t\t</a>\n\t</div>\n</div>\n\n<div class=\"row\" ng-show=\"!collapse\">\n\n\t<div ng-class=\"{'col-lg-9': showSettings, 'col-md-8': showSettings, 'col-lg-12': !showSettings, 'col-md-12': !showSettings}\">\n\n\t\t<div class=\"facet-container\" style=\"height: {{calcHeight}}\">\n\t\t\t<div class=\"mid-facet-container\" style=\"height: {{calcHeight}};\">\n\t\t\t\t<div class=\"inner-facet-container\" style=\"height: {{calcHeight}};\"></div>\n\t\t\t\t<div ng-show=\"showDropArea === 'true'\" palladio-droppable model=\"dropModel\" class=\"facet-drop-area\" style=\"margin-top: {{dropMarginTop}};\">\n\t\t\t\t\t<div class=\"facet-drop-area-text\">\n\t\t\t\t\t\tDrop dimensions here\n\t\t\t\t\t</div>\n\t\t\t\t</div>\n\t\t\t</div>\n\t\t</div>\n\n\t\t<div class=\"well well-expand\" ng-show=\"!fieldDescriptions() && showSettings === 'true'\">Select at least one dimension on the right</div>\n\t\t<div class=\"well well-expand\" ng-show=\"!fieldDescriptions() && showSettings !== 'true'\">No dimensions configured for facet display</div>\n\n\t</div>\n\n\t<div class=\"facet-settings col-lg-3 col-md-4\" ng-show=\"showSettings\">\n\t\t<palladio-facet-filter-settings></palladio-facet-filter-settings>\n\t</div>\n</div>\n\n<div id=\"{{uniqueModalId}}\">\n\t<div id=\"facet-modal\" data-description=\"Choose facet dimensions\" data-modal toggle-key=\"addKey\" dimensions=\"fields\" model=\"dims\" sortable=\"false\"></div>\n\t<div id=\"facet-agg-modal\" data-description=\"Choose count dimensions\" data-modal dimensions=\"aggDims\" model=\"aggDim\" description-accessor=\"getAggDescription\"></div>\n</div>\n");
}]);
angular.module('palladio').run(['$templateCache', function($templateCache) {
    $templateCache.put('partials/palladio-facet-component/settings.html',
        "<div class=\"row\" data-ng-show=\"facetScope.showAccordion\">\n  <div class=\"col-lg-4 col-md-4 col-sm-4 col-xs-4 text-right \">\n    <label class=\"inline text-muted\">Facet</label>\n  </div>\n  <div class=\"col-lg-8 col-md-8 col-md-8 col-xs-8 col-condensed\">\n    <a class=\"btn btn-default btn-xs pull-right\"\n      tooltip-animation=\"false\"\n      tooltip-append-to-body=\"true\"\n      tooltip-placement=\"left\"\n      tooltip=\"Collapse\"\n      ng-click=\"facetScope.collapse=true\">\n      <i class=\"fa fa-chevron-down\"></i>\n    </a>\n  </div>\n</div>\n\n<div class=\"row margin-top\">\n  <div class=\"col-lg-4 col-md-4 col-sm-4 col-xs-4 text-right \">\n    <label class=\"inline\">Description</label>\n  </div>\n  <div class=\"col-lg-8 col-md-8 col-md-8 col-xs-8 col-condensed\">\n    <input type=\"text\" class=\"form-control\" data-ng-model=\"facetScope.title\" placeholder=\"Untitled\"></input>\n  </div>\n</div>\n\n<div class=\"row margin-top\">\n  <div class=\"col-lg-4 col-md-4 col-sm-4 col-xs-4 text-right \">\n    <label class=\"inline\">Dimensions</label>\n  </div>\n  <div class=\"col-lg-8 col-md-8 col-md-8 col-xs-8 col-condensed\">\n    <span class=\"btn btn-default btn-modal\" ng-click=\"facetScope.showModal()\">\n      {{facetScope.fieldDescriptions() || \"Choose\"}}\n      <span class=\"caret\"></span>\n    </span>\n  </div>\n</div>\n\n<div class=\"row margin-top\">\n  <div class=\"col-lg-4 col-md-4 col-sm-4 col-xs-4 text-right \">\n    <label class=\"inline\">Count</label>\n  </div>\n  <div class=\"col-lg-8 col-md-8 col-md-8 col-xs-8 col-condensed\">\n    <span class=\"btn btn-default btn-modal\" ng-click=\"facetScope.showAggModal()\">\n      {{facetScope.getAggDescription(facetScope.aggDim) || \"Choose\"}}\n      <span class=\"caret\"></span>\n    </span>\n  </div>\n</div>\n\n<div class=\"row margin-top\">\n  <div class=\"col-lg-4 col-md-4 col-sm-4 col-xs-4 text-right \">\n  </div>\n  <div class=\"col-lg-8 col-md-8 col-md-8 col-xs-8 col-condensed\">\n\n    <a class=\"small\" \n      data-ng-show=\"facetScope.showControls === true\"\n      data-ng-click=\"facetScope.filterReset()\">Clear</a>\n\n    <a class=\"text-danger pull-right\"\n      data-ng-show=\"facetScope.showControls === true\"\n      tooltip-animation=\"false\"\n      tooltip-append-to-body=\"true\"\n      tooltip-placement=\"left\"\n      tooltip=\"Delete filter\"\n      data-ng-click=\"facetScope.remove()\">\n      <i class=\"fa fa-trash-o\"></i>\n    </a>\n  </div>\n</div>\n");
}]);