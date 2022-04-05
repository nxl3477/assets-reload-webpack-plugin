const { join } = require('path')
const HtmlWebpackPlugin = require('html-webpack-plugin')
const CleanWebpackPlugin = require('clean-webpack-plugin');
const { AssetsReloadWebpackPlugin } = require('../src/index')
const MiniCssExtractPlugin = require('mini-css-extract-plugin');

module.exports = {
  entry: join(__dirname, './test.js'),
  // mode: 'development',
  mode: 'production',
  output: {
    publicPath: "/"
  },

  module: {
    rules: [
      {
        test: /\.css$/,
        use: [
          MiniCssExtractPlugin.loader,
          'css-loader'
        ]
      },
    ]
  },

  plugins: [
    new MiniCssExtractPlugin(),
    new CleanWebpackPlugin(),
    new AssetsReloadWebpackPlugin({
      inject: 'body',
      inlineCore: false,
      inlineAssets: [
        ['https://cdnjs.cloudflare.com/ajax/libs/animate.css/4.1.1/animate.min1.css', 'https://cdnjs.cloudflare.com/ajax/libs/animate.css/4.1.1/animate.min.css'],
        ['https://cdnjs.cloudflare.com/ajax/libs/vue/2.6.11/vue2.js', 'https://cdnjs.cloudflare.com/ajax/libs/vue/2.6.11/vue.js'],
        ['https://cdnjs.cloudflare.com/ajax/libs/vuex/2.5.0/vuex.js', "https://cdnjs.cloudflare.com/ajax/libs/vuex/2.5.0/vuex.js"],
        ['https://cdnjs.cloudflare.com/ajax/libs/vue-router/3.0.7/vue-router.js', "https://cdnjs.cloudflare.com/ajax/libs/vue-router/3.0.7/vue-router.js"]
      ],
      dynamicAssets: {
        animate: ['https://cdnjs.cloudflare.com/ajax/libs/animate.css/4.1.1/animate.min222.css', 'https://cdnjs.cloudflare.com/ajax/libs/animate.css/4.1.1/animate.min.css'],
        vue: ['https://cdnjs.cloudflare.com/ajax/libs/vue/2.6.11/vue2.js', 'https://cdnjs.cloudflare.com/ajax/libs/vue/2.6.11/vue.js'],
        vuex: ['https://cdnjs.cloudflare.com/ajax/libs/vuex/2.5.0/vuex.js', "https://cdnjs.cloudflare.com/ajax/libs/vuex/2.5.0/vuex.js"],
        vueRouter: ['https://cdnjs.cloudflare.com/ajax/libs/vue-router/3.0.7/vue-router.js', "https://cdnjs.cloudflare.com/ajax/libs/vue-router/3.0.7/vue-router.js"]
      },
      chunkAssetsPublicpath: [ 'https://www.baidu.com/', 'https://www.jianshu.com/', 'http://127.0.0.1:8080/' ],
      chunkAssetsRetryDelay: function(times) {
        return times * 1000
      },
      maxChunkAssetsRetries: 4
    }),

    new HtmlWebpackPlugin({
      filename: 'index.html',
      template: join(__dirname, './index.html')
    })
  ]
}