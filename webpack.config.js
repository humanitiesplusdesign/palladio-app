const path = require("path");

const CopyWebpackPlugin = require("copy-webpack-plugin");
const MiniCssExtractPlugin = require("mini-css-extract-plugin");
const OptimizeCSSAssetsPlugin = require("optimize-css-assets-webpack-plugin");
const TerserJSPlugin = require("terser-webpack-plugin");

const isDev = process.env.NODE_ENV !== "production";

module.exports = {
  mode: "development",
  entry: "./js/app.js",
  output: {
    filename: isDev ? "palladio-app.js" : "palladio-app.min.js",
    path: path.resolve(__dirname, "assets/")
  },
  module: {
    rules: [
      {
        test: /\.css$/,
        use: [MiniCssExtractPlugin.loader, "css-loader"]
      },
      { test: /\.(png|jpg)$/, loader: "file-loader" },
      { test: /\.html$/, use: [{ loader: "ngtemplate-loader?relativeTo=components/" }, { loader: "html-loader" }] }
    ]
  },
  optimization: {
    minimizer: isDev ? [] : [new TerserJSPlugin({}), new OptimizeCSSAssetsPlugin({})]
  },
  plugins: [
    new MiniCssExtractPlugin({ filename: isDev ? "palladio-app.css" : "palladio-app.min.css" }),
    new CopyWebpackPlugin(
      [
        { from: "node_modules/palladio/dist/", to: "palladio" },
        { from: "node_modules/palladio-timeline-component/dist/", to: "palladio-timeline-component" },
        { from: "node_modules/palladio-facet-component/dist/", to: "palladio-facet-component" },
        { from: "node_modules/palladio-timespan-component/dist/", to: "palladio-timespan-component" },
        { from: "node_modules/palladio-graph-component/dist/", to: "palladio-graph-component" },
        { from: "node_modules/palladio-map-component/dist/", to: "palladio-map-component" },
        { from: "node_modules/palladio-table-component/dist/", to: "palladio-table-component" },
        { from: "node_modules/palladio-cards-component/dist/", to: "palladio-cards-component" },
        { from: "node_modules/YASQE/dist/", to: "YASQE" },
        { from: "node_modules/YASR/dist/", to: "YASR" }
      ],
      { copyUnmodified: true }
    )
  ]
};
