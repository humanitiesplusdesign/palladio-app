/* global SvgSaver */
// Timeline filter module

angular.module('palladioTimelineComponent', ['palladio', 'palladio.services'])
	.run(['componentService', function(componentService) {
		var compileStringFunction = function (newScope, options) {

			// Options
			//		showControls: true
			//		showAccordion: true
			//		showSettings: true
			//		fullWidth: false
			//		fullHeight: false

			newScope.showControls = newScope.showControls === undefined ? true : newScope.showControls;
			newScope.showAccordion = newScope.showAccordion === undefined ? true : newScope.showAccordion;
			newScope.showSettings = newScope.showSettings === undefined ? true : newScope.showSettings;
			newScope.timelineHeight = newScope.height === undefined ? 200 : newScope.height;
			newScope.functions = {};

			var compileString = '<div data-palladio-timeline-filter-with-settings ';

			compileString += 'show-controls=showControls ';
			compileString += 'show-accordion=showAccordion ';
			compileString += 'show-settings=showSettings ';
			compileString += 'timeline-height=timelineHeight ';
			compileString += 'functions=functions ';

			compileString += '></div>';

			return compileString;
		};

		componentService.register('timeline', compileStringFunction);
	}])
	.directive('palladioTimelineFilter', ['dateService', 'palladioService', function (dateService, palladioService) {
		var filterClass = "filter-extent";

		var directiveDefObj = {
			scope: {
				localDimension: '=dimension',
				groupAccessor: '=',
				type: '@',   // Can be 'numeric' or 'date'. Date format is YYYY-mm-dd
				uniqueDimension: '@countBy',
				xfilter: '=xfilter',
				title: '@',
				width: '@',
				height: '@',
				mode: '@',
				short: '=',
				extentOverride: '=',
				aggregationType: '@',
				aggregateKey: '@',
				setFilter: '=',
				getFilter: '='
			},
			link: function (scope, element, attrs) {

				if(scope.localDimension.top(1).length === 0) {
					throw "No date/number dimension defined.";
				}

				///////////////////////////////////////////////////////////////////////
				//
				// If optional attributes aren't provided, define default values.
				//
				///////////////////////////////////////////////////////////////////////

				var width = scope.width ? +scope.width : element.width();
				var height = scope.height ? +scope.height : 100;
				var mode = scope.mode ? scope.mode : 'stack';
				var type = scope.type ? scope.type : 'numeric';
				var groupAccessor = scope.groupAccessor ? scope.groupAccessor : function(d) { return "Default group"; };
				var uniqueDimension = scope.uniqueDimension === "" ? undefined : scope.uniqueDimension;
				var identifier = scope.title + Math.floor(Math.random() * 10000);

				///////////////////////////////////////////////////////////////////////
				//
				// Set up variables global to the timeline.
				//
				///////////////////////////////////////////////////////////////////////

				var format, dimFormat, stackGroups, g, yr, brush,
						color, y0, x, groups, lowestTime, highestTime, y1, stack, xAxis, yAxis,
						area, sel, z, mMargin, gr, groupContainer,
						hMargin, vMargin, yAxisWidth, xAxisHeight, mainHeight, mainWidth,
						brushHeight, title, gBrush;

				var extent = [];

				///////////////////////////////////////////////////////////////////////
				//
				// Watch for Palladio events that we need to respond to.
				//
				///////////////////////////////////////////////////////////////////////

				var deregister = [];

				deregister.push(palladioService.onUpdate(identifier, function() {
					sel.call(updateTimeline);
				}));

				scope.$on('filterReset', function() {
					filterReset();
				});

				deregister.push(palladioService.onReset(identifier, filterReset));

				scope.$on('zoomToFilter', function() {

					if(!brush.empty()) {
						// Grab the current brush extent so we can redraw later.
						tempExtent = brush.extent();

						var botExtent = brush.extent()[0][0];
						var topExtent = brush.extent()[brush.extent().length - 1][1];

						x.domain([botExtent, topExtent]);

						brush.clear();
						brush.extent(tempExtent);
					} else {
						x.domain([lowestTime, highestTime]);
					}

					// Update the zoom.
					z.x(x);
					z.event(d3.select(element[0]).select("svg").select("g"));
				});

				///////////////////////////////////////////////////////////////////////
				//
				// Watch for parameter changes that we need to respond to.
				//
				///////////////////////////////////////////////////////////////////////

				scope.$watch('mode', function(nv, ov) {
					if(nv !== ov) {
						mode = scope.mode;
						modeSetup();
						sel.call(updateTimeline);
					}
				});

				scope.$watch('title', function(nv, ov) {
					if(nv !== ov) {
						title = scope.title;
						titleSetup();
					}
				});

				scope.$watch('short', function (nv) {
					if(nv) {
						gr.select('.y-axis').style('display', 'none');
						groupContainer.attr('transform', 'matrix(1, 0, 0, 0.25, 0, 119.5)');
					} else {
						gr.select('.y-axis').style('display', 'inline');
						groupContainer.attr('transform', 'matrix(1, 0, 0, 1, 0, 0)');
					}
				});

				scope.$watchGroup(['uniqueDimension', 'aggregationType', 'aggregationKey'], function(nv, ov) {
					if(nv[0] !== ov[0] || nv[1] !== ov[1] || nv[2] !== ov[2]) {
						uniqueDimension = scope.uniqueDimension === "" ? undefined : scope.uniqueDimension;

						// Grab the current brush extent so we can redraw later.
						tempExtent = brush.extent();
						brush.clear();

						setup();

						brush.extent(tempExtent);

						sel.call(initializeTimeline);
						sel.call(updateTimeline);
					}
				});

				scope.$watch('localDimension', function(nv, ov) {
					if(nv) {

						// If you change the type, you must have changed the dimension, so we
						// handle type changes here.
						type = scope.type ? scope.type : 'numeric';

						// If the existing brush extent is non-zero, clear the existing
						// filter on the old dimension ('ov') and trigger the necessary events.
						if(brush && brush.extent()[1] - brush.extent()[0] !== 0) {
							ov.filterAll();
							scope.extentOverride.start = null;
							scope.extentOverride.end = null;

							// If title has already changed, then we have a problem. Need to use a
							// unique and static identifier...
							palladioService.removeFilter(identifier);
							palladioService.update();

							// If our container supports state saving.
							if(scope.setFilter) scope.setFilter(brush.extent());
						}

						setup();
						sel.call(initializeTimeline);
						sel.call(updateTimeline);
					}
				});

				scope.$watch('groupAccessor', function(nv, ov) {
					if(nv !== ov) {
						var tempExtent;

						groupAccessor = scope.groupAccessor ? scope.groupAccessor : function(d) { return "Default group"; };

						// Grab the current brush extent so we can redraw later.
						tempExtent = brush.extent();
						brush.clear();

						setup();

						brush.extent(tempExtent);

						sel.call(initializeTimeline);
						sel.call(updateTimeline);
					}
				});

				setup();

				// Draw the timelines.
				sel.call(initializeTimeline);
				sel.call(updateTimeline);

				///////////////////////////////////////////////////////////////////////
				//
				// Initializes the whole timeline. Run once and then update using
				// updateTimeline(). If parameters change, then this can be run
				// again, since it tests for selections that already exist.
				//
				///////////////////////////////////////////////////////////////////////

				function initializeTimeline(selection) {

					var timelineGroups = buildTimelineGroups(groups);

					stack(timelineGroups);

					gr = selection.select("svg").select("g");

					var tooltip = gr.select(".timeline-tooltip");

					if(gr.empty()) {
						gr = selection.append("svg")
								.attr("height", height)
								.attr("width", width)
							.append("g")
								.attr("transform", "translate(" + hMargin + ", " + vMargin + ")");

						// Set up transparent background rectable to catch zoom events.
						gr.append("rect")
								.attr("height", height - vMargin*2)
								.attr("width", width - hMargin*2)
								.attr("fill", "rgba(0, 0, 0, 0)");
					}

					z = d3.behavior.zoom();
					z.x(x);
					z.scaleExtent([1, Infinity]);
					z.on("zoom", zoom);

					if(!gr.select("g.x-axis").empty()) {
						gr.select("g.x-axis").remove();
					}

					gr.append("g")
							.attr("class", "axis x-axis")
							.attr("transform", "translate(0," + mainHeight + ")")
							.call(xAxis);

					brush.on("brushstart", function () {
						if(d3.event.sourceEvent) d3.event.sourceEvent.stopPropagation();
					});

					brush.on("brush", function () {
						extent = brush.extent();

						scope.localDimension.filterFunction(dimFilter);
						palladioService.update();
					});

					brush.on("brushend", function () {
						var ex = brush.extent();
						extent = ex;

						if (brush.empty()) {
							scope.localDimension.filterAll();

							scope.$parent.$digest(); // Apparently scope $digest doesn't propogate up.
							palladioService.removeFilter(identifier);

							// If our container supports state saving.
							if(scope.setFilter) scope.setFilter(brush.extent());
						} else {
							// Don't need to update as brushmove is already processed on brushend
							// scope.localDimension.filterFunction(dimFilter);

							scope.$parent.$digest(); // Apparently scope $digest doesn't propogate up.
							var filterText = ex.map(function (d) {
								return "from " + dimFormat(d[0]) + " to " + dimFormat(d[1]);
							}).join(" and ");
							deregister.push(palladioService.setFilter(identifier, scope.title, filterText, filterReset));

							// If our container supports state saving.
							if(scope.setFilter) scope.setFilter(brush.extent());
						}

						// updateHighlights(gr);

						palladioService.update();
					});

					if(!gr.select("g.brush").empty()) {
						gr.select("g.brush").remove();
					}

					brush.resizeAdaption(function (selection) {
						selection.append("path")
							.attr("transform", "translate(0, " + -(mainHeight * (1/4)) + ")");

						selection.select("rect").attr("height", mainHeight);

						function resizePath(d) {
							var e = +(d[0] == "e"), x = e ? 1 : -1, y = (mainHeight)*(1/2);
							return "M" + (0.5 * x) + "," + y +
								"A6,6 0 0 " + e + " " + (6.5 * x) + "," + (y + 6) +
								"V" + (2 * y - 6) +
								"A6,6 0 0 " + e + " " + (0.5 * x) + "," + (2 * y) +
								"Z" +
								"M" + (2.5 * x) + "," + (y + 8) +
								"V" + (2 * y - 8) +
								"M" + (4.5 * x) + "," + (y + 8) +
								"V" + (2 * y - 8);
						}
					});

					brush.extentAdaption(function (selection) {
						selection.attr("height", mainHeight)
							.classed(filterClass, true);
					});

					gBrush = gr.append("g").attr("class", "brush")
								.call(brush);

					gBrush.select('rect.background').attr("height", mainHeight);

					// Groups must be appended after the brush to support tooltips.

					// Remove all the groups so they get properly recreated.
					gr.selectAll(".group").remove();

					if(!gr.select(".groups").empty()) {
						gr.select(".groups").remove();
					}

					groupContainer = gr.append('g').attr("class", "groups");

					var group = groupContainer.selectAll(".group")
							.data(timelineGroups);

					color.domain(d3.extent(timelineGroups, function(d){ return d[0].i; }));

					group.style("fill", function(d) { return color(d[0].i); });

					var newGroups = group.enter()
							.append("g")
								.attr("class", "group");

					newGroups.append("path")
							.attr("class", "area")
							.attr("transform", "translate(-0.5,-0.5)")
							.style("fill", function(d) { return color(d[0].i); })
							.on("mouseover", function (d) {
								d3.select(this).style("fill", "#67D6E5");
							})
							.on("mouseout", function (d) {
								d3.select(this).style("fill", function(d) { return color(d[0].i); });
							})
							.tooltip(function (d,i){
                if(stackGroups[d[0].i] && stackGroups[d[0].i] !== "No group") {
                  return {
                    text : stackGroups[d[0].i],
                    displacement : [0,20],
                    position: [0,0],
                    gravity: "right",
                    placement: "mouse",
                    mousemove : true
                  };
                } else {
                  // Place off screen
                  return {
                    position: [0,0],
                    displacement: [-1000,0]
                  };
                }
							});

					if(tooltip.empty()) {
						// Set up the tooltip.
						tooltip = gr.append("g")
								.attr("class", "timeline-tooltip")
								.attr("pointer-events", "none")
								.style("display", "none");

						tooltip.append("foreignObject")
								.attr("width", 100)
								.attr("height", 26)
								.attr("pointer-events", "none")
							.append("html")
								.style("background-color", "rgba(0,0,0,0)")
							.append("div")
								.style("padding-left", 3)
								.style("padding-right", 3)
								.style("text-align", "center")
								.style("white-space", "nowrap")
								.style("overflow", "hidden")
								.style("text-overflow", "ellipsis")
								.style("border-radius", "5px")
								.style("background-color", "white")
								.style("border", "3px solid grey");
					}
				}

				var t;
				function dimFilter(d) {
					t = false;

					if(extent.length === 0) return true;

					extent.forEach(function (p) {
						if( p[0] <= dimFormat.parse(d) && p[1] >= dimFormat.parse(d) ) t = true;
					});
					return t;
				}

				///////////////////////////////////////////////////////////////////////
				//
				// Update timeline. Assumes the only things that have changed are
				// CrossFilter filters, y-/x-scales, or the 'mode' parameter.
				//
				///////////////////////////////////////////////////////////////////////

				function updateTimeline(selection) {

					var timelineGroups = buildTimelineGroups(groups);
					var gr = selection.select("svg").select("g");

					// Reset the y1 domain based on the current biggest group.
					var groupMax = d3.max(groups.map(function (d) {
						return d.value.data.countByGroup.values().map(function (c) { return c.agg; })
							.reduce(function (a, b) { return a + b; }, 0);
					}));

					// If we exceed the current domain, expand. Otherwise remain static.
					if(groupMax > y1.domain()[1]) {
						y1.domain([0, groupMax]);
					}

					yAxis.scale(y1);

					stack(timelineGroups);

					var group = groupContainer.selectAll(".group")
							.data(timelineGroups);

					if(mode === 'stack') {
						if(!gr.select('.y-axis').empty()) {
							gr.select('.y-axis').call(yAxis);
						} else {
							gr.append("g")
								.attr("class", "axis y-axis")
								.attr("transform", "translate(" + mainWidth + ", 0)")
								.call(yAxis);
						}
					} else {
						if(!gr.select('.y-axis').empty()) {
							gr.select('.y-axis').remove();
						}
					}

					group.exit().remove();

					group.transition()
						.attr("transform", function(d, i) {
							if(mode === 'stack') {
								return "translate(0, 0)";
							} else {
								return "translate(0," + y0(stackGroups[i]) + ")";
							}
						});

					var paths = group.select("path");

					paths.attr("d", function(d) { return area(d); });
				}

				///////////////////////////////////////////////////////////////////////
				//
				// Fill in missing groupings
				//
				///////////////////////////////////////////////////////////////////////

				function buildTimelineGroups(groups) {
					var lowestTime = format(d3.min(groups, function(d) { return format.parse(d.key); })),
							highestTime = format(d3.max(groups, function(d) { return format.parse(d.key); })),
							groupPosition = 0,
							defaultGroups = d3.map(),
							filledGroups = null,
							tempDate = null;

					// Hack to include end-dates that are not UTC. Need to do this for month/year
					// as well, if the format dictates that.
					var interimHT = format.parse(highestTime);
					interimHT.setUTCDate(interimHT.getUTCDate() + 1);
					highestTime = format(interimHT);

					var divisions = [highestTime];

					// Populate empty countByGroups
					stackGroups.forEach(function(d) {
						defaultGroups.set(d, { count: 0, agg: 0 });
					});

					if( type === 'numeric' ) {

						// Fill in empty groupings to force the area between groups to 0.

						while(divisions[0] > lowestTime) {
							divisions.unshift(divisions[0] - 1);
						}
					} else {

						// For Date-based timelines, we have to figure out the granularity first.

						if(format.toString().length === 8) {
							// Day-based
							while(format.parse(divisions[0]) > format.parse(lowestTime)) {
								tempDate = format.parse(divisions[0]);
								tempDate.setUTCDate(tempDate.getUTCDate() - 1);
								divisions.unshift(format(tempDate));
							}
						} else {
							if(format.toString().length === 5) {
								// Month-based
								interimHT = format.parse(highestTime);
								interimHT.setUTCMonth(interimHT.getUTCMonth()+1);
								highestTime = format(interimHT)
								divisions = [highestTime];
								while(format.parse(divisions[0]) > format.parse(lowestTime)) {
									tempDate = format.parse(divisions[0]);
									tempDate.setUTCMonth(tempDate.getUTCMonth() - 1);
									divisions.unshift(format(tempDate));
								}
							} else {
								// Year-based
								interimHT = format.parse(highestTime);
								interimHT.setUTCFullYear(interimHT.getUTCFullYear()+1);
								highestTime = format(interimHT)
								divisions = [highestTime];
								while(format.parse(divisions[0]) > format.parse(lowestTime)) {
									tempDate = format.parse(divisions[0]);
									tempDate.setUTCFullYear(tempDate.getUTCFullYear() - 1);
									divisions.unshift(format(tempDate));
								}
							}
						}
					}

					filledGroups = divisions.map(function(d) {
						if(groups[groupPosition] && groups[groupPosition].key === d) {
							groupPosition++;
							return { key: d, value: groups[groupPosition-1].value };
						} else {
							return { key: d, value: { count: 0, data: { countByGroup: defaultGroups, agg: 0 } } };
						}
					});

					return stackGroups.map(function(d, i) {
						return filledGroups.map( function(g) {
							return { "x": format.parse(g.key), "y": g.value.data.countByGroup.get(d).agg, "total": g.value.data.agg, "i": i };
						});
					});
				}

				///////////////////////////////////////////////////////////////////////
				//
				// Handle zooming in and out.
				//
				///////////////////////////////////////////////////////////////////////

				var tempExtent = [];
				var diff = null;
				var formatStr = null;
				var domainTop = null;
				var domainBot = null;
				function zoom() {

					if(type !== 'numeric') {
						diff = x.domain()[1].getFullYear() - x.domain()[0].getFullYear();
						formatStr = format.toString();

						if((diff >= 30 && formatStr !== "%Y") ||
								(1 < diff && diff < 30 && formatStr !== "%Y-%m") ||
								(diff <= 1 && formatStr !== "%Y-%m-%d")) {
							buildGroupings();
						}

						// Copy dates
						domainBot = dimFormat.parse(dimFormat(x.domain()[0]));
						domainTop = dimFormat.parse(dimFormat(x.domain()[1]));

						// Adjust years
						domainBot.setUTCFullYear(domainBot.getUTCFullYear() - 1);
						domainTop.setUTCFullYear(domainTop.getUTCFullYear() + 1);

						// We need to rebuild the groups with a new filter.
						groups = g.all().filter(function(g) {
							if(g.key && format.parse(g.key) &&
									((format.parse(g.key)) >= domainBot) &&
									((format.parse(g.key)) <= domainTop)) {
								return true;
							} else { return false; }
						});
					}

					// Fix translation getting stuck near 0.
					if(z.scale() === 1) z.translate([0,0]);

					xAxis.scale(x);
					brush.x(x);
					tempExtent = brush.extent();
					brush.clear();
					brush.extent(tempExtent);

					sel.select("svg").select('.x-axis').call(xAxis);
					sel.select("svg").select('.brush').call(brush);

					sel.call(updateTimeline);
				}

				///////////////////////////////////////////////////////////////////////
				//
				// Settings based on 'mode' parameter. Run this function if 'mode'
				// changes.
				//
				///////////////////////////////////////////////////////////////////////

				function modeSetup() {
					if(mode === 'stack') {
						y1.range([mainHeight, 0]);
						area.y0(function (d) { return y1(d.valueOffset); });
						area.y1(function (d) { return y1(d.y) - (y1.range()[0] - y1(d.valueOffset)); });
					} else {
						y1.range([y0.rangeBand(), 0]);
						area.y0(function (d) { return y0.rangeBand(); });
						area.y1(function (d) { return y1(d.y); });
					}
				}

				///////////////////////////////////////////////////////////////////////
				//
				// Settings based on 'title' parameter. Run this function if 'title'
				// changes.
				//
				///////////////////////////////////////////////////////////////////////

				function titleSetup() {
					if(scope.title !== undefined) {
						// For now we don't display the title
						// sel.select("span.list-title").text(scope.title);
					} else {
						sel.select("span.list-title").text(null);
					}
				}

				///////////////////////////////////////////////////////////////////////
				//
				// Setup the timeline environment.
				//
				///////////////////////////////////////////////////////////////////////

				function setup() {

					// Set up our formatter. If the type of the timeline is numeric, then it's just the
					// identity. Otherwise it will use the dateService format.
					format = null;
					dimFormat = null;

					if(type !== 'numeric') {
						format = dateService.format();
						// Much faster than d3.time.format("%Y-%m-%d") and supports negative years.
						dimFormat = dateService.format;
					} else {
						format = function (d) { return d; };
						format.parse = function(d) { return d; };
						dimFormat = format;
					}

					// Calculate groups for stacking/multiples.

					stackGroups = d3.map();

					// We need to create a dimension and group using the groupAccessor
					// so that we can read out all groups (including empty ones) and
					// grab their keys.

					var tempDim = scope.xfilter.dimension(groupAccessor);
					var tempGroup = tempDim.group();

					tempGroup.all().forEach(function(d) {
						if(!stackGroups.has(d.key)) {
							stackGroups.set(d.key, 0);
						}
					});

					tempDim.remove();
					tempGroup.remove();

					stackGroups = stackGroups.keys().sort();

					// Set up values to calculate the range of years we are dealing with.
					if(g) g.remove();
					g = null;
					yr = 0;

					// Set up values.
					brush = d3.svg.multibrush();

					hMargin = vMargin = mMargin = 10;
					xAxisHeight = 20;
					yAxisWidth = 30;
					// Width & height of the main visualization
					mainWidth = width - hMargin*2 - yAxisWidth;
					mainHeight = (height - vMargin*2 - xAxisHeight);

					//color = d3.scale.ordinal().domain([0,8]).range(colorbrewer.Greys[9]);
					color = d3.scale.linear().interpolate(d3.interpolateLab).range(['#DDDDDD','#444444']);

					y0 = d3.scale.ordinal()
							.rangeRoundBands([0, mainHeight], 0);

					x = null;

					groups = null;

					buildGroupings();

					lowestTime = d3.min(groups, function(d) { return format.parse(d.key); });
					highestTime = d3.max(groups, function(d) { return format.parse(d.key); });

					// Hack to include end-dates that are not UTC. Adjust based on format granularity.
					if(format.toString().length === 8) {
						// Day-based
						highestTime.setUTCDate(highestTime.getUTCDate() + 1);
					} else {
						if(format.toString().length === 5) {
							// Month-based
							highestTime.setUTCMonth(highestTime.getUTCMonth() + 1);
						} else {
							// Year-based
							highestTime.setUTCFullYear(highestTime.getUTCFullYear() + 1);
						}
					}

					if(lowestTime instanceof Date) {
						x = d3.time.scale().range([0, mainWidth])
									.domain([lowestTime, highestTime]);
					} else {
						x = d3.scale.linear().range([0, mainWidth])
									.domain([lowestTime, highestTime]);
					}

					x.clamp(true);

					y0.domain(stackGroups);

					var groupMax = d3.max(groups.map(function (d) {
						return d.value.data.countByGroup.values().map(function (c) { return c.agg; })
							.reduce(function (a, b) { return a + b; }, 0);
					}));

					y1 = d3.scale.linear()
							.domain([0, groupMax]);

					stack = d3.layout.stack()
							.out(function(d, dy) { d.valueOffset = dy; });

					xAxis = d3.svg.axis().orient("bottom")
							.scale(x);

					yAxis = d3.svg.axis().orient("right")
							.scale(y1)
							.ticks(10)
							.tickFormat(d3.format("d"));

					brush.x(x);

					// If the type is numeric, suppress commas in the timeline labels.
					if(type === 'numeric') {
						xAxis.tickFormat(d3.format("d"));
					}

					area = d3.svg.area()
							.x(function (d) { return x(d.x); })
							.interpolate("step-after");

					modeSetup();

					// D3.js selection for the directive element.
					sel = d3.select(element[0]);

					sel.attr("height", height);
					sel.attr("width", width);

					// Set up the title place-holder if it isn't already there.
					if(sel.select("span.list-title").empty()) {
						sel.append("span")
								.attr("class", "list-title");
					}
				}

				///////////////////////////////////////////////////////////////////////
				//
				// Build/rebuild our groupings. Normally happens as part of our setup()
				// but sometimes (e.g. during zooming) this is required outside the
				// normal setup lifecycle.
				//
				///////////////////////////////////////////////////////////////////////

				function buildGroupings() {

					///////////////////////////////////////////////////////////////////////
					//
					// Reduce functions that don't double-count by using add/reduce based
					// on unique dimension if defined.
					//
					// countByGroup property aggregates counts broken out by the grouping
					// defined by the group-accessor attribute.
					//
					///////////////////////////////////////////////////////////////////////

					var helper = crossfilterHelpers
						.countByDimensionWithInitialCountAndData(
							function (d) { return d[uniqueDimension] + ":" + groupAccessor(d); },
							function (v, p, t) {
								if(p === undefined) {
									// Populate the group hash:
									p = {};
									p.countByGroup = d3.map();
									stackGroups.forEach(function(d) {
										if(!p.countByGroup.has(d)) {
											p.countByGroup.set(d, { uniques: d3.map(), count: 0, agg: 0 });
										}
									});
								}
								if(t === 'add') {
									// Adding a new record.
									// Conditionally update group counts.
									if(p.countByGroup.get(groupAccessor(v)).uniques.has(v[uniqueDimension])) {
										p.countByGroup.get(groupAccessor(v)).uniques.set(v[uniqueDimension],
											p.countByGroup.get(groupAccessor(v)).uniques.get(v[uniqueDimension]) + 1 );
									} else {
										p.countByGroup.get(groupAccessor(v)).uniques.set(v[uniqueDimension], 1);
										p.countByGroup.get(groupAccessor(v)).count++;
										if(scope.aggregationType === 'COUNT') {
											p.countByGroup.get(groupAccessor(v)).agg++;
										} else {
											// Sum
											if(scope.aggregateKey) {
												p.countByGroup.get(groupAccessor(v)).agg = p.countByGroup.get(groupAccessor(v)).agg + (+v[scope.aggregateKey]); // Make sure to cast or you end up with a String!!!
											}
										}
									}

									if(scope.aggregationType === 'COUNT') {
										p.agg = p.agg + 1;
									} else {
										// Sum
										if(scope.aggregateKey) {
											p.agg = p.agg + (+v[scope.aggregateKey]); // Make sure to cast or you end up with a String!!!
										}
									}
								} else {
									// Removing a record.
									// Update group count.
									if(p.countByGroup.get(groupAccessor(v)).uniques.get(v[uniqueDimension]) === 1) {
										p.countByGroup.get(groupAccessor(v)).uniques.remove(v[uniqueDimension]);
										p.countByGroup.get(groupAccessor(v)).count--;

										if(scope.aggregationType === 'COUNT') {
											p.countByGroup.get(groupAccessor(v)).agg--;
										} else {
											// Sum
											if(scope.aggregateKey) {
												p.countByGroup.get(groupAccessor(v)).agg = p.countByGroup.get(groupAccessor(v)).agg - (+v[scope.aggregateKey]); // Make sure to cast or you end up with a String!!!
											}
										}
									} else {
										p.countByGroup.get(groupAccessor(v)).uniques.set(v[uniqueDimension],
											p.countByGroup.get(groupAccessor(v)).uniques.get(v[uniqueDimension]) - 1);
									}

									if(scope.aggregationType === 'COUNT') {
										p.agg = p.agg - 1;
									} else {
										// Sum
										if(scope.aggregateKey) {
											p.agg = p.agg - (+v[scope.aggregateKey]); // Make sure to cast or you end up with a String!!!
										}
									}
								}
								return p;
							});

					var reduceAdd = helper.add;
					var reduceRemove = helper.remove;
					var reduceInitial = helper.init;

					function orderValue(p) {
						return p.agg;
					}

					///////////////////////////////////////////////////////////////////////
					//
					// Reduce functions that just count normally, without worrying about
					// duplicate values.
					//
					///////////////////////////////////////////////////////////////////////

					function defaultReduceAdd(p, v) {
						++p.count;
						++p.agg;
						p.countByGroup.set(groupAccessor(v), p.data.countByGroup.get(groupAccessor(v)) + 1);
						return p;
					}

					function defaultReduceRemove(p, v) {
						--p.count;
						--p.agg;
						p.countByGroup.set(groupAccessor(v), p.data.countByGroup.get(groupAccessor(v)) - 1);
						return p;
					}

					function defaultReduceIntial() {
						var obj = { count: 0, agg: 0, data: { countByGroup: d3.map() } };

						// Populate the group hash:
						stackGroups.forEach(function(d) {
							if(!obj.data.countByGroup.has(d)) {
								obj.data.countByGroup.set(d, 0);
							}
						});

						return obj;
					}

					if(type != 'numeric') {

						// If we have a Date-type dimension, then make sure we don't have a ridiculous number
						// of groups by grouping at the date, then month, then year level.
						if(!x) {
							// If the x-scale hasn't been defined yet, we do this the hard way.
							g = scope.localDimension.group();
							var lt = d3.min(g.all().filter(function(g) { return g.key && dimFormat.parse(g.key); }), function(d) { return dimFormat.parse(d.key); });
							var ht = d3.max(g.all().filter(function(g) { return g.key && dimFormat.parse(g.key); }), function(d) { return dimFormat.parse(d.key); });
							yr = ht.getFullYear() - lt.getFullYear();
							g.remove();
						} else {
							yr = x.domain()[1].getFullYear() - x.domain()[0].getFullYear();
						}

						// If we are showing more than 2 years, we can't get down to a day-level granularity.
						if(yr <= 1) {
							format = dateService.format;
						} else {
							if(yr > 1 ) {
								format = dateService.formatMonth;

								// If we are showing more than 30 years, we can't get down to a month-level granularity.
								if(yr > 30) {
									format = dateService.formatYear;
								}
							}
						}
					}

					// Build our groups based on the chosen date granularity.
					var tempDate;

					if(g) {
						g.remove();
					}

					g = scope.localDimension.group(function (d) {
							if(d) {
								tempDate = dimFormat.parse(d);
							} else { tempDate = null; }

							if(tempDate !== null && tempDate !== undefined) {
								return format(tempDate);
							} else { return ""; }
						});

					// If uniqueDimension is defined, use it for counting.
					if(uniqueDimension !== undefined) {
						g.reduce(reduceAdd, reduceRemove, reduceInitial);
						g.order(orderValue);
					} else {
					// Otherwise, use default counting.
						g.reduce(defaultReduceAdd, defaultReduceRemove, defaultReduceIntial);
						g.order(
							function(p) {
								return p.data.agg;
							}
						);
					}

					groups = g.all().filter(function(g) { return g.key && format.parse(g.key); })
						.sort(function (a,b) { return format.parse(a.key) < format.parse(b.key) ? -1 : 1; });

				}

				///////////////////////////////////////////////////////////////////////
				//
				// Reset filters.
				//
				///////////////////////////////////////////////////////////////////////

				function filterReset() {
					scope.localDimension.filterAll();
					brush.clear();
					extent = brush.extent();
					// updateHighlights(gr);
					palladioService.removeFilter(identifier);
					palladioService.update();

					// If our container supports state saving.
					if(scope.setFilter) scope.setFilter(brush.extent());
				}


				// Handle updating filter from a saved extent.
				scope.getFilter = function (ex) {

					brush.clear();

					brush.extent(ex.map(function(e) { return [new Date(e[0]), new Date(e[1])]; }));
					extent = brush.extent();

					gBrush.call(brush);
					// sel.select("svg").select('.brush').call(brush);
					sel.call(updateTimeline);

					if (brush.empty()) {
						scope.localDimension.filterAll();
						// scope.extentOverride.start = null;
						// scope.extentOverride.end = null;
						// scope.$parent.$digest(); // Apparently scope $digest doesn't propogate up.
						palladioService.removeFilter(identifier);

						// If our container supports state saving.
						if(scope.setFilter) scope.setFilter(brush.extent());
					} else {
						// Don't need to update as brushmove is already processed on brushend
						scope.localDimension.filterFunction(dimFilter);

						// scope.$parent.$digest(); // Apparently scope $digest doesn't propogate up.
						var filterText = extent.map(function (d) {
							return "from " + dimFormat(new Date(d[0])) + " to " + dimFormat(new Date(d[1]));
						}).join(" and ");
						deregister.push(palladioService.setFilter(identifier, scope.title, filterText, filterReset));

						// If our container supports state saving.
						if(scope.setFilter) scope.setFilter(brush.extent());
					}

					palladioService.update();
				};

				scope.$on('$destroy', function () {
					deregister.forEach(function(f) { f(); });
				});
			}
		};

		return directiveDefObj;
	}])
	.directive('palladioTimelineFilterWithSettings', ['dateService', 'palladioService', 'dataService', function (dateService, palladioService, dataService) {
		var directiveObj = {
			scope: {
				timelineHeight: '=',
				showControls: '=',
				showAccordion: '=',
				showSettings: '=',
				functions: '='
			},
			templateUrl: 'partials/palladio-timeline-component/template.html',

			link: { pre: function(scope, element, attrs) {

					// In the pre-linking function we can use scope.data, scope.metadata, and
					// scope.xfilter to populate any additional scope values required by the
					// template.

					// The parent scope must include the following:
					//   scope.xfilter
					//   scope.metadata

					scope.metadata = dataService.getDataSync().metadata;
					scope.xfilter = dataService.getDataSync().xfilter;

					var deregister = [];

					scope.uniqueToggleId = "timelineFilter" + Math.floor(Math.random() * 10000);
					scope.uniqueToggleHref = "#" + scope.uniqueToggleId;
					scope.uniqueModalId = scope.uniqueToggleId + "modal";

					// Set up date selection.
					scope.dateDims = scope.metadata.filter(function (d) { return d.type === 'date'; })
							.sort(function (a, b) { return a.description < b.description ? -1 : 1; });

					var formatter = dateService.format;

					var dateDimAccessor = function (d) {
						return formatter.reformatExternal(d[scope.dateProp.key]);
					};
					scope.dateProp = scope.dateDims[0] ? scope.dateDims[0] : undefined;
					scope.$watch('dateProp.key', function(nv, ov) {
						// Avoid switching the dateDim before the directive is prepared.
						if(nv) {
							if(scope.dateDim) scope.dateDim.remove();
							scope.dateDim = scope.xfilter.dimension(dateDimAccessor);
							scope.title = scope.dateDims.filter( function (d) { return d.key == scope.dateProp.key; })[0].description;
						}
					});

					// Set up group selection.
					scope.groupDims = scope.metadata
							.sort(function (a, b) { return a.description < b.description ? -1 : 1; });
					scope.groupProp = scope.groupDims[0] ?
						scope.metadata.sort(function(a,b) { return a.cardinality < b.cardinality ? -1 : 1; })[0] :
						undefined;
					scope.$watch('groupProp', function() {
            if(scope.groupProp) {
              scope.groupAccessor = function(d) { return d[scope.groupProp.key] + ""; }; 
            } else {
							// TODO: Should use a unique random value here (or a Symbol)
              scope.groupAccessor = function(d) { return "No group"; }
            }
					});

					// Set up count selection.
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
					// Take the first aggDim from the first file.
					scope.aggDim = scope.aggDims.filter(function(d) { return d.fileId === 0; })[0] ?
									scope.aggDims.filter(function(d) { return d.fileId === 0; })[0] :
									scope.aggDims[0];
					scope.$watch('aggDim', function () {
						// scope.countBy = scope.aggDim ? scope.countDim.key : scope.countBy;
						if(!scope.aggDim) {
							// No aggregation selected - just choose the first one
							scope.countBy = scope.countDims.get(0).key;
						} else {
							// We figure out the unique aggregation dimension based on aggDim
							if(scope.aggDim.type === 'count') {
								scope.countBy = scope.aggDim.key;
								scope.aggregationType = 'COUNT';
								scope.aggregateKey = null;
							} else {
								// We are summing
								scope.countBy = countDims.get(scope.aggDim.fileId).key;
								scope.aggregationType = 'SUM';
								scope.aggregateKey = scope.aggDim.key;
							}
						}
					});

					scope.aggregationTypes = ['COUNT', 'SUM'];
					scope.aggregationType = 'COUNT';
					scope.aggregateKey = null;

					// Set the default unique key, so no selection for this one.
					if(scope.metadata.filter(function (d) { return d.countBy === true; })[0]) {
						scope.countBy = scope.metadata.filter(function (d) { return d.countBy === true; })[0].key;
					}

					// For short version
					scope.shortVersion = false;

					scope.$watch('shortVersion', function(s){
						d3.select(element[0]).select('svg').style('margin-top', function(){ return s ? '-133px' : ''; });
					});

					// Mode selection
					scope.modes = [ { "id": 'stack', "name": 'Stack' }, { "id": 'multiple', "name": 'Multiple' } ];
					scope.mode = 'stack';

					// Title/description is used for selection display and is based on the dimension.
					var matchDateDim = scope.dateDims.filter( function (d) { return d.key == scope.dateProp.key; })[0];
					scope.title = matchDateDim ? matchDateDim.description : "Timeline";

					scope.dateDim = scope.xfilter.dimension(dateDimAccessor);
					scope.groupAccessor = function(d) { return d[scope.groupProp.key] + ""; };

					scope.extentOverride = { start: null, end: null };

					scope.zoomToFilter = function () {
						scope.$broadcast('zoomToFilter');
					};

					scope.showDateModal = function () { $('#' + scope.uniqueModalId).find('#date-modal').modal('show'); };
					scope.showGroupModal = function () { $('#' + scope.uniqueModalId).find('#group-modal').modal('show'); };
					scope.showAggModal = function () { $('#' + scope.uniqueModalId).find('#agg-modal').modal('show'); };

					scope.filterReset = function () {
						scope.$broadcast('filterReset');
						scope.$broadcast('zoomToFilter');
					};

					// Clean up after ourselves. Remove dimensions that we have created. If we
					// created watches on another scope, destroy those as well.
					var destroyed = false;
					scope.$on('$destroy', function () {

						scope.$broadcast('filterReset');
						scope.dateDim.filterAll();
						scope.extentOverride = { start: null, end: null };
						scope.dateDim.remove();

						deregister.forEach(function (f) { f(); });

						destroyed = true;

						// Get rid of the modal.
						$('#' + scope.uniqueModalId).remove();
					});

					// Watch for filter changes and record them.

					scope.$on('updateFilter', function(event, args) {
						scope.filter = args;

						if(!args[1]) {
							scope.filter = null;
						}
					});

					scope.$on('expandFilters', function(event) {
						if($(element).find(".accordion-toggle").hasClass("collapsed")) {
							$(element).find(".accordion-toggle").click();
							scope.collapse = false;
						}
					});

					scope.$on('collapseFilters', function(event) {
						if(!$(element).find(".accordion-toggle").hasClass("collapsed")) {
							$(element).find(".accordion-toggle").click();
							scope.collapse = true;
						}
					});

					// State save/load.

					var currentFilter = [];
					scope.setFilter = function (extent) {
						currentFilter = extent;
					};

					// Placeholder
					scope.getFilter = function (extent) { };
          
          // Save SVG
          scope.saveAsSVG = function() {
            var svgsaver = new SvgSaver();
            var svg = element.find("svg")[0];
            console.log(svg);
            svgsaver.asSvg(svg, "Palladio_timeline_" + scope.title + ".svg");      
          };

					if(scope.functions) {
						scope.functions["date"] = function(dim) {
							scope.$apply(function(s) {
								if(dim) s.dateProp = s.dateDims.filter(function(f) { return f.key === dim.key; })[0];
							});
						};
						scope.functions["aggregation"] = function(dim) {
							scope.$apply(function(s) {
								if(dim) s.aggDim = s.aggDims.filter(function(f) { return f.key === dim.key; })[0];
							});
						};
						scope.functions["group"] = function(dim) {
							scope.$apply(function(s) {
								if(dim) {
									s.groupProp = s.groupDims.filter(function(f) { return f.key === dim.key; })[0];
								} else {
									s.groupProp = null;
								}
								
							});
						};
						scope.functions['getSettings'] = function() {
							return element.find('.timeline-settings')[0];
						}
						scope.functions['importState'] = function(state) {
							importState(state)
							return true
						}
						scope.functions['exportState'] = function() {
							return exportState()
						}
					}

					var importState = function(state) {
						scope.dateProp = scope.dateDims.filter(function(d) { return d.key === state.dateProp; })[0];
						scope.$digest();
						// Now aggDim, but we let it remain countDim in the save file for backward compatible.
						if(state.countDim) scope.countDim = scope.aggDims.filter(function(d) { return d.key === state.countDim; })[0];
						if(state.aggDimKey) scope.aggDim = scope.aggDims.filter(function(f) { return f.key === state.aggDimKey; })[0];

						scope.$digest();
						scope.groupProp = state.groupProp ? 
              scope.groupDims.filter(function(d) { return d.key === state.groupProp; })[0] : null;
						scope.$digest();
						scope.shortVersion = state.shortVersion;

						// TODO: Short version is not supported in 1.0 version.
						scope.shortVersion = false;

						// Manually digest here, or some of the above can trigger filter-clears
						// before the getFilter processing is complete.
						scope.$digest();

						if(state.extent) {
							scope.getFilter(state.extent);
							scope.$digest();
						}
					};

					var exportState = function() {
						return destroyed ? false : {
							countDim: scope.aggDim.key,
							dateProp: scope.dateProp.key,
							groupProp: scope.groupProp ? scope.groupProp.key : null,
							shortVersion: scope.shortVersion,
							extent: currentFilter,
							aggDimKey: scope.aggDim.key
						};
					};

					deregister.push(palladioService.registerStateFunctions(scope.uniqueToggleId, 'timeline', exportState, importState));

					// ng-class is not compiled before directive post-compile function (really!)
					// So we apply width classes manually...
					element.find('.main-viz').addClass(scope.showSettings ? 'col-lg-9' : 'col-lg-12');
					element.find('.main-viz').addClass(scope.showSettings ? 'col-md-8' : 'col-md-12');

				}, post: function(scope, element, attrs) {

					$(element).find('.toggle').on("click", function() {
						$(element).find('.settings-panel').toggle(0, function() {
							$(element).find('.view').toggleClass('span12');
							$(element).find('.view').toggleClass('span9');
						});
					});

					// Move the modal out of the fixed area.
					$(element[0]).find('#date-modal').parent().appendTo('body');
				}
			}
		};

		return directiveObj;
	}]);

angular.module('palladio').run(['$templateCache', function($templateCache) {
    $templateCache.put('partials/palladio-timeline-component/template.html',
        "<!--<div class=\"row\">\n\n\t<div class=\"col-lg-9 col-md-9 col-sm-11 col-xs-11 margin-bottom\">\n\t\t<input type=\"text\" class=\"form-control\" data-ng-model=\"title\" placeholder=\"Untitled\"></input>\n\t</div>\n\n\t<div class=\"col-lg-3 col-md-3 col-sm-1 col-xs-1 margin-bottom\">\n\n\t\t<a data-ng-show=\"showControls === 'true'\"\n\t\t\tclass=\"btn btn-default\"\n\t\t\tdata-ng-click=\"filterReset()\"\n\t\t\ttooltip-animation=\"false\"\n\t\t\ttooltip-append-to-body=\"true\"\n\t\t\ttooltip=\"Clear\">Clear</a>\n\n\n\t\t<a data-ng-show=\"showControls === 'true'\"\n\t\t\t class=\"text-danger fa fa-trash-o pull-right margin-top\"\n\t\t\t data-ng-click=\"$parent.removeFilter($event)\"\n\t\t\t tooltip-animation=\"false\"\n\t\t\t tooltip-append-to-body=\"true\"\n\t\t\t tooltip=\"Delete\"></a>\n\n\t\t<span class=\"clearfix\"></span>\n\n\t</div>\n</div>-->\n\n<div class=\"row\" ng-show=\"collapse\" ng-init=\"collapse=false\">\n\t<div class=\"col-lg-12\">\n\t\t{{title}}<span class=\"text-muted margin-left small\">Timeline</span>\n\t\t<a class=\"btn btn-default btn-xs pull-right\"\n\t\t\ttooltip-animation=\"false\"\n\t\t\ttooltip-append-to-body=\"true\"\n\t\t\ttooltip-placement=\"left\"\n\t\t\ttooltip=\"Expand\"\n\t\t\tng-click=\"collapse=false\">\n\t\t\t<i class=\"fa fa-chevron-up\"></i>\n\t\t</a>\n\t</div>\n</div>\n\n<div class=\"row\" ng-show=\"!collapse\">\n\n\t<div class=\"main-viz\">\n\n\t\t<div data-palladio-timeline-filter\n\t\t\tdata-dimension=\"dateDim\"\n\t\t\tdata-group-accessor=\"groupAccessor\"\n\t\t\tdata-xfilter=\"xfilter\"\n\t\t\tdata-type=\"date\"\n\t\t\tdata-short=\"shortVersion\"\n\t\t\tdata-title=\"{{title}}\"\n\t\t\tdata-height=\"{{timelineHeight}}\"\n\t\t\tdata-mode=\"{{mode}}\"\n\t\t\tdata-count-by=\"{{countBy}} \"\n\t\t\tdata-aggregation-type=\"{{aggregationType}}\"\n\t\t\tdata-aggregate-key=\"{{aggregateKey}}\"\n\t\t\tdata-set-filter=\"setFilter\"\n\t\t\tdata-get-filter=\"getFilter\"\n\t\t\tdata-extent-override=\"extentOverride\" >\n\t\t</div>\n\n\t\t<div class=\"well well-expand\" ng-show=\"!dateProp\">Select a Date dimension on the right</div>\n\n\t</div>\n\n\t<div class=\"col-lg-3 timeline-settings\" data-ng-show=\"showSettings\">\n\n\t\t<div class=\"row\">\n\t\t\t<div class=\"col-lg-4 col-md-4 col-sm-4 col-xs-4 text-right \">\n\t\t\t\t<label class=\"inline text-muted\">Timeline</label>\n\t\t\t</div>\n\t\t\t<div class=\"col-lg-8 col-md-8 col-md-8 col-xs-8 col-condensed\">\n\t\t\t\t<a class=\"btn btn-default btn-xs pull-right\"\n\t\t\t\t\ttooltip-animation=\"false\"\n\t\t\t\t\ttooltip-append-to-body=\"true\"\n\t\t\t\t\ttooltip-placement=\"left\"\n\t\t\t\t\ttooltip=\"Collapse\"\n\t\t\t\t\tng-click=\"collapse=true\">\n\t\t\t\t\t<i class=\"fa fa-chevron-down\"></i>\n\t\t\t\t</a>\n\t\t\t</div>\n\t\t</div>\n\n\t\t<div class=\"row margin-top\">\n\t\t\t<div class=\"col-lg-4 col-md-4 col-sm-4 col-xs-4 text-right \">\n\t\t\t\t<label class=\"inline\">Description</label>\n\t\t\t</div>\n\t\t\t<div class=\"col-lg-8 col-md-8 col-md-8 col-xs-8 col-condensed\">\n\t\t\t\t<input type=\"text\" class=\"form-control\" data-ng-model=\"title\" placeholder=\"Untitled\"></input>\n\t\t\t</div>\n\t\t</div>\n\n\t\t<div class=\"row margin-top\">\n\t\t\t<div class=\"col-lg-4 col-md-4 col-sm-4 col-xs-4 text-right \">\n\t\t\t\t<label class=\"inline\">Dates</label>\n\t\t\t</div>\n\t\t\t<div class=\"col-lg-8 col-md-8 col-md-8 col-xs-8 col-condensed\">\n\t\t\t\t<span class=\"btn btn-default btn-modal\" ng-click=\"showDateModal()\">\n\t\t\t\t\t{{dateProp.description || \"Choose\"}}\n\t\t\t\t\t<span class=\"caret\"></span>\n\t\t\t\t</span>\n\t\t\t</div>\n\t\t</div>\n\n\t\t<div class=\"row margin-top\">\n\t\t\t<div class=\"col-lg-4 col-md-4 col-sm-4 col-xs-4 text-right \">\n\t\t\t\t<label class=\"inline\">Height</label>\n\t\t\t</div>\n\t\t\t<div class=\"col-lg-8 col-md-8 col-md-8 col-xs-8 col-condensed\">\n\t\t\t\t<span class=\"btn btn-default btn-modal\" ng-click=\"showAggModal()\">\n\t\t\t\t\t{{getAggDescription(aggDim) || \"Choose\"}}\n\t\t\t\t\t<span class=\"caret\"></span>\n\t\t\t\t</span>\n\t\t\t</div>\n\t\t</div>\n\n\t\t<div class=\"row margin-top\">\n\t\t\t<div class=\"col-lg-4 col-md-4 col-sm-4 col-xs-4 text-right \">\n\t\t\t\t<label class=\"inline\">Group by</label>\n\t\t\t</div>\n\t\t\t<div class=\"col-lg-8 col-md-8 col-md-8 col-xs-8 col-condensed\">\n\t\t\t\t<span class=\"btn btn-default btn-modal\" ng-click=\"showGroupModal()\">\n\t\t\t\t\t{{groupProp.description || \"Choose\"}}\n\t\t\t\t\t<span class=\"caret\"></span>\n\t\t\t\t</span>\n        <span data-ng-show=\"groupProp\">\n          <i class=\"fa fa-close\" data-ng-click=\"groupProp = null\"></i>\n        </span>\n\t\t\t</div>\n\t\t</div>\n\n\t\t<div class=\"row margin-top\" data-ng-show=\"showControls\">\n\t\t\t<div class=\"col-lg-4 col-md-4 col-sm-4 col-xs-4 text-right \">\n\t\t\t</div>\n\t\t\t<div class=\"col-lg-8 col-md-8 col-md-8 col-xs-8 col-condensed\">\n\n\t\t\t\t<a class=\"small\" data-ng-click=\"filterReset()\">Clear</a>\n        <a class=\"small\" data-ng-click=\"saveAsSVG()\"\n          tooltip-animation=\"false\"\n\t\t\t\t \ttooltip-append-to-body=\"true\"\n\t\t\t\t\ttooltip-placement=\"top\"\n\t\t\t\t\ttooltip=\"Download as SVG\">\n          \n          <i class=\"fa fa-download\"></i>\n        </a>\n\n\t\t\t\t<a class=\"text-danger pull-right\"\n\t\t\t\t \ttooltip-animation=\"false\"\n\t\t\t\t \ttooltip-append-to-body=\"true\"\n\t\t\t\t\ttooltip-placement=\"left\"\n\t\t\t\t\ttooltip=\"Delete filter\"\n\t\t\t\t \tdata-ng-click=\"$parent.removeFilter($event)\">\n\t\t\t\t\t<i class=\"fa fa-trash-o\"></i>\n\t\t\t\t</a>\n\t\t\t</div>\n\t\t</div>\n\n\n\n\t</div>\n\n</div>\n\n<div id=\"{{uniqueModalId}}\">\n\t<div id=\"date-modal\" data-modal dimensions=\"dateDims\" model=\"dateProp\"></div>\n\t<div id=\"group-modal\" data-modal dimensions=\"groupDims\" model=\"groupProp\"></div>\n\t<div id=\"agg-modal\" data-modal dimensions=\"aggDims\" model=\"aggDim\"\n\t\tdescription-accessor=\"getAggDescription\"></div>\n</div>");
}]);