const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const CopyWebpackPlugin = require('copy-webpack-plugin');
const ExtReloader = require('webpack-ext-reloader');

module.exports = (env, argv) => {
  const isDev = argv.mode === 'development';

  const plugins = [
    new HtmlWebpackPlugin({
      template: './popup/popup.html',
      filename: 'popup/popup.html',
      chunks: ['popup/popup']
    }),
    new CopyWebpackPlugin({
      patterns: [
        { from: 'manifest.json', to: 'manifest.json' },
        { from: 'icons', to: 'icons', noErrorOnMissing: true }
      ]
    })
  ];

  // Add hot reloader only in development mode
  if (isDev) {
    plugins.push(
      new ExtReloader({
        port: 9090,
        reloadPage: true,
        entries: {
          contentScript: 'content/content',
          background: 'background/service-worker',
          extensionPage: 'popup/popup'
        }
      })
    );
  }

  return {
    entry: {
      'popup/popup': './popup/popup.tsx',
      'background/service-worker': './background/service-worker.ts',
      'content/content': './content/content.ts'
    },
    output: {
      path: path.resolve(__dirname, 'dist'),
      filename: '[name].js',
      clean: true
    },
    module: {
      rules: [
        {
          test: /\.tsx?$/,
          use: 'ts-loader',
          exclude: /node_modules/
        },
        {
          test: /\.css$/,
          use: ['style-loader', 'css-loader']
        }
      ]
    },
    resolve: {
      extensions: ['.tsx', '.ts', '.js', '.jsx']
    },
    plugins,
    optimization: {
      splitChunks: false
    },
    // Better source maps for development
    devtool: isDev ? 'inline-source-map' : false
  };
};
