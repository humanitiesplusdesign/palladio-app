var mapboxStylesMap = {
	// Maps IDs from old "Classic" style mapbox tileset to IDs for newly created
	//  "modern" tilesets that are more-or-less equivalent.
	// (Saved projects will reference these, so they need to be supported.)
	"cesta.hd9ak6ie": "cesta/ckg1piv57010w19putr06104b",    // "Land"
	"cesta.k8gof2np": "mapbox/satellite-v9",                // "Satellite"
	"cesta.k8m9p19p": "cesta/ckg1qp80v02631apq1amjacri",    // "Streets"
	"cesta.k8ghh462": "cesta/ckg2j7auf0tyz19s2fqt7o07n",    // "Terrain"
	"cesta.k8g7eofo": "cesta/ckg2k36b80upx19pua1dy7y4z",    // "Buildings and Areas"
}

angular.module('palladioMapComponent', ['palladio', 'palladio.services'])
	.run(['componentService', function(componentService) {
		var compileStringFunction = function (newScope, options) {

			// Options
			//		showSettings: true
			//		height: 300px

			newScope.showSettings = newScope.showSettings === undefined ? true : newScope.showSettings;
			newScope.mapHeight = newScope.height === undefined ? "100%" : newScope.height;
			newScope.scrollWheelZoom = newScope.scrollWheelZoom === undefined ? true : newScope.scrollWheelZoom
			newScope.functions = {};

			var compileString = '<div class="with-settings" data-palladio-map-view-with-settings ';
			compileString += 'show-settings=showSettings ';
			compileString += 'map-height=mapHeight ';
			compileString += 'scroll-wheel-zoom=scrollWheelZoom ';
			compileString += 'functions=functions ';
			compileString += '></div>';

			return compileString;
		};

		componentService.register('map', compileStringFunction);
	}])
	.directive('palladioMapView', ['palladioService', function (palladioService) {

		var directiveDefObj = {

			scope: {
				layers: '=',
				tileSets: '=',
				mapHeight: '=',
				scrollWheelZoom: '=',
				center: '=',
				zoom: '=',
				popoverDims: '=',
				popoverTitleLinkDim: '='
			},

			link: function (scope, element, attrs) {

				var uniqueId = "mapView" + Math.floor(Math.random() * 10000);
				var deregister = [];
				var search = '';
				var l; // User-defined map layer
				var line = d3.svg.line().interpolate('bundle');

				// Height backwards compatibility
				if(scope.mapHeight) {
					// debugger;
					element.attr('style', 'height: ' + scope.mapHeight);
				} else {
					element.attr('style', 'height: 100%;');
				}

				deregister.push(palladioService.onUpdate(uniqueId, function() {
					// Only update if the table is visible.
					if(element.is(':visible')) { m.invalidateSize(false); update(); }
				}));

				deregister.push(palladioService.watchHighlight(uniqueId, function () {
					clearAllGroups();
				}));

				// Update when it becomes visible (updating when not visibile errors out)
				scope.$watch(function() { return element.is(':visible'); }, update);

				function clearAllGroups() {
					scope.layers.forEach(clearGroups);
				}

				function clearGroups(layer) {
					if(layer.sourceGroups) layer.sourceGroups.remove();
					layer.sourceGroups = null;
					if(layer.destGroups) layer.destGroups.remove();
					layer.destGroups = null;
					if(layer.nestedGroups) layer.nestedGroups.remove();
					layer.nestedGroups = null;
				}

				deregister.push(palladioService.onSearch(uniqueId, function(text) {
					search = text;
					layers.forEach(highlight);
				}));

				/* Creates geoJson features for points */

				function createPoints(objects, accessor) {

					var obj = { "type": "FeatureCollection", "features": [] };

					obj.features = objects.map(function(d){
						return {
							"type": "Feature",
							"geometry": {
								"type": "Point",
								"coordinates": accessor(d)
							},
							"properties": d
						};
					});

					return obj;
				}

				/* Creating geoJson Lines features */

				function createLines(objects, accessor) {

					var obj = { "type": "FeatureCollection", "features": [] };

					obj.features = objects.map(function(d){
						// Check these are valid numbers
						if(	!isNaN(+accessor(d)[0][0]) &&
							!isNaN(+accessor(d)[0][1]) &&
							!isNaN(+accessor(d)[1][0]) &&
							!isNaN(+accessor(d)[1][1]) ) {

							return {
								"type": "Feature",
								"geometry": {
									"type": "LineString",
									"coordinates": accessor(d)
								},
								"properties": d
								};
							}
						}
					).filter(function (d) { return d; });

					return obj;
				}

				function generatePoints(layer) {

					var helpers;

					var sourceAccessor =  layer.sourceAccessor || layer.sourceCoordinatesAccessor,
						destinationAccessor =  layer.destinationAccessor || layer.destinationCoordinatesAccessor;

					if(!layer.sourceGroups) {
						if(!layer.countBy) {
							var reducer = reductio()
								.aliasProp({
									agg: function (g) { return g.agg + 1; },
									initialAgg: function(g) { return isNaN(g.initialAgg) || g.agg > +g.initialAgg ? g.agg : g.initialAgg; }
								});

							// Track descriptions.
							reducer.value('desc').exception(sourceAccessor);

							if(scope.popoverDims && scope.popoverDims.length) {
								reducer.dataList(true);
							}

							layer.sourceGroups = reducer(layer.source.group())
									.order(function (p) { return p.agg; });
						} else {
							var reducer = reductio()
								.exception(function(v) { return v[layer.countBy]; });

							var highlight = reducer.value('hl')
								.filter(palladioService.getHighlight())
								.exception(function(v) { return v[layer.countBy]; });

							if(scope.popoverDims && scope.popoverDims.length) {
								reducer.dataList(true);
							}

							// Track descriptions.
							reducer.value('desc').exception(sourceAccessor);

							if(layer.aggregationType === 'COUNT') {
								reducer.exceptionCount(true);
								highlight.exceptionCount(true);
								reducer.aliasProp({
									agg: function(g) { return g.exceptionCount; },
									initialAgg: function(g) { return isNaN(g.initialAgg) || g.exceptionCount > +g.initialAgg ? g.exceptionCount : g.initialAgg; }
								});
								highlight.aliasProp({
									agg: function(g) { return g.exceptionCount; }
								});
							} else {
								reducer.exceptionSum(function(d) { return +d[layer.aggregateKey]; });
								highlight.exceptionSum(function(d) { return +d[layer.aggregateKey]; });
								reducer.aliasProp({
									agg: function(g) { return g.exceptionSum; },
									initialAgg: function(g) { return isNaN(g.initialAgg) || g.exceptionSum > +g.initialAgg ? g.exceptionSum : g.initialAgg; }
								});
								highlight.aliasProp({
									agg: function(g) { return g.exceptionSum; }
								});
							}
							layer.sourceGroups = reducer(layer.source.group())
									.order(function (p) { return p.agg; });
						}
					}

					if(layer.type == "point-to-point" && layer.destination && !layer.destGroups) {
						if(!layer.countBy) {
							var reducer = reductio()
								.aliasProp({
									agg: function (g) { return g.agg + 1; },
									initialAgg: function(g) { return isNaN(g.initialAgg) || g.agg > +g.initialAgg ? g.agg : g.initialAgg; }
								});

							// Track descriptions.
							reducer.value('desc').exception(destinationAccessor);

							if(scope.popoverDims && scope.popoverDims.length) {
								reducer.dataList(true);
							}

							layer.destGroups = reducer(layer.destination.group())
									.order(function (p) { return p.agg; });
						} else {
							var reducer = reductio()
								.exception(function(v) { return v[layer.countBy]; });

							var highlight = reducer.value('hl')
								.filter(palladioService.getHighlight())
								.exception(function(v) { return v[layer.countBy]; });

							if(scope.popoverDims && scope.popoverDims.length) {
								reducer.dataList(true);
							}

							// Track descriptions.
							reducer.value('desc').exception(destinationAccessor);

							if(layer.aggregationType === 'COUNT') {
								reducer.exceptionCount(true);
								highlight.exceptionCount(true);
								reducer.aliasProp({
									agg: function(g) { return g.exceptionCount; },
									initialAgg: function(g) { return isNaN(g.initialAgg) || g.exceptionCount > +g.initialAgg ? g.exceptionCount : g.initialAgg; }
								});
								highlight.aliasProp({
									agg: function(g) { return g.exceptionCount; }
								});
							} else {
								reducer.exceptionSum(function(d) { return +d[layer.aggregateKey]; });
								highlight.exceptionSum(function(d) { return +d[layer.aggregateKey]; });
								reducer.aliasProp({
									agg: function(g) { return g.exceptionSum; },
									initialAgg: function(g) { return isNaN(g.initialAgg) || g.exceptionSum > +g.initialAgg ? g.exceptionSum : g.initialAgg; }
								});
								highlight.aliasProp({
									agg: function(g) { return g.exceptionSum; }
								});
							}
							layer.destGroups = reducer(layer.destination.group())
									.order(function (p) { return p.agg; });
						}
					}

					var groupPoints = d3.map();

					layer.sourceGroups.all()
						// .filter( function (d) { return d.key && d.value.agg > 0; })
						.forEach( function (d) {
							// Must copy the group value because these values will be updated if we have a destGroup.
							d.value.desc.valueList = d.value.desc.values.map(function(f){ return f[0]; });
							groupPoints.set(d.key, {
								agg: d.value.agg,
								desc: {
									values: d.value.desc.values,
									exceptionCount: d.value.desc.exceptionCount,
									valueList: d.value.desc.valueList
								},
								hl: {
									agg: d.value.hl.agg,
									exceptionCount: d.value.hl.exceptionCount,
									values: d.value.hl.values
								},
								initialAgg: d.value.initialAgg,
								data: d.value.dataList
							});
						});

					// Having to merge is not ideal. Would be better to maintain a different grouping,
					// but we'll get to that eventually.
					if(layer.destGroups) {
						// Merge sources and destinations;
						var dests = layer.destGroups.all()
							// .filter( function (d) { return d.key && d.value.agg > 0; })
							.forEach( function (d) {
								if(groupPoints.has(d.key)) {
									groupPoints.get(d.key).agg += +d.value.agg;
									groupPoints.get(d.key).hl.agg += +d.value.hl.agg;
									groupPoints.get(d.key).initialAgg += d.value.initialAgg;
									groupPoints.get(d.key).desc.valueList = groupPoints.get(d.key).desc.valueList.concat(d.value.desc.values.map(function(f){ return f[0]; }));
									groupPoints.get(d.key).data = groupPoints.get(d.key).data ? groupPoints.get(d.key).data.concat(d.value.dataList) : undefined;
								} else {
									// Must copy the group value because these values will be updated.
									d.value.desc.valueList = d.value.desc.values.map(function(f){ return f[0]; });
									groupPoints.set(d.key, {
										agg: d.value.agg,
										desc: {
											values: d.value.desc.values,
											exceptionCount: d.value.desc.exceptionCount,
											valueList: d.value.desc.valueList
										},
										hl: {
											agg: d.value.hl.agg,
											exceptionCount: d.value.hl.exceptionCount,
											values: d.value.hl.values
										},
										initialAgg: d.value.initialAgg,
										data: d.value.dataList
									});
								}
							});
					}

					// remove entries for undefined coordinates
					groupPoints.remove(undefined);

					return createPoints(groupPoints.entries(), function(d){ return [ +d.key.split(',')[0], +d.key.split(',')[1] ]; });

				}


				function generateLinks(layer) {
					if (layer.type == "point-to-point") return pointToPoint(layer);
					return [];
				}

				/* Generates links by connecting two points (i.e. source/destination) */

				function pointToPoint(layer) {

					// aggregating links with same source and dest
					if (!layer.destination) return [];

					if(!layer.nestedGroups) {
						var reducer = reductio()
							.exception(function(v) { return v[layer.countBy]; });

						var highlight = reducer.value('hl')
							.filter(palladioService.getHighlight())
							.exception(function(v) { return v[layer.countBy]; });

						if(scope.popoverDims && scope.popoverDims.length) {
							reducer.dataList(true);
						}

						// Track descriptions.
						reducer.value('sourceDesc').exception(layer.sourceAccessor);
						reducer.value('destDesc').exception(layer.destinationAccessor);

						if(layer.aggregationType === 'COUNT') {
							reducer.exceptionCount(true);
							highlight.exceptionCount(true);
							reducer.aliasProp({
								agg: function(g) { return g.exceptionCount; },
								record: function(g,v) { return v; }
							});
							highlight.aliasProp({
								agg: function(g) { return g.exceptionCount; }
							});
						} else {
							reducer.exceptionSum(function(d) { return +d[layer.aggregateKey]; });
							highlight.exceptionSum(function(d) { return +d[layer.aggregateKey]; });
							reducer.aliasProp({
								agg: function(g) { return g.exceptionSum; },
								record: function(g,v) { return v; }
							});
							highlight.aliasProp({
								agg: function(g) { return g.exceptionSum; }
							});
						}

						layer.nestedGroups = reducer(layer.filterDimension.group());
					}

					var tempLinks = [];

					layer.nestedGroups.all().forEach( function (d) {
						// Don't use blank latlongs.
						if(d.key[0] && d.key[1] && d.value.agg > 0) tempLinks.push(
							{
								source: d.key[0],
								destination: d.key[1],
								value: d.value.agg,
								sourceDescriptions: d.value.sourceDesc.values.map(function(f){ return f[0]; }),
								destinationDescriptions: d.value.destDesc.values.map(function(f){ return f[0]; }),
								data: d.value.record
							}
						);
					});

					var lines = createLines(tempLinks, function(d) { return [
						// source
						[ +d.source.split(',')[0], +d.source.split(',')[1] ],
						//destination
						[ +d.destination.split(',')[0], +d.destination.split(',')[1] ]
						];
					});

					return lines;
				}

				var maxPointSize, displayLegend;
				var popoverMap = d3.map();

				function hidePopovers() {
					popoverMap.values().forEach(function(d) {
						$(d.node).popover('hide');
					});
				}

				function destroyPopovers() {
					popoverMap.values().forEach(function(d) {
						$(d.node).popover('hide');
					});
					popoverMap = d3.map();
				}

				function update() {

					var svg = d3.select(m.getPanes().overlayPane).select("svg");

					if(svg.empty()) {
						svg = d3.select(m.getPanes().overlayPane).append("svg");
					}

					var gs = svg.selectAll("g.leaflet-zoom-hide")
		          		.data(scope.layers.filter(function(d) { return d.enabled; }),
		          				function(l) {return l.index; });

		            svg.call(nodeTip);
					svg.call(linkTip);

		          	gs.enter().append("g").attr("class", "leaflet-zoom-hide");
		          	gs.exit().remove();

		          	gs.order();

			        m.on("viewreset", function() { gs.each(draw); });
			        m.on("moveend", function() { gs.each(draw); });

			        // Calculate maximum point size across layers
			        maxPointSize = scope.layers.reduce(function(a,b) {
			        	var t = 0;
			        	if(!b.geoJson) {
			        		t = d3.max(generatePoints(b).features.filter(function(d) { return d.properties.key; }), function(d){ return d.properties.value.initialAgg; });
			        	}
			        	return a > t ? a : t;
			        }, 0);

							displayLegend = scope.layers.reduce(function(a,b) {
								return a || b.pointSize;
							}, (scope.layers.length > 1))

			        gs.each(draw);
							drawLegend();

			        function draw(layer) {
			        	if(!layer.geoJson) {
			        		drawData(layer, this);
			        	} else {
			        		drawGeoJson(layer, this);
			        	}
			        }

							// legend

							function drawLegend() {
								if(!displayLegend) d3.select(element[0]).selectAll("div.legend").remove();

								if(displayLegend) {

									var circles,legend,labels;

									legend = d3.select(element[0]).select("div.legend");
									if(legend.empty()) {
										legend = d3.select(element[0]).selectAll("div.legend")
												.data(function(d){ return [d]; })
											.enter()
											.append("div")
												.attr("class", "legend");
									}

									// Multiple layers
									if(scope.layers.length > 1) {
										legend.select("div.layer-legend").remove();

										var layerLegend = legend.insert("div",":first-child")
												.attr("class", "layer-legend")
												.style("position","relative");

										layerLegend.append("div")
											.attr("class","legend-title")
											.text("Layers");

										layerLegend.selectAll("div.legend-swatch")
												.data(scope.layers)
											.enter().append("div")
												.html("&nbsp;")
												.attr("class", "legend-swatch")
												.attr("data-toggle", "tooltip")
												.attr("data-placement", "right")
												.attr("data-container", "body")
												.attr("title", function(d) { return d.description; })
												.style("background-color", function(d) { return d.color; })
												.style("opacity", function(d) { return d.enabled ? 1 : 0.1; })
												.on('click', function(d) { $(this).tooltip("destroy"); d.toggle(); })
												.call(function(selection) {
													selection[0].forEach(function(elem) {
														$(elem).tooltip({
															template: '<div class="tooltip" role="tooltip"><div class="tooltip-arrow"></div><div class="tooltip-inner"></div></div>'
														});
													})
												})
									} else {
										d3.select(element[0]).select("div.layer-legend").remove();
									}

									// For aggregation
									var pointSizeLayer = scope.layers.filter(function(l) { return l.pointSize; })[0];
									var legendPointSize =  maxPointSize ?
										d3.scale.sqrt().domain(
						       		[ 1, maxPointSize ]
						       	).range([3,26]) :
						       	function(){ return 3; }
									if(pointSizeLayer) {
										legend.select("div.point-legend").remove();

										var pointLegend = legend.append("div")
												.attr("class", "point-legend")
												.style("position","relative");

										var legendTitle = pointLegend.append("div")
											.attr("class","legend-title")
											.attr("data-toggle", "tooltip")
											.attr("data-placement", "right")
											.attr("data-container", "body")
											.attr("title", pointSizeLayer.aggDescription)
											.html(pointSizeLayer.aggDescription);

										pointLegend.selectAll("div.circle")
												.data([ maxPointSize, 1 ])
											.enter().append("div")
												.attr("class", "circle")
												.style("width", function (d,i){ return (legendPointSize(d) * 2) + "px"; })
												.style("height", function (d,i){ return (legendPointSize(d) * 2) + "px"; })
												.style("border-radius", "50%")
												.style("margin-top", function(d,i){ return d < maxPointSize ? -(legendPointSize(d)*2) + "px" : 0; })
												.style("margin-left", function(d,i){ return d < maxPointSize ? (legendPointSize(maxPointSize)-legendPointSize(d)) + "px" : 0; })
												.append("span")
												.attr("class","legend-title")
												.style("margin-left", function(d){ return (-(legendPointSize(maxPointSize)-legendPointSize(d))+legendPointSize(maxPointSize)*2 + 10) + "px"; })
												.html(String)

										$(legendTitle[0][0]).tooltip({
											template: '<div class="tooltip" role="tooltip"><div class="tooltip-arrow"></div><div class="tooltip-inner"></div></div>'
										});
									}
								}
							}

			        function drawData(layer, elem) {
			        	var container = d3.select(elem);
			        	var g = container.selectAll('g.layer')
			          		.data(function(d){ return [d]; })
			          	g.enter().append('g').attr("class", "layer");
						g.exit().remove();

			        	// creation of nodes and links
						var nodes = generatePoints(layer),
							edges = generateLinks(layer),
							pointSize = layer.pointSize ?
								d3.scale.sqrt().domain(
						       		[ 1, maxPointSize ]
						       	).range([3,26]) :
						       	function(){ return 3; },
							path = d3.geo.path()
								.pointRadius(function(d){ return pointSize(d.properties.value.agg);})
								.projection(project),
							opacity = function(d) { return ((d.properties.value.hl.agg ? d.properties.value.hl.agg : 0) > 0) ? 0.8 : 0.2; },
	   						value = edges.feature ? d3.scale.linear().domain([ d3.min(edges.features, function(d){ return d.properties.value; }), d3.max(edges.features, function(d){ return d.properties.value; }) ]).range([2,20]) : function(d){ return 2; };

	   					if(!layer.maxPointSize) layer.maxPointSize = maxPointSize;

			        	var w = d3.select(element[0]).style("width"),
			        		h = d3.select(element[0]).style("height")

			        	var bounds = m.getBounds(),
			        		topRight = project(bounds._northEast),
			              	bottomLeft = project(bounds._southWest);

			          	svg .attr("width", w)//topRight[0] - bottomLeft[0])
			              	.attr("height", h)//bottomLeft[1] - topRight[1])
			              	.style("margin-left", bottomLeft[0] + "px")
			              	.style("margin-top", topRight[1] + "px");

					    g 	.attr("transform", "translate(" + -bottomLeft[0] + "," + -topRight[1] + ")");


					    // links, if any...
					    var links = layer.showLinks ? edges.features || [] : [];

					    link = g.selectAll(".link")
							.data(links.filter(function(d) { return d.properties.value > 0; }),
								function(d) { return d.properties.source + "-" + d.properties.destination; })

						link.exit().remove();

						link
							.attr("stroke-width", function(d){ return value(d.properties.value); })
							.attr("d", curve)
							.style("stroke",layer.color)
							// .on("click", function(d){
							// 	layer.filterDimension.filter(function (c) {
							// 		return c[0] === d.properties.source &&
							// 			c[1] === d.properties.destination;
							// 	});
						 //    	deregister.push(palladioService.setFilter(identifier, scope.title, layer.sourceAccessor(d.properties.data) + "/" + layer.destinationAccessor(d.properties.data), resetLink));
							// 	palladioService.update();
						 //    })
						    .on("mouseover", linkTip.show)
							.on("mouseout", linkTip.hide)

						link.enter()
							.append("path")
							.classed("link",true)
							.attr("stroke-width", function(d){ return value(d.properties.value); })
							.attr("stroke-linecap", "round")
							.style("fill","none")
							.style("stroke",layer.color)
							.style("opacity",".2")
							.attr("d", curve)
							// .on("click", function(d){
							// 	layer.filterDimension.filter(function (c) {
							// 		return c[0] === d.properties.source &&
							// 			c[1] === d.properties.destination;
							// 	});
						 //    	deregister.push(palladioService.setFilter(identifier, scope.title, layer.sourceAccessor(d.properties.data) + "/" + layer.destinationAccessor(d.properties.data), resetLink));
							// 	palladioService.update();
						 //    })
						    .on("mouseover", linkTip.show)
							.on("mouseout", linkTip.hide)

						// This function should do what needs to be done to remove the filter.
				    	var resetLink = function () {
				    		layer.filterDimension.filterAll();
				    		palladioService.removeFilter(identifier);
				    		palladioService.update();
				    	}


			        	// nodes

			        	node = g.selectAll(".node")
			            	.data(nodes.features.filter(function(d) { return d.properties.value.agg > 0 && !isNaN(d.geometry.coordinates[0]) && !isNaN(d.geometry.coordinates[1]); }),
			            		function (d) { return d.properties.key; });

			            node.exit().remove();

			          	node
				          	.attr("d", path)
				          	.style("fill", layer.color)
						    .style("stroke", layer.color)
						    .style("opacity", opacity)
				    //       	.on("click", function(d){
						  //   	layer.filterDimension.filter(function (c) {
								// 	return c[0] === d.properties.key ||
								// 		c[1] === d.properties.key;
								// });
						  //   	deregister.push(palladioService.setFilter(identifier, scope.title, description(d.properties.value.desc.valueList), resetNode));
								// palladioService.update();
						  //   })
						    .on("mouseover", nodeTip.show)
							.on("mouseout", nodeTip.hide)

				        node.enter().append('path')
				          	.classed("node",true)
						    .attr("d", path)
						    .style("fill", layer.color)
						    .style("stroke", layer.color)
						    .style("opacity", opacity)
						  //   .on("click", function(d){
						  //   	nodeTip.hide();
						  //   	layer.filterDimension.filter(function (c) {
								// 	return c[0] === d.properties.key ||
								// 		c[1] === d.properties.key;
								// });
						  //   	deregister.push(palladioService.setFilter(identifier, scope.title, description(d.properties.value.desc.valueList), resetNode));
								// palladioService.update();
						  //   })
						    .on("mouseover", nodeTip.show)
							.on("mouseout", nodeTip.hide)
							.on('click', function(d) {
								if(popoverMap.get(d.properties.key) && popoverMap.get(d.properties.key).hasPopover === true) {
									destroyPopovers();
								} else if(scope.popoverDims && scope.popoverDims.length) {
									destroyPopovers();
									popoverMap.set(d.properties.key, { node: this });
									// XSS issue here.
									$(this).popover({
										title: function() {
											var datum = d3.select(this).datum();
											var title = description(datum.properties.value.desc.valueList) + " (" + datum.properties.value.agg + ")";
											// We assume only a single link URL for the title.
											if(scope.popoverTitleLinkDim) {
												var titleUrl = datum.properties.value.data[0][scope.popoverTitleLinkDim.key];
												if(titleUrl) {
													title = '<a target="_blank" href="' + datum.properties.value.data[0][scope.popoverTitleLinkDim.key] + '">' + title + "</a>";
												}
											}
											return title;
										},
										content: function() {
											var datum = d3.select(this).datum();
											var s = "";
											scope.popoverDims.forEach(function(dim) {
												var values = [];
												datum.properties.value.data.map(function(f) { return f[dim.key]; })
													.forEach(function(f) {
														if(values.indexOf(f) === -1) {
															values.push(f);
														}
													});
												s += "<b>" + dim.description + "</b>: " + values.join(", ") + "<br />";
											})
											return s;
										},
										html: true,
										trigger: 'manual',
										container: $('body'),
										placement: 'top',
										template: '<div class="popover" role="tooltip"><div class="arrow"></div><h3 class="popover-title"></h3><div class="popover-content"></div></div>'
									});

									$(this).popover('show');
									popoverMap.get(d.properties.key).hasPopover = true;
								}
							});

						// Destroy all popovers.
						destroyPopovers();

						// // Recreate them if necessary.
						// node.each(function(d) {
						// 	if(scope.popoverDims && scope.popoverDims.length && popoverMap.get(d.properties.key) && popoverMap.get(d.properties.key).hasPopover) {
						// 		var that = this;
						// 		setTimeout(function() {
						// 			$(that).popover({
						// 				title: function() {
						// 					var datum = d3.select(that).datum();
						// 					return description(datum.properties.value.desc.valueList) + " (" + datum.properties.value.agg + ")"
						// 				},
						// 				content: function() {
						// 					var datum = d3.select(that).datum();
						// 					var s = "";
						// 					scope.popoverDims.forEach(function(dim) {
						// 						var values = [];
						// 						datum.properties.value.data.map(function(f) { return f[dim.key]; })
						// 							.forEach(function(f) {
						// 								if(values.indexOf(f) === -1) {
						// 									values.push(f);
						// 								}
						// 							});
						// 						s += "<b>" + dim.description + "</b>: " + values.join(", ") + "<br />";
						// 					})
						// 					return s;
						// 				},
						// 				html: true,
						// 				container: $('body'),
						// 				placement: 'top'
						// 			});
						// 			if(popoverMap.get(d.properties.key) && popoverMap.get(d.properties.key).popoverDisplayed) {
						// 				$(that).popover('show');
						// 			}
						// 			popoverMap.get(d.properties.key).node = that;
						// 		}, 500);
						// 	}
						// });

						// This function should do what needs to be done to remove the filter.
				    	var resetNode = function () {
				    		layer.filterDimension.filterAll();
				    		palladioService.removeFilter(identifier);
				    		palladioService.update();
				    	}

				    	highlight(layer);


							}

			        function drawGeoJson(layer, elem) {

			        	var path = d3.geo.path().projection(projectLatLong);

			        	var container = d3.select(elem);
			        	var g = container.selectAll('g.layer')
			          		.data(function(d){ return [d]; })
			          	g.enter().append('g').attr("class", "layer");
						g.exit().remove();

			        	var w = d3.select(element[0]).style("width"),
			        		h = d3.select(element[0]).style("height")

			        	var bounds = m.getBounds(),
			        		topRight = project(bounds._northEast),
			              	bottomLeft = project(bounds._southWest);

			          	svg .attr("width", w)//topRight[0] - bottomLeft[0])
			              	.attr("height", h)//bottomLeft[1] - topRight[1])
			              	.style("margin-left", bottomLeft[0] + "px")
			              	.style("margin-top", topRight[1] + "px");

					    g 	.attr("transform", "translate(" + -bottomLeft[0] + "," + -topRight[1] + ")");

					   	var paths = g.selectAll('path')
					   			.data(layer.geoJson.features);

					   	paths.exit().remove();

					   	paths.attr("d", path)
					   			.attr("stroke", layer.color)
					   			.attr("fill", function(d) {
					   				if (layer.fillShapes && d.geometry && (d.geometry.type === "Point" || d.geometry.type === "Polygon" || d.geometry.type === "GeometryCollection")) {
					   					return layer.color;
					   				} else {
					   					return "none";
					   				}
					   			});

					   	paths.enter()
					   		.append("path")
					   			.attr("d", path)
					   			.attr("class", "shape")
					   			.attr("stroke", layer.color)
					   			.attr("fill", function(d) {
					   				if (layer.fillShapes && d.geometry && (d.geometry.type === "Point" || d.geometry.type === "Polygon" || d.geometry.type === "GeometryCollection")) {
					   					return layer.color;
					   				} else {
					   					return "none";
					   				}
					   			});

					   	paths.attr("d", path);
			        }

			        function tooltipNode(d,i){

					    return {
						    type: "tooltip",
						    text: description(d.properties.value.desc.valueList) + " (" + d.properties.value.agg + ")",//source + " → " + destination + " (" + d.properties.value + ")",
						    detection: "shape",
						    placement: "mouse",
						    gravity: "top",
						    displacement: [-(description(d.properties.value.desc.valueList)).length*7/2, 0],
						    mousemove: true
					    };
					}

					function tooltipLink(d,i){

						var source = layer.sourceAccessor ? layer.sourceAccessor(d.properties.data) : layer.sourceCoordinatesAccessor(d.properties.data),
							destination = layer.destinationAccessor ? layer.destinationAccessor(d.properties.data) : layer.destinationCoordinatesAccessor(d.properties.data);

						return {
						    type: "tooltip",
						    text: source + " → " + destination + " (" + d.properties.value + ")",
						    detection: "shape",
						    placement: "mouse",
						    gravity: "top",
						    displacement: [-(source + " → " + destination + " (" + d.properties.value + ")").length*5/2, 0],
						    mousemove: true
					    };
					}

			        function project(x) {
			        	var point = m.latLngToLayerPoint(x);
			        	return [point.x, point.y];
			        }

			        function projectLatLong(x) {
			        	var point = m.latLngToLayerPoint([x[1], x[0]]);
			        	return [point.x, point.y];
			        }

			        function curve(d) {

			        	var source = project(d.geometry.coordinates[0]),
							target = project(d.geometry.coordinates[1]),
			        		rad = Math.sqrt( Math.pow(target[0]-source[0],2) + Math.pow(target[1]-source[1], 2) )/4,
							sourceP = Math.atan2((target[1]-source[1]),(target[0]-source[0])) - Math.PI/10,
							targetP = Math.atan2((source[1]-target[1]),(source[0]-target[0])) + Math.PI/10

						return line([
							[source[0], source[1]],
							[source[0]+rad*Math.cos(sourceP),source[1]+rad*Math.sin(sourceP)],
							[target[0]+rad*Math.cos(targetP),target[1]+rad*Math.sin(targetP)],
							[target[0],target[1]]
						]);
			        }
				}

				function highlight(layer){

					if (!node) return;

					var sourceAccessor =  layer.sourceAccessor || layer.sourceCoordinatesAccessor,
						destinationAccessor =  layer.destinationAccessor || layer.destinationCoordinatesAccessor;

		        	// no highlight
		        	if (!search || !search.length) {
		        		node.classed("hidden-node", false);
		        		link.classed("hidden-link", false);
		        		return;
		        	}

		        	// some highlight
		        	node.classed("hidden-node", function(d){
		        		var found = description(d.properties.value.desc.valueList).toLowerCase().indexOf(search.toLowerCase()) !== -1;
		        		return found ? false : true;
		        	})

		        	link.classed("hidden-link", function(d){
		        		var found = sourceAccessor(d.properties.data).toLowerCase().indexOf(search.toLowerCase()) !== -1 || destinationAccessor(d.properties.data).toLowerCase().indexOf(search.toLowerCase()) !== -1;
		        		return found ? false : true;
		        	})

		        }

		        function reCalculatePointSize() {
		        	return d3.scale.sqrt().domain(
			       		[ 1, d3.max(nodes.features, function(d){ return d.properties.value.agg; }) ]).range([3,26]);
		        }

		        function description(arr) {

		        	// From http://stackoverflow.com/questions/9229645/remove-duplicates-from-javascript-array
		        	function uniq_fast(a) {
                var seen = {};
                var out = [];
                var len = a.length;
                var j = 0;
                for(var i = 0; i < len; i++) {
                  var item = a[i];
                  if(seen[item] !== 1) {
                    seen[item] = 1;
                    out[j++] = item;
                  }
                }
                return out;
              }

              var unique_array = uniq_fast(arr)

              if(unique_array.length > 5) {
                return (unique_array.slice(0,5).join(', ') + " plus " + (unique_array.length - 5) + " more");
              } else {
                return unique_array.join(', ');
              }
		        }

		        function linkDescription(sourceArr, destArr) {
		        	return description(sourceArr) + " → " + description(destArr);
		        }

		        // Set up HTTPS URLS for 1.0 API
		        L.mapbox.accessToken = 'pk.eyJ1IjoiY2VzdGEiLCJhIjoiMFo5dmlVZyJ9.Io52RcCMMnYukT77GjDJGA';

				// init map
				var node;
				var link;
				var coordinates = [45.4640, 9.1916];
				var zoom = scope.zoom && typeof scope.zoom === 'number' ? scope.zoom : 3;
				var center = scope.center && Array.isArray(scope.center) && scope.center.length === 2 ?
						new L.LatLng(scope.center[0], scope.center[1]) :
						new L.LatLng(coordinates[0], coordinates[1]);
		    var minZoom = 2;
				var maxZoom = 20;
		    var m = new L.Map(element[0], {
		            	center: center,
		            	zoom: zoom,
		            	minZoom : minZoom,
		            	maxZoom : maxZoom,
		            	scrollWheelZoom : scope.scrollWheelZoom,
		            	worldCopyJump: true
		       		});

		    m.attributionControl.addAttribution("© <a href='https://www.mapbox.com/map-feedback/'>Mapbox</a> © <a href='http://www.openstreetmap.org/copyright'>OpenStreetMap contributors</a>");
				L.control.scale().addTo(m);

				// Zoom to data control
				var ToDataControl = L.Control.extend({
					options: {
						position: 'topleft'
					},

					onAdd: function (map) {
						// create the control container with a particular class name
						var container = L.DomUtil.create('div', 'zoom-to-data-control leaflet-bar');
						L.DomEvent
							.addListener(container, 'click', L.DomEvent.stopPropagation)
							.addListener(container, 'click', L.DomEvent.preventDefault)
							.addListener(container, 'click', function () {
								// First calculate bounds.
								var coords = [];
								scope.layers.forEach(function(l) {
									coords = coords.concat(l.sourceGroups.all().map(function(g) {
										return g.key.split(',').map(parseFloat);
									}));
									if(l.destGroups) {
										coords = coords.concat(l.destGroups.all().map(function(g) {
											return g.key.split(',').map(parseFloat);
										}));
									}
								});

								coords = coords.filter(function(d) { return !isNaN(d[0]) && !isNaN(d[1]); });

								// Then fit the map to the bounds.
								if(coords.length > 0) {
									m.fitBounds(L.latLngBounds(coords));
								}
							});

						var link = L.DomUtil.create('a', 'leaflet-control-to-data', container);
						var icom = L.DomUtil.create('i', 'fa fa-object-group', link);

						link.title = "Zoom to data";
						link.href = "#";

						return container;
					}
				});

				m.addControl(new ToDataControl());

				// Tooltips
				var nodeTip = d3.tip()
				  	.offset([-10, 0])
				  	.attr("class","d3-tip")
				  	.html(function(d){ return description(d.properties.value.desc.valueList) + " (" + d.properties.value.agg + ")"; });

				var linkTip = d3.tip()
				  	//.offset([0, 0])
				  	.attr("class","d3-tip")
				  	.html(function(d){
				  		return linkDescription(d.properties.sourceDescriptions, d.properties.destinationDescriptions)
				  			+ " (" + d.properties.value + ")"; });

		 		scope.title = "Map View"
		       	var identifier = "" + scope.title + Math.floor(Math.random() * 10000);

		       	var filterDimension = null;

		       	function onLayerChange() {
		       		scope.layers.forEach(function(layer, i) {
		       			if(!layer.toggle) {
		       				layer.toggle = function() {
		       					layer.enabled = !layer.enabled;
		       					update();
		       				}
		       			}
		       		});

		       		clearAllGroups();
		       		update();
		       	}

		       	scope.$watch('popoverDims', function () {
		       		clearAllGroups();
		       		update();
		       	});

		       	// Shallow watch
		       	scope.$watchCollection('layers', function () {
		       		onLayerChange();
		       	});

		       	// Reference watch
		       	scope.$watch('layers', function () {
		       		onLayerChange();
		       	})

		       	scope.$watch('center', function() {
		       		if(scope.center && Array.isArray(scope.center) && scope.center.length === 2) {
		       			var center = new L.LatLng(scope.center[0], scope.center[1]);
		       			m.setView(center);
		       		}
		       	});

		       	scope.$watch('zoom', function() {
					if(scope.zoom && typeof scope.zoom === 'number') {
						m.setZoom(scope.zoom);
					}
		       	});

		       	scope.$watchCollection('tileSets', function (nv, ov) {
		       		// Remove old layers that are no longer in the new set.
		       		ov.forEach(function(o) {
		       			if(nv.indexOf(o) === -1) {
		       				m.removeLayer(o.layer);
		       			}
		       		})

					scope.tileSets.forEach(function(ts, i) {
						if(!ts.layer) {
							if(ts.url) {
								// Example: http://a.tile.stamen.com/watercolor/{z}/{x}/{y}.png
								ts.layer = L.tileLayer(ts.url);
							}
							if(ts.wmsUrl) {
								ts.layer = L.tileLayer.wms(ts.wmsUrl, {
									layers: ts.wmsLayers,
									format: 'image/png',
									transparent: true
								});
							}
							if(ts.mbId) {
								// Assume we have a mapbox id. Example: esjewett.k36b48ge
								ts.layer = L.tileLayer(
									'https://api.mapbox.com/styles/v1/{id}/tiles/{z}/{x}/{y}?access_token={accessToken}',
									{
										accessToken: L.mapbox.accessToken,
										tileSize: 512,
										maxZoom: 18,
										zoomOffset: -1,
										id: Object.prototype.hasOwnProperty.call(mapboxStylesMap, ts.mbId) ? mapboxStylesMap[ts.mbId] : ts.mbId
									}
								);
							}

							if(ts.layer) {
								ts.layer.addTo(m);
								ts.toggle = function () {
									ts.enabled = !ts.enabled;
									if(ts.enabled) {
										ts.layer.setOpacity(1);
									} else {
										ts.layer.setOpacity(0);
									}
								}
							}
						}

						if(ts.layer) {
							// As we cycle through the layers, bring them to the front in order,
							// resulting in them being re-ordered according to the current sort.
							ts.layer.bringToBack();

							// Update remove function to the current index.
							ts.remove = function() {
								m.removeLayer(ts.layer);
								scope.tileSets.splice(i, 1);
							};
						}
					});
				});

				scope.$on("resize", function(){
					m.invalidateSize(false);
				});

				function refresh() {
					if(!scope.mapHeight || scope.mapHeight === "100%") {
						element.height($(window).height()-50);
					}
					m.invalidateSize(false);
				}

				$(document).ready(refresh);
				$(window).resize(refresh);
				scope.$on("changeLayout", function(){
					m.invalidateSize(false);
				});
			}
		};

		return directiveDefObj;
	}])
	.directive('palladioMapViewWithSettings', ['dataService', 'palladioService', 'exportService', function (dataService, palladioService, exportService) {
		var directiveObj = {
			scope: {
				showSettings: '=',
				mapHeight: '=',
				scrollWheelZoom: '=',
				functions: '='
			},

			templateUrl : 'partials/palladio-map-component/template.html',

			link: { pre: function(scope, element, attrs) {

				scope.metadata = dataService.getDataSync().metadata;
				scope.xfilter = dataService.getDataSync().xfilter;
				scope.data = dataService.getDataSync().data;

				if(scope.showSettings === undefined) {
					scope.settings = true;
				} else { scope.settings = scope.showSettings; }

				scope.tileSets = [
					{
						"url": null,
						"mbId": 'cesta.hd9ak6ie',
						"enabled": true,
						"description": "Land",
						"layer": null
					}
				];

				scope.uniqueToggleId = "mapView" + Math.floor(Math.random() * 10000);
				scope.uniqueModalId = scope.uniqueToggleId + "modal";

				var deregister = [];

				scope.mapTypes = [
					{
						description : 'Points',
						value : 'points',
						info : "A basic layer showing only the...",
						img : "img/data_point.jpg"
					},
					{
						description : 'Point to point',
						value : 'point-to-point',
						info : "A basic layer showing only the...",
						img : "img/data_points.jpg"
					}
				];

				scope.mapType = scope.mapTypes[0];

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


				scope.aggDim = scope.aggDims[0];

				scope.showAggModal = function () { $('#' + scope.uniqueModalId).find('#agg-modal').modal('show'); };
				scope.showLayerModal = function () { $('#' + scope.uniqueModalId).find('#layer-modal').modal('show'); }

				scope.descriptiveDims = scope.metadata
						// We only allow choosing dimensions from the same origin file as the first coordinate dimension
						.filter( function (d) { return scope.metadata.filter(function (d) { return d.type === 'latlong' })[0] ? d.originFileId ===  scope.metadata.filter(function (d) { return d.type === 'latlong' })[0].originFileId : true; })
						.sort(function (a, b) { return a.countDescription < b.countDescription ? -1 : 1; });
				// If the first coordinates field has a descriptive field defined, default to that. Otherwise
				// just use the coordinates field directly.
				if(scope.metadata.filter(function (d) { return d.type === 'latlong' })[0]) {
					scope.descriptiveDim = scope.metadata.filter(function (d) { return d.type === 'latlong' })[0].descriptiveField ?
						scope.metadata.filter(function (d) { return d.type === 'latlong' })[0].descriptiveField :
						scope.metadata.filter(function (d) { return d.type === 'latlong' })[0];
				}
				scope.showDescriptionModal = function () { $('#' + scope.uniqueModalId).find('#description-modal').modal('show'); };

				scope.stringFields = scope.metadata.filter(function (d) { return d.type === 'text'; });
				scope.latlonFields = []

				scope.filterDimension = null;

				scope.metadata.filter(function (d) { return d.type === 'latlong'; }).forEach( function(d) {
					if(d.typeField === undefined || d.typeField.length === 0) {
						scope.latlonFields.push(d);
					} else {
						d.typeFieldUniques.forEach( function (u) {
							u.forEach( function (v) {
								var tempField = angular.copy(d);
								// Get the description of the link field
								tempField.description = scope.metadata.filter( function (n) { return n.key === v; })[0].description;
								scope.latlonFields.push(tempField);
							});
						});
					}
				});

				scope.dateFields = scope.metadata.filter(function (d) { return d.type === 'date'; });

				scope.showLinks = true;

				scope.mapType = scope.mapTypes[0];

				scope.mapping = {};

				// There can be only one count-by key, so no selection for this one.
				if(scope.metadata.filter(function (d) { return d.countBy === true; })[0]) {
					scope.countBy = scope.metadata.filter(function (d) { return d.countBy === true; })[0].key;
					scope.countDescription = scope.metadata.filter(function (d) { return d.countBy === true; })[0].description;
				}

				function buildLayerAttributes(layer) {
					// Transfer mapping and attributes
					layer.mapping = scope.mapping;
					layer.type = scope.mapType.value;
					layer.descriptiveDim = scope.descriptiveDim;
					layer.pointSize = scope.pointSize;
					layer.showLinks = layer.mapping.destinationCoordinates ? scope.showLinks : false;
					layer.color = scope.color;

					// If we are dealing with a type-based field, build a lookup mapping.
					var typeMap = d3.map();

					if(layer.mapping.sourceCoordinates && layer.mapping.sourceCoordinates.typeField !== undefined) {
						scope.data.filter( function (d) {
							return d[layer.mapping.sourceCoordinates.typeField].indexOf(layer.mapping.sourceCoordinates.description) !== -1;
						}).forEach( function (d) {
							typeMap.set(d[layer.mapping.sourceCoordinates.description], d);
						})
					}

					layer.sourceCoordinatesAccessor = !layer.mapping.sourceCoordinates ? null :
						function(d) {
							if(layer.mapping.sourceCoordinates.typeField === undefined) {
								return "" + d[layer.mapping.sourceCoordinates.key];
							} else {
								if(typeMap.has(d[layer.mapping.sourceCoordinates.description])) {
									return "" + typeMap.get(d[layer.mapping.sourceCoordinates.description])[layer.mapping.sourceCoordinates.key];
								} else {
									return "" + d[layer.mapping.sourceCoordinates.key];
								}
							}
						};

					layer.sourceAccessor = !layer.mapping.sourceCoordinates ? null :
						function(d) {
							if(layer.mapping.sourceCoordinates.typeField === undefined) {
								if(layer.descriptiveDim) {
									return "" + d[layer.descriptiveDim.key];
								} else {
									return "" + d[layer.mapping.sourceCoordinates.key];
								}
							} else {
								if(typeMap.has(d[layer.mapping.sourceCoordinates.description])) {
									return "" + typeMap.get(d[layer.mapping.sourceCoordinates.description])[layer.descriptiveDim.key];
								} else {
									return "" + d[layer.mapping.sourceCoordinates.key];
								}
							}
						};

					if (layer.source) layer.source.remove();
					layer.source = !layer.mapping.sourceCoordinates ? null : scope.xfilter.dimension(layer.sourceCoordinatesAccessor);
					if(layer.source) layer.source.accessor = layer.sourceCoordinatesAccessor;

					// If we are dealing with a type-based field, build a lookup mapping.
					var destTypeMap = d3.map();
					if(layer.mapping.destinationCoordinates && layer.mapping.destinationCoordinates.typeField !== undefined) {
						scope.data.filter( function (d) {
							return d[layer.mapping.destinationCoordinates.typeField].indexOf(layer.mapping.destinationCoordinates.description) !== -1;
						}).forEach( function (d) {
							destTypeMap.set(d[layer.mapping.destinationCoordinates.description], d);
						})
					}

					layer.destinationCoordinatesAccessor = !layer.mapping.destinationCoordinates ? null :
						function(d) {
							if(layer.mapping.destinationCoordinates.typeField === undefined) {
								return "" + d[layer.mapping.destinationCoordinates.key];
							} else {
								if(destTypeMap.has(d[layer.mapping.destinationCoordinates.description])) {
									return "" + destTypeMap.get(d[layer.mapping.destinationCoordinates.description])[layer.mapping.destinationCoordinates.key];
								} else {
									return "";
								}
							}
						};

					layer.destinationAccessor = !layer.mapping.destinationCoordinates ? null :
						function(d) {
							if(layer.mapping.destinationCoordinates.typeField === undefined) {
								if(layer.descriptiveDim) {
									return "" + d[layer.descriptiveDim.key];
								} else {
									return "" + d[layer.mapping.destinationCoordinates.key];
								}
							} else {
								if(destTypeMap.has(d[layer.mapping.destinationCoordinates.description])) {
									return "" + destTypeMap.get(d[layer.mapping.destinationCoordinates.description])[layer.descriptiveDim.key];
								} else {
									return "";
								}
							}
						};

					if (layer.destination) layer.destination.remove();
					layer.destination = !layer.mapping.destinationCoordinates ? null : scope.xfilter.dimension(layer.destinationCoordinatesAccessor);
					if(layer.destination) layer.destination.accessor = layer.destinationCoordinatesAccessor;

					buildFilterDimension(layer);

					if(!scope.aggDim) {
						// No aggregation selected - just choose the first one
						layer.countBy = scope.countDims.get(0).key;
					} else {
						// We figure out the unique aggregation dimension based on aggDim
						if(scope.aggDim.type === 'count') {
							layer.countBy = scope.aggDim.key;
							layer.aggregationType = 'COUNT';
							layer.aggregateKey = null;
							layer.aggDescription = scope.getAggDescription(scope.aggDim);
						} else {
							// We are summing
							layer.countBy = countDims.get(scope.aggDim.fileId).key;
							layer.aggregationType = 'SUM';
							layer.aggregateKey = scope.aggDim.key;
							layer.aggDescription = scope.getAggDescription(scope.aggDim);
						}
					}
				}

				// Clean up after ourselves. Remove dimensions that we have created. If we
				// created watches on another scope, destroy those as well.
				scope.$on('$destroy', function () {
					scope.layers.forEach(function(layer) {
						if(layer.source) layer.source.remove();
						if(layer.destination) layer.destination.remove();
					});

					deregister.forEach(function(f) { f(); });
				});

				function buildFilterDimension (layer) {
					if(layer.filterDimension) {
						layer.filterDimension.filterAll();
						layer.filterDimension.remove();
					}
					if(layer.source) {
						if(layer.destination) {
							layer.filterDimension = scope.xfilter.dimension(function (d) {
								return [layer.source.accessor(d), layer.destination.accessor(d)];
							});
						} else {
							layer.filterDimension = scope.xfilter.dimension(function (d) {
								return [layer.source.accessor(d)];
							});
						}
					}
				}

				// State save/load.

				function importState(state) {
					scope.$apply(function (s) {
						if(state && state.tileSets && state.tileSets.length) s.tileSets = state.tileSets;
						if(state && state.layers) {
							state.layers.forEach(function(d) {
								// Set the layer type
								scope.layerType = scope.layerTypes.filter(function(l) { return l.value === d.layerType; })[0];
								scope.description = d.description;
								scope.descriptiveDim = scope.metadata.filter(function(f) { return f.key === d.descriptiveDimKey; })[0] ? scope.metadata.filter(function(f) { return f.key === d.descriptiveDimKey; })[0] : scope.descriptiveDim;
								scope.mapping = {
									sourceCoordinates: scope.latlonFields.filter(function(f) { return f.key === d.mapping.sourceCoordinatesKey && f.description === d.mapping.sourceCoordinatesDescription; })[0],
									destinationCoordinates: scope.latlonFields.filter(function(f) { return f.key === d.mapping.destinationCoordinatesKey && f.description === d.mapping.destinationCoordinatesDescription; })[0],
								};
								scope.fillShapes = d.fillShapes;
								scope.color = d.color;
								scope.geoJson = JSON.stringify(d.geoJson);
								scope.mapType = scope.mapTypes.filter(function (m) { return m.value === d.type; })[0];

								scope.pointSize = d.pointSize;
								scope.showLinks = d.showLinks;

								scope.aggDescription = d.aggDescription;
								scope.aggregateKey = d.aggregateKey;
								scope.aggregationType = d.aggregationType;
								// This is horrific - just FYI
								scope.aggDim = scope.aggDims.filter(function(f) { return scope.getAggDescription(f) === d.aggDescription; })[0];

								scope.addLayer();
							});
						} else if(state) {
							// Handle the old version
							s.countDim = state.countDim;
							s.descriptiveDim = state.descriptiveDim;
							s.showLinks = state.showLinks;
							s.pointSize = state.pointSize;
							s.mapType = s.mapTypes.filter(function (d) { return d.value === state.mapType.value; })[0];
							s.mapping = {};
							if(state.mapping.sourceCoordinates) {
								s.mapping.sourceCoordinates =
									s.latlonFields
										.filter(function (d) {
											return d.description === state.mapping.sourceCoordinates.description; })[0];
							}
							if(state.mapping.destinationCoordinates) {
								s.mapping.destinationCoordinates =
									s.latlonFields
										.filter(function (d) {
											return d.description === state.mapping.destinationCoordinates.description; })[0];
							}
							if(state.aggDimKey) {
								s.aggDim = s.aggDims.filter(function(f) { return f.key === state.aggDimKey; })[0];
							}
							s.addLayer();
						}
						if(state && state.center) {
							scope.center = state.center;
						}
						if(state && state.zoom) {
							scope.zoom = state.zoom;
						}
					});
				}

				function exportState() {
					return {
						center: scope.center,
						zoom: scope.zoom,
						tileSets: scope.tileSets.map(function (t) {
							return {
								"url": t.url,
								"wmsUrl": t.wmsUrl,
								"wmsLayers": t.wmsLayers,
								"mbId": t.mbId,
								"enabled": t.enabled,
								"description": t.description,
							};
						}),
						layers: scope.layers.map(function (l) {
							return {
								aggDescription: l.aggDescription,
								fillShapes: l.fillShapes,
								geoJson: l.geoJson,
								aggregateKey: l.aggregateKey,
								aggregationType: l.aggregationType,
								color: l.color,
								countBy: l.countBy,
								description: l.description,
								enabled: l.enabled,
								layerType: l.layerType,
								descriptiveDimKey: l.descriptiveDim.key,
								mapping: {
									sourceCoordinatesKey: l.mapping && l.mapping.sourceCoordinates && l.mapping.sourceCoordinates.key ? l.mapping.sourceCoordinates.key : null,
									sourceCoordinatesType: l.mapping && l.mapping.sourceCoordinates && l.mapping.sourceCoordinates.typeField ? l.mapping.sourceCoordinates.typeField : null,
									sourceCoordinatesDescription: l.mapping && l.mapping.sourceCoordinates && l.mapping.sourceCoordinates.description ? l.mapping.sourceCoordinates.description : null,
									destinationCoordinatesKey: l.mapping && l.mapping.destinationCoordinates && l.mapping.destinationCoordinates.key ? l.mapping.destinationCoordinates.key : null,
									destinationCoordinatesType: l.mapping && l.mapping.destinationCoordinates && l.mapping.destinationCoordinates.typeField ? l.mapping.destinationCoordinates.typeField : null,
									destinationCoordinatesDescription: l.mapping && l.mapping.destinationCoordinates && l.mapping.destinationCoordinates.description ? l.mapping.destinationCoordinates.description : null
								},
								pointSize: l.pointSize,
								showLinks: l.showLinks,
								type: l.type
							};
						})
					};
				}

				function setCenterCoordinates(center) {
					scope.$apply(function(s) {
						s.center = center;
					});
				}

				function setZoomLevel(zoom) {
					scope.$apply(function(s) {
						s.zoom = zoom;
					});
				}

				function setPopoverDims(dims) {
					scope.$apply(function(s) {
						s.popoverDims = dims;
					});
				}

				function setPopoverTitleLinkDim(dim) {
					scope.$apply(function(s) {
						s.popoverTitleLinkDim = dim;
					})
				}

				if(scope.functions) {
					scope.functions["importState"] = importState;
					scope.functions["exportState"] = exportState;
					scope.functions["centerCoordinates"] = setCenterCoordinates;
					scope.functions["zoomLevel"] = setZoomLevel;
					scope.functions["popoverDims"] = setPopoverDims;
					scope.functions["popoverTitleLinkDim"] = setPopoverTitleLinkDim;
					scope.functions['getSettings'] = function() {
						return element.find('.map-settings')[0];
					}
				}

				scope.layerTypes = [
					{
						"description": "Data",
						"value": "data",
						"info": "Data layers allow you to display your data on the map as points and connections between them."
					},
					{
						"description": "Map tiles",
						"value": "tiles",
						"info": null
					},
					{
						"description": "geoJSON",
						"value": "geoJSON",
						"info": "Upload a geoJSON file including polygon features to overlay on the map."
					}
				];

				// layers
				scope.tilesTypes = [
					{
						"mbId": "cesta/ckg1piv57010w19putr06104b",
						"description": "Land",
						"info" : "A basic layer, showing only lands.",
						"img" : "img/map_land.jpg"
					},
					{
						"mbId": "cesta/ckg2k36b80upx19pua1dy7y4z",
						"description": "Buildings and Areas",
						"info" : "Buildings and green areas",
						"img" : "img/map_buildings.jpg"
					},
					{
						"mbId": "cesta/ckg1qp80v02631apq1amjacri",
						"description": "Streets",
						"info" : "A layer containing only topographical information (e.g. streets, cities, countries)",
						"img" : "img/map_street.jpg"
				},
					{
						"mbId": "cesta/ckg2j7auf0tyz19s2fqt7o07n",
						"description": "Terrain",
						"info" : "Shows natural features of the territories (e.g. mountains, lakes, rivers, green areas)",
						"img" : "img/map_terrain.jpg"
					},
					{
						"mbId": "mapbox/satellite-v9",
						"description": "Satellite",
						"info" : "Satellite photos",
						"img" : "img/map_satellite.jpg"
					},
					{
						"custom" : true,
						"description": "Custom tiles",
						"info" : "Choose one of the following methods to add custom tiles"
					}
				]

				scope.tilesType = scope.tilesTypes[0];

				scope.url = null;
				scope.wmsUrl = null;
				scope.wmsLayers = null;
				scope.mbId = null;
				scope.description = null;

				scope.layers = [];

				scope.addLayer = function () {

					if (scope.layerType.value === 'tiles' && scope.tilesType && !scope.tilesType.custom) {
						scope.tileSets.unshift({
							"url": null,
							"mbId": scope.tilesType.mbId,
							"enabled": true,
							"description": scope.description ? scope.description : scope.tilesType.description,
							"layer": null
						});
					}
					else if (scope.layerType.value === 'tiles' && (scope.url || scope.mbId || (scope.wmsUrl && scope.wmsLayers))) {
						scope.tileSets.unshift({
							"url": scope.url ? scope.url : null,
							"mbId": scope.mbId ? scope.mbId : null,
							"wmsUrl": scope.wmsUrl ? scope.wmsUrl : null,
							"wmsLayers": scope.wmsLayers ? scope.wmsLayers : null,
							"enabled": true,
							"description": scope.description,
							"layer": null
						});
					}
					else if (scope.layerType.value === 'data') {
						if(scope.editingLayer) {
							// If we are just editing the layer, we don't want to add it again.
							buildDataLayer();
							scope.layers = scope.layers.slice(); // Trigger watch
						} else {
							scope.layers.push(buildDataLayer());
						}
					} else if (scope.layerType.value === 'geoJSON') {
						if(scope.editingLayer) {
							buildGeoJsonLayer();
							scope.layers = scope.layers.slice();
						} else {
							scope.layers.push(buildGeoJsonLayer());
						}
					}

					scope.url = null;
					scope.wmsUrl = null;
					scope.wmsLayers = null;
					scope.mbId = null;
					scope.description = null;
					scope.mapping = {};
				}

				var dataLayerIndex = 0;
				function buildDataLayer() {
					var layer = {};

					if(scope.editingLayer) {
						// Updating an existing layer.
						layer = scope.editingLayer;
						scope.editingLayer = undefined;
					}

					layer.description = scope.description;

					if(!layer.description) {
						if(scope.mapping.sourceCoordinates && scope.mapping.destinationCoordinates) {
							layer.description = "" + scope.mapping.sourceCoordinates.description +
									" - " + scope.mapping.destinationCoordinates.description;
						} else {
							layer.description = "" + scope.mapping.sourceCoordinates.description;
						}
					}

					if(layer.index === undefined) {
						layer.index = dataLayerIndex;
						dataLayerIndex++;
					}
					layer.enabled = true;
					layer.layer = null;
					layer.layerType = scope.layerType.value;

					buildLayerAttributes(layer);

					layer.remove = function() {
						if(this.source) this.source.remove();
						if(this.destination) this.destination.remove();
						if(this.filterDimension) this.filterDimension.remove();
						scope.layers.splice(scope.layers.indexOf(this),1);
					}

					layer.edit = function() {
						scope.layerType = scope.layerTypes[0];
						scope.description = layer.description;
						scope.editingLayer = layer;
						scope.mapping = layer.mapping;
						scope.mapType = scope.mapTypes.filter(function(m) { return m.value === layer.type; })[0];
						scope.descriptiveDim = layer.descriptiveDim;
						scope.pointSize = layer.pointSize;
						scope.showLinks = layer.mapping.destinationCoordinates ? layer.showLinks : scope.showLinks;
						scope.color = layer.color;
						scope.addNewLayer = true;
					}

					return layer;
				}

				function buildGeoJsonLayer() {
					var layer = {};

					if(scope.editingLayer) {
						// Updating an existing layer.
						layer = scope.editingLayer;
						scope.editingLayer = undefined;
					}

					layer.description = scope.description;

					if(layer.index === undefined) {
						layer.index = dataLayerIndex;
						dataLayerIndex++;
					}

					layer.enabled = true;
					layer.layer = null;
					layer.layerType = scope.layerType.value;
					layer.fillShapes = scope.fillShapes;
					layer.color = scope.color;
					layer.geoJson = JSON.parse(scope.geoJson);
					scope.geoJson = null;

					layer.remove = function() {
						scope.layers.splice(scope.layers.indexOf(this),1);
					}

					layer.edit = function() {
						scope.layerType = scope.layerTypes[2];
						scope.addNewLayer = true;
						scope.description = layer.description;
						scope.editingLayer = layer;
						scope.geoJson = JSON.stringify(layer.geoJson);
						scope.color = layer.color;
						scope.fillShapes = layer.fillShapes;
					}

					return layer;
				}

				// Forces refresh of the codemirror when we update the model. Needed because CM
				// doesn't properly update when it is hidden so if we update the model and unhide
				// in the same update cycle it needs to be refreshed.
				scope.cmRefresh = true;
				scope.$watch('geoJson', function() {
					scope.cmRefresh = !scope.cmRefresh;
				});

				scope.tilesType = scope.tilesTypes[0];

				scope.selectTile = function(d){
					scope.tilesType = d;
				}

				scope.selectMap = function(d){
					scope.mapType = d;
				}

				scope.getAndExportSvg = function() {
					exportService(d3.select(element[0]).select('svg'), 'Palladio Map.svg')
				}

				deregister.push(palladioService.registerStateFunctions(scope.uniqueToggleId, 'mapView', exportState, importState));

			}, post: function(scope, element, attrs) {

				$(document).ready(function(){

					element.find('.settings-toggle').click(function() {
					  element.find('.settings').toggleClass('closed');
					});
				});
			} }
		};

		return directiveObj;
	}]);

angular.module('palladio').run(['$templateCache', function($templateCache) {
    $templateCache.put('partials/palladio-map-component/template.html',
        "<div class=\"view\">\n\t<!-- View -->\n\n\t<div data-palladio-map-view\n\t\tmap-height=\"mapHeight\"\n    scroll-wheel-zoom=\"scrollWheelZoom\"\n\t\ttile-sets=\"tileSets\"\n\t\tlayers=\"layers\"\n\t\tzoom=\"zoom\"\n\t\tcenter=\"center\"\n\t\tpopover-dims=\"popoverDims\"\n\t\tpopover-title-link-dim=\"popoverTitleLinkDim\">\n\t</div>\n\t<div id=\"palladio-map-popover\" style=\"position: absolute; height: 100px; width: 100px; top: 0px; left: 0px; opacity: 0; pointer-events: none; box-sizing: border-box;\"></div>\n</div>\n\n<!-- Settings -->\n<div class=\"row map-settings\" data-ng-show=\"settings\">\n\n  <div class=\"settings col-lg-5 col-lg-offset-7 col-md-6 col-md-offset-6\">\n    <div class=\"panel panel-default\">\n\n      <a class=\"settings-toggle\">\n        <i class=\"fa fa-bars\"></i>\n      </a>\n\n\n      <!-- Body -->\n      <div class=\"panel-body\">\n\n        <p>Map layers</p>\n\n        <div class=\"row margin-top\" data-ng-show=\"!addNewLayer\">\n          <div class=\"col-lg-3 col-md-3 col-sm-4 col-xs-4 text-right\">\n            <label class=\"inline\">Data/Shapes</label>\n          </div>\n          <div class=\"col-lg-9 col-md-9 col-md-8 col-xs-8 col-condensed\">\n            <ul class=\"layer-list list-unstyled sortable-override\" ui-sortable=\"{axis:y, containment: 'parent'}\" data-ng-model=\"layers\" data-ng-show=\"layers.length\">\n              <li class=\"layer-item\" data-ng-repeat=\"layer in layers | orderBy:index:true\" ng-style=\"{'border-right':'5px solid ' + layer.color}\">\n\n                <i\n                tooltip=\"{{layer.enabled ? 'Hide' : 'Show'}}\"\n                tooltip-animation=\"false\"\n                tooltip-append-to-body=\"true\"\n                class=\"fa text-muted\" data-ng-class=\"layer.enabled ? 'fa-eye' : 'fa-eye-slash'\" data-ng-click=\"layer.toggle()\" data-title=\"{{layer.enabled ? 'Hide' : 'Show'}}\" bs-tooltip></i>\n\n                <span style=\"margin-left: 10px\">{{layer.description}}</span>\n                <i\n                  tooltip=\"Delete layer\"\n                  tooltip-animation=\"false\"\n                  tooltip-append-to-body=\"true\"\n                  class=\"fa fa-trash-o pull-right text-danger\" data-container=\"body\" data-title=\"Delete\" bs-tooltip data-ng-click=\"layer.remove();\" style=\"line-height: 1.6\"></i>\n\n                <i\n                tooltip=\"Edit\"\n                tooltip-animation=\"false\"\n                tooltip-append-to-body=\"true\"\n                class=\"fa fa-pencil pull-right margin-right text-primary\" data-container=\"body\" data-title=\"Edit\" bs-tooltip data-ng-click=\"layer.edit();\" style=\"line-height: 1.6\"></i>\n\n              </li>\n            </ul>\n\n            <ul data-ng-show=\"!layers.length\" class=\"list-unstyled sortable-override\">\n              <li class=\"layer-item\">\n                <span class=\"text-muted\">No data layers</span>\n              </li>\n            </ul>\n\n            <a\n            ng-show=\"layers.length\"\n            tooltip=\"Export data layers (svg)\"\n            tooltip-animation=\"false\"\n            tooltip-append-to-body=\"true\"\n            class=\"pull-right small margin-bottom\" ng-click=\"getAndExportSvg()\">\n              Export\n            </a>\n\n          </div>\n        </div>\n\n        <div class=\"row\" data-ng-show=\"!addNewLayer\">\n          <div class=\"col-lg-3 col-md-3 col-sm-4 col-xs-4 text-right\">\n            <label class=\"inline\">Tiles</label>\n          </div>\n          <div class=\"col-lg-9 col-md-9 col-md-8 col-xs-8 col-condensed\">\n            <ul class=\"layer-list list-unstyled sortable-override\" ui-sortable=\"{axis:y, containment: 'parent'}\" data-ng-model=\"tileSets\" data-ng-show=\"tileSets.length\">\n              <li class=\"layer-item\" data-ng-repeat=\"layer in tileSets | orderBy:index\">\n\n                <i tooltip=\"{{layer.enabled ? 'Hide' : 'Show'}}\"\n                tooltip-animation=\"false\"\n                tooltip-append-to-body=\"true\"\n                class=\"fa text-muted\" data-ng-class=\"layer.enabled ? 'fa-eye' : 'fa-eye-slash'\" data-ng-click=\"layer.toggle()\" data-title=\"{{layer.enabled ? 'Hide' : 'Show'}}\" bs-tooltip></i>\n\n                <span style=\"margin-left: 10px\">{{layer.description}}</span>\n                <i\n                tooltip=\"Delete layer\"\n                tooltip-animation=\"false\"\n                tooltip-append-to-body=\"true\"\n                class=\"fa fa-trash-o pull-right\" data-title=\"Delete\" bs-tooltip data-ng-click=\"layer.remove();\" style=\"line-height: 1.6\"></i>\n              </li>\n            </ul>\n            <ul data-ng-show=\"!tileSets.length\" class=\"list-unstyled sortable-override\">\n              <li class=\"layer-item\">\n                <span class=\"text-muted\">No tilesets</span>\n              </li>\n            </ul>\n            <p class=\"help-block\">Sort layers by dragging them</p>\n            <a class=\"btn btn-default pull-right\" data-ng-click=\"addNewLayer=true\"><i class=\"fa fa-file-o text-primary margin-right\"></i>New layer</a>\n\n          </div>\n        </div>\n\n\n        <div class=\"row margin-top\">\n          <div class=\"col-lg-3 col-md-3 col-sm-4 col-xs-4 text-right\">\n          </div>\n          <div class=\"col-lg-9 col-md-9 col-md-8 col-xs-8 col-condensed\">\n\n          </div>\n        </div>\n\n\n\n\n        <!-- Choosing layer -->\n\n        <div class=\"\" data-ng-show=\"addNewLayer\">\n          <div class=\"row margin-top\">\n            <div class=\"col-lg-3 col-md-3 col-sm-4 col-xs-4 text-right\">\n              <label class=\"inline\">Type</label>\n            </div>\n            <div class=\"col-lg-9 col-md-9 col-md-8 col-xs-8 col-condensed\">\n              <ul class=\"nav nav-tabs\" role=\"tablist\" data-ng-init=\"layerType=layerTypes[0]\">\n                <li data-ng-class=\"{'active' : layerType.value =='data'}\"><a ng-click=\"layerType=layerTypes[0]\" role=\"tab\" data-toggle=\"tab\">Data</a></li>\n                <li data-ng-class=\"{'active' : layerType.value =='tiles'}\"><a ng-click=\"layerType=layerTypes[1]\" role=\"tab\" data-toggle=\"tab\">Tiles</a></li>\n                <li data-ng-class=\"{'active' : layerType.value =='geoJSON'}\"><a ng-click=\"layerType=layerTypes[2]\" role=\"tab\" data-toggle=\"tab\">Shapes</a></li>\n              </ul>\n              <span class=\"help-block\">{{layerType.info}}</span>\n            </div>\n          </div>\n\n          <div class=\"row margin-top\">\n            <div class=\"col-lg-3 col-md-3 col-sm-4 col-xs-4 text-right\">\n              <label class=\"inline\">Name</label>\n            </div>\n            <div class=\"col-lg-9 col-md-9 col-md-8 col-xs-8 col-condensed\">\n              <input class=\"form-control\" type=\"text\" ng-model=\"description\" placeholder=\"Layer {{tileSets.length}}\">\n            </div>\n          </div>\n\n\n\n\n        <!-- Tiles -->\n\n        <div class=\"\" data-ng-show=\"layerType.value=='tiles'\">\n\n          <div class=\"row margin-top\">\n            <div class=\"col-lg-3 col-md-3 col-sm-4 col-xs-4 text-right\">\n              <label class=\"inline\">Tiles type</label>\n            </div>\n            <div class=\"col-lg-9 col-md-9 col-md-8 col-xs-8\">\n              <div class=\"row\">\n                <div class=\"col-lg-6 col-md-6 margin-bottom\" style=\"padding-left:0\" data-ng-repeat=\"tile in tilesTypes\" data-ng-click=\"selectTile(tile)\">\n                  <div class=\"layer-img\" style=\"background-image:url({{tile.img}})\" data-ng-class=\"{active:tilesType==tile, 'short-layer-img': tilesType.custom}\">\n                    <span data-ng-class=\"{'text-white':tile.description=='Satellite'}\">{{tile.description}}</span>\n                  </div>\n                </div>\n              </div>\n            </div>\n          </div>\n\n          <div class=\"row\">\n            <div class=\"col-lg-3 col-md-3 col-sm-4 col-xs-4 text-right\">\n            </div>\n            <div class=\"col-lg-9 col-md-9 col-md-8 col-xs-8 col-condensed\">\n              <p class=\"help-block\">{{tilesType.info}}</p>\n            </div>\n          </div>\n\n          <div class=\"row margin-top\" ng-show=\"tilesType && tilesType.custom\">\n            <div class=\"col-lg-3 col-md-3 col-sm-4 col-xs-4 text-right\">\n              <label class=\"inline\">Tileset URL</label>\n            </div>\n            <div class=\"col-lg-9 col-md-9 col-md-8 col-xs-8 col-condensed\">\n              <input type=\"text\" id=\"layerUrl\" ng-model=\"url\" class=\"form-control\" placeholder=\"e.g. http://maps.nypl.org/warper/maps/tile/13529/{z}/{x}/{y}.png\">\n              <span class=\"help-block\">Google/OSM schema tiles, using {x}, {y}, {z}</span>\n            </div>\n          </div>\n\n          <div class=\"row\" ng-show=\"tilesType && tilesType.custom\">\n            <div class=\"col-lg-3 col-md-3 col-sm-4 col-xs-4 text-right\">\n              <label class=\"inline\">WMS URL</label>\n            </div>\n            <div class=\"col-lg-9 col-md-9 col-md-8 col-xs-8 col-condensed\">\n              <input type=\"text\" id=\"layerWmsUrl\" ng-model=\"wmsUrl\" class=\"form-control\" placeholder=\"e.g. http://mesonet.agron.iastate.edu/cgi-bin/wms/nexrad/n0r.cgi\">\n            </div>\n          </div>\n\n          <div class=\"row margin-top\" ng-show=\"tilesType && tilesType.custom\">\n            <div class=\"col-lg-3 col-md-3 col-sm-4 col-xs-4 text-right\">\n              <label class=\"inline\">WMS Layers</label>\n            </div>\n            <div class=\"col-lg-9 col-md-9 col-md-8 col-xs-8 col-condensed\">\n              <input type=\"text\" id=\"layerWmsLayers\" ng-model=\"wmsLayers\" class=\"form-control\" placeholder=\"e.g. nexrad-n0r-900913\">\n            </div>\n          </div>\n\n          <div class=\"row margin-top\" ng-show=\"tilesType && tilesType.custom\">\n            <div class=\"col-lg-3 col-md-3 col-sm-4 col-xs-4 text-right\">\n              <label class=\"inline\">Mapbox ID</label>\n            </div>\n            <div class=\"col-lg-9 col-md-9 col-md-8 col-xs-8 col-condensed\">\n            <input type=\"text\" id=\"layerMbId\" ng-model=\"mbId\" class=\"form-control\" placeholder=\"e.g. examples.map-zr0njcqy\">\n            <span class=\"help-block\">A Mapbox map ID. <a href=\"https://www.mapbox.com/help/define-map-id/\" target=\"_blank\">Click here to learn more</a></span>\n            </div>\n          </div>\n\n\n\n        </div>\n\n\n        <!-- Data -->\n\n        <div class=\"\" data-ng-show=\"layerType.value=='data'\">\n\n          <div class=\"row margin-top\">\n            <div class=\"col-lg-3 col-md-3 col-sm-4 col-xs-4 text-right\">\n              <label class=\"inline\">Map type</label>\n            </div>\n            <div class=\"col-lg-9 col-md-9 col-md-8 col-xs-8\">\n              <div class=\"row\">\n                <div class=\"col-lg-6 col-md-6 margin-bottom\" style=\"padding-left:0\" data-ng-repeat=\"map in mapTypes\" data-ng-click=\"selectMap(map)\">\n                  <div class=\"layer-img\" style=\"background-image:url({{map.img}})\" data-ng-class=\"{active:mapType==map}\">\n                    <span>{{map.description}}</span>\n                  </div>\n                </div>\n              </div>\n            </div>\n          </div>\n\n          <div class=\"row margin-top\" ng-show=\"mapType.value=='points' || mapType.value=='sequence'\">\n            <div class=\"col-lg-3 col-md-3 col-sm-4 col-xs-4 text-right\">\n              <label class=\"inline\">Places</label>\n            </div>\n            <div class=\"col-lg-9 col-md-9 col-md-8 col-xs-8 col-condensed\">\n\n              <ui-select ng-model=\"mapping.sourceCoordinates\" theme=\"selectize\" ng-disabled=\"disabled\">\n                <ui-select-match placeholder=\"Select or search\">\n                  {{$select.selected.description}}\n                  <span class=\"caret\"></span>\n                </ui-select-match>\n                <ui-select-choices repeat=\"field in latlonFields | filter: {description:$select.search}\">\n                  <span ng-bind-html=\"field.description | highlight: $select.search\"></span>\n                </ui-select-choices>\n              </ui-select>\n\n            </div>\n          </div>\n\n          <div class=\"row margin-top\" ng-show=\"mapType.value=='point-to-point'\">\n            <div class=\"col-lg-3 col-md-3 col-sm-4 col-xs-4 text-right\">\n              <label class=\"inline\">Source Places</label>\n            </div>\n            <div class=\"col-lg-9 col-md-9 col-md-8 col-xs-8 col-condensed\">\n\n              <ui-select ng-model=\"mapping.sourceCoordinates\" theme=\"selectize\" ng-disabled=\"disabled\">\n                <ui-select-match placeholder=\"Select or search\">\n                  {{$select.selected.description}}\n                  <span class=\"caret\"></span>\n                </ui-select-match>\n                <ui-select-choices repeat=\"field in latlonFields | filter: {description:$select.search}\">\n                  <span ng-bind-html=\"field.description | highlight: $select.search\"></span>\n                </ui-select-choices>\n              </ui-select>\n\n            </div>\n          </div>\n          <div class=\"row margin-top\" ng-show=\"mapType.value=='point-to-point'\">\n            <div class=\"col-lg-3 col-md-3 col-sm-4 col-xs-4 text-right\">\n              <label class=\"inline\">Target Places</label>\n            </div>\n            <div class=\"col-lg-9 col-md-9 col-md-8 col-xs-8 col-condensed\">\n\n              <ui-select ng-model=\"mapping.destinationCoordinates\" theme=\"selectize\" ng-disabled=\"disabled\">\n                <ui-select-match placeholder=\"Select or search\">\n                  {{$select.selected.description}}\n                  <span class=\"caret\"></span>\n                </ui-select-match>\n                <ui-select-choices repeat=\"field in latlonFields | filter: {description:$select.search}\">\n                  <span ng-bind-html=\"field.description | highlight: $select.search\"></span>\n                </ui-select-choices>\n              </ui-select>\n\n            </div>\n\n          </div>\n\n          <div class=\"row margin-top\">\n            <div class=\"col-lg-3 col-md-3 col-sm-4 col-xs-4 text-right\">\n              <label class=\"inline\">Tooltip label</label>\n            </div>\n            <div class=\"col-lg-9 col-md-9 col-md-8 col-xs-8 col-condensed\">\n              <span class=\"btn btn-default\" ng-click=\"showDescriptionModal()\">\n                  {{descriptiveDim.description || \"Choose\"}}\n                  <span class=\"caret\"></span>\n              </span>\n            </div>\n          </div>\n\n          <div class=\"row margin-top\">\n              <div class=\"col-lg-3 col-md-3 col-sm-4 col-xs-4 text-right\">\n                <label class=\"inline\">Color</label>\n              </div>\n              <div class=\"col-lg-9 col-md-9 col-md-8 col-xs-8 col-condensed\">\n\n                <div class=\"input-group\" ng-init=\"color='#666'\">\n                  <span class=\"input-group-addon\" colorpicker id=\"sizing-addon1\" ng-model=\"color\" ng-style=\"{'background-color':color}\"></span>\n                  <input type=\"text\" colorpicker class=\"form-control\" aria-describedby=\"sizing-addon1\" ng-model=\"color\">\n                </div>\n            </div>\n          </div>\n\n          <div class=\"row margin-top\" ng-show=\"mapType.value=='point-to-point' || mapType.value=='sequence'\">\n            <div class=\"col-lg-3 col-md-3 col-sm-4 col-xs-4 text-right\">\n              <label class=\"inline\">Show links</label>\n            </div>\n            <div class=\"col-lg-9 col-md-9 col-md-8 col-xs-8 col-condensed\">\n                <input type=\"checkbox\" ng-model=\"showLinks\">\n            </div>\n          </div>\n\n          <div class=\"row margin-top\">\n            <div class=\"col-lg-3 col-md-3 col-sm-4 col-xs-4 text-right\">\n              <label class=\"inline\">Size points</label>\n            </div>\n            <div class=\"col-lg-9 col-md-9 col-md-8 col-xs-8 col-condensed\">\n                <input type=\"checkbox\" ng-model=\"pointSize\">\n            </div>\n          </div>\n\n          <div class=\"row margin-top\" data-ng-show=\"pointSize\">\n            <div class=\"col-lg-3 col-md-3 col-sm-4 col-xs-4 text-right \">\n              <label class=\"inline\">According to</label>\n            </div>\n            <div class=\"col-lg-9 col-md-9 col-md-8 col-xs-8 col-condensed\">\n              <span class=\"btn btn-default\" ng-click=\"showAggModal()\">\n                {{getAggDescription(aggDim) || \"Choose\"}}\n                <span class=\"caret\"></span>\n              </span>\n            </div>\n          </div>\n\n        </div>\n\n        <!-- GeoJSON -->\n\n        <div class=\"\" data-ng-show=\"layerType.value=='geoJSON'\">\n\n          <div class=\"row margin-top\">\n            <div class=\"col-lg-3 col-md-3 col-sm-4 col-xs-4 text-right\">\n              <label class=\"inline\">geoJSON</label>\n            </div>\n            <div class=\"col-lg-9 col-md-9 col-md-8 col-xs-8 col-condensed\">\n              <textarea class=\"col-md-8 col-xs-8\" id=\"layerGeoJSON\" ng-model=\"geoJson\" ui-codemirror=\"{ mode : 'javascript', lineNumbers : true, lineWrapping: true }\" placeholder=\"Paste your geoJSON data or drop a file here\" ui-refresh=\"cmRefresh\"></textarea>\n\n              <span class=\"help-block\">Drop geoJSON file or paste geoJSON in the area above</span>\n\n            </div>\n          </div>\n\n          <div class=\"row margin-top\">\n            <div class=\"col-lg-3 col-md-3 col-sm-4 col-xs-4 text-right\">\n              <label class=\"inline\">Color</label>\n            </div>\n            <div class=\"col-lg-9 col-md-9 col-md-8 col-xs-8 col-condensed\">\n\n              <div class=\"input-group\" ng-init=\"color='#666'\">\n                <span class=\"input-group-addon\" colorpicker id=\"sizing-addon1\" ng-model=\"color\" ng-style=\"{'background-color':color}\"></span>\n                <input type=\"text\" colorpicker class=\"form-control\" aria-describedby=\"sizing-addon1\" ng-model=\"color\">\n              </div>\n            </div>\n          </div>\n\n          <div class=\"row margin-top\">\n            <div class=\"col-lg-3 col-md-3 col-sm-4 col-xs-4 text-right\">\n              <label class=\"inline\">Fill shapes</label>\n            </div>\n            <div class=\"col-lg-9 col-md-9 col-md-8 col-xs-8 col-condensed\">\n                <input type=\"checkbox\" ng-model=\"fillShapes\">\n            </div>\n          </div>\n        </div>\n\n        <div class=\"row margin-top\">\n          <div class=\"col-lg-3 col-md-3 col-sm-4 col-xs-4 text-right\">\n          </div>\n          <div class=\"col-lg-9 col-md-9 col-md-8 col-xs-8 col-condensed\">\n            <div class=\"pull-right\">\n              <a class=\"btn btn-default\" data-ng-disabled=\"layerType.value === 'data' && ((!mapping.sourceCoordinates || (mapType.value=='point-to-point' && !mapping.destinationCoordinates)))\" data-ng-click=\"addLayer();addNewLayer=false;\">\n                {{ editingLayer ? 'Apply' : 'Add layer' }}\n              </a>\n              <a class=\"btn btn-default btn-cancel\" data-ng-click=\"addNewLayer=false\">Cancel</a>\n            </div>\n          </div>\n        </div>\n      </div>\n    </div>\n  </div>\n</div>\n\n<div id=\"{{uniqueModalId}}\">\n\t<div id=\"agg-modal\" data-modal dimensions=\"aggDims\" model=\"aggDim\"\n\t\t\tdescription-accessor=\"getAggDescription\"></div>\n\t<div id=\"description-modal\" data-modal dimensions=\"descriptiveDims\" model=\"descriptiveDim\"></div>\n\t<div id=\"layer-modal\" data-layer-modal layers=\"tileSets\"></div>\n</div>\n");
}]);