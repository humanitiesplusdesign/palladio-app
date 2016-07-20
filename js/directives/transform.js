angular.module('palladioApp.directives.transform', [
	'palladio.services'])
	.directive('transformDirective', function (transformService) {
		var directiveDefObj = {
			templateUrl: 'html/transform.html',
      require: '^filesDirective',
			link: function (scope, element, attrs, filesDirectiveCtrl) {

        scope.filesCtrl = filesDirectiveCtrl;
        scope.transformTypes = [
          { id: 'split',
            label: 'Split',
            description: 'Split a value based on a delimter.',
            template: {
              sourceKeysDescriptions: ["Dimension to split"],
              targetKeysDescriptions: [
                "Dimension key for first result",
                "Dimension key for second result" ],
              parameters: [
                {
                  key: 'delimiter',
                  description: 'Delimiter',
                  defaultValue: ','
                }
              ]
            }
          },
          { id: 'join',
            label: 'Join',
            description: 'Join 2 values with an optional delimiter.',
            template: {
              sourceKeysDescriptions: [
                "First dimension to join",
                "Second dimension to join" ],
              targetKeysDescriptions: [
                "Dimension key for join result" ],
              parameters: [
                {
                  key: 'delimiter',
                  description: 'Delimiter',
                  defaultValue: ''
                }
              ]
            }
          }
        ]

        scope.sourceKeys = [];
        scope.targetKeys = [];
        scope.parameterValues = [];

        scope.selectTransform = function() {
          if(scope.transform.type) {
            scope.transformTemplate = scope.transformTypes.filter(function(d) {
              return d.id === scope.transform.type;
            })[0].template;
          } else {
            scope.transformTemplate = {};
          }
        }

        scope.transform = {};
        scope.transformTemplate = {};

        scope.addTransform = function() {
          var file = scope.filesCtrl.selectedFile();
          if(!file.transforms) file.transforms = [];
          file.transforms.push({
            type: scope.transform.type,
            sourceKeys: scope.sourceKeys,
            targetKeys: scope.targetKeys,
            parameters: scope.transformTemplate.parameters.map(function(p, i) {
              console.log(scope.parameterValues[i]);
              return {
                key: p.key,
                value: scope.parameterValues[i] ? scope.parameterValues[i] : p.defaultValue
              };
            })
          })
          transformService(file);
          scope.clearFields();
        }

        scope.clearFields = function() {
          scope.sourceKeys = [];
          scope.targetKeys = [];
          scope.parameterValues = [];
          scope.transform = {};
          scope.transformTemplate = {};
        }

				function updatePosition(){

					var width = $(window).width();
					var w = width/2-400;
					$('.refine-selected').css("left",w+"px");
					$('.refine-selected').css("height","initial");
					$('.refine-selected').css("max-height",$(window).height()-120+"px");
					if($('.refine-selected').height() > $(window).height()-120) {
						$('.refine-selected').css("height",$(window).height()-120+"px");
					}
				}

				$(window).resize(updatePosition);
				$(window).ready(updatePosition);

			}
		};

		return directiveDefObj;
	});
