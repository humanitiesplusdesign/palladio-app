/******/ (function(modules) { // webpackBootstrap
/******/ 	// The module cache
/******/ 	var installedModules = {};
/******/
/******/ 	// The require function
/******/ 	function __webpack_require__(moduleId) {
/******/
/******/ 		// Check if module is in cache
/******/ 		if(installedModules[moduleId]) {
/******/ 			return installedModules[moduleId].exports;
/******/ 		}
/******/ 		// Create a new module (and put it into the cache)
/******/ 		var module = installedModules[moduleId] = {
/******/ 			i: moduleId,
/******/ 			l: false,
/******/ 			exports: {}
/******/ 		};
/******/
/******/ 		// Execute the module function
/******/ 		modules[moduleId].call(module.exports, module, module.exports, __webpack_require__);
/******/
/******/ 		// Flag the module as loaded
/******/ 		module.l = true;
/******/
/******/ 		// Return the exports of the module
/******/ 		return module.exports;
/******/ 	}
/******/
/******/
/******/ 	// expose the modules object (__webpack_modules__)
/******/ 	__webpack_require__.m = modules;
/******/
/******/ 	// expose the module cache
/******/ 	__webpack_require__.c = installedModules;
/******/
/******/ 	// define getter function for harmony exports
/******/ 	__webpack_require__.d = function(exports, name, getter) {
/******/ 		if(!__webpack_require__.o(exports, name)) {
/******/ 			Object.defineProperty(exports, name, { enumerable: true, get: getter });
/******/ 		}
/******/ 	};
/******/
/******/ 	// define __esModule on exports
/******/ 	__webpack_require__.r = function(exports) {
/******/ 		if(typeof Symbol !== 'undefined' && Symbol.toStringTag) {
/******/ 			Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });
/******/ 		}
/******/ 		Object.defineProperty(exports, '__esModule', { value: true });
/******/ 	};
/******/
/******/ 	// create a fake namespace object
/******/ 	// mode & 1: value is a module id, require it
/******/ 	// mode & 2: merge all properties of value into the ns
/******/ 	// mode & 4: return value when already ns object
/******/ 	// mode & 8|1: behave like require
/******/ 	__webpack_require__.t = function(value, mode) {
/******/ 		if(mode & 1) value = __webpack_require__(value);
/******/ 		if(mode & 8) return value;
/******/ 		if((mode & 4) && typeof value === 'object' && value && value.__esModule) return value;
/******/ 		var ns = Object.create(null);
/******/ 		__webpack_require__.r(ns);
/******/ 		Object.defineProperty(ns, 'default', { enumerable: true, value: value });
/******/ 		if(mode & 2 && typeof value != 'string') for(var key in value) __webpack_require__.d(ns, key, function(key) { return value[key]; }.bind(null, key));
/******/ 		return ns;
/******/ 	};
/******/
/******/ 	// getDefaultExport function for compatibility with non-harmony modules
/******/ 	__webpack_require__.n = function(module) {
/******/ 		var getter = module && module.__esModule ?
/******/ 			function getDefault() { return module['default']; } :
/******/ 			function getModuleExports() { return module; };
/******/ 		__webpack_require__.d(getter, 'a', getter);
/******/ 		return getter;
/******/ 	};
/******/
/******/ 	// Object.prototype.hasOwnProperty.call
/******/ 	__webpack_require__.o = function(object, property) { return Object.prototype.hasOwnProperty.call(object, property); };
/******/
/******/ 	// __webpack_public_path__
/******/ 	__webpack_require__.p = "";
/******/
/******/
/******/ 	// Load entry module and return exports
/******/ 	return __webpack_require__(__webpack_require__.s = "./js/app.js");
/******/ })
/************************************************************************/
/******/ ({

/***/ "./js/app.js":
/*!*******************!*\
  !*** ./js/app.js ***!
  \*******************/
/*! no static exports found */
/***/ (function(module, exports) {

eval("var app = angular.module('palladioApp', [\n\t'palladio',\n\t'palladio.controllers',\n\t'palladio.services',\n\t'palladio.directives',\n\t'palladio.filters',\n\t\n\t'palladioApp.directives.files',\n\t'palladioApp.directives.file',\n\t'palladioApp.directives.refine',\n\t'palladioApp.directives.yasgui',\n\n\t'ui.codemirror',\n\t'ui.bootstrap',\n\t'ui.router',\n\t'ui.sortable',\n\t'ui.select',\n\t'colorpicker.module',\n\n\t'palladioDataUpload',\n\t'palladioDataDownload',\n\n\t// Palette\n\t'palladioPalette',\n\n\t// Filters\n  'palladioTimelineComponent',\n\t'palladioFacetComponent',\n\t'palladioTimespanComponent',\n\t// Views\n\t'palladioCardsComponent',\n\t'palladioMapComponent',\n\t'palladioTableComponent',\n\t'palladioSelectionView',\n\t'palladioGraphComponent',\n\t'palladioDurationView']\n\t)\n\t.config(function($stateProvider, $urlRouterProvider) {\n\n\t\t$urlRouterProvider.otherwise(\"/upload\");\n\n\t\t$stateProvider\n\t\t\t// .state('/', {\n\t\t\t// \turl: '/',\n\t\t\t// \ttemplateUrl: 'html/start.html',\n\t\t\t// })\n\t\t\t.state('/upload', {\n\t\t\t\turl: '/upload',\n\t\t\t\ttemplateUrl: 'html/upload.html',\n\t\t\t\tcontroller: 'UploadRefineCtrl'\n\t\t\t})\n\t\t\t// .state('/link', {\n\t\t\t// \turl: '/link',\n\t\t\t// \ttemplateUrl: 'html/link.html'\n\t\t\t// })\n\t\t\t.state('/visualization', {\n\t\t\t\turl: '/visualization',\n\t\t\t\ttemplateUrl: 'html/visualization.html',\n\t\t\t\tcontroller: 'VisualizationCtrl',\n\t\t\t\tresolve: {\n\t\t\t\t\tdata: function (dataService) {\n\t\t\t\t\t\treturn dataService.getData();\n\t\t\t\t\t}\n\t\t\t\t}\n\t\t\t});\n\t});\n\n\n//# sourceURL=webpack:///./js/app.js?");

/***/ })

/******/ });