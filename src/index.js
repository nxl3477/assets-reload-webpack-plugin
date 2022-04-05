const webpack = require('webpack')
const lodash = require('lodash')
const path = require('path')
const SingleEntryPlugin = require("webpack/lib/SingleEntryPlugin");
const virtualFilesystem = require('./lib/virtual-file-system');
const { minify } = require("terser");
const { RawSource } = webpack.sources || require('webpack-sources');
const prettier = require('prettier');
const pluginName = 'AssetsReloadWebpackPlugin'
const PLUGIN_CORE_FILE = 'assets_reload_webpack_plugin_core'
const PLUGIN_CORE_FILE_EXT = `${PLUGIN_CORE_FILE}.js`

class AssetsReloadWebpackPlugin {
  
  constructor({ 
    inject = 'head', 
    inlineCore = true, 
    inlineAssets = [], 
    inlineAssetsGlobalVariable = '__CDN_RELOAD__', 
    dynamicAssets, 
    dynamicAssetsGlobalVariable = '$cdn', 
    chunkAssetsReloadQueryValue, 
    chunkAssetsPublicpath = [], 
    maxChunkAssetsRetries = 3, 
    chunkAssetsRetryDelay = 3000 
  }) {
    if( !['head', 'body'].includes(inject) ) {
      return console.error('Use head or body as inject parameters')
    }
    
    this.inject = inject
    // 插件逻辑是否内联至 html 文件中
    this.inlineCore = inlineCore
    this.inlineAssets = inlineAssets
    this.inlineAssetsGlobalVariable = inlineAssetsGlobalVariable
    this.dynamicAssets = dynamicAssets
    // 异步cdn加载方法变量名
    this.dynamicAssetsGlobalVariable = dynamicAssetsGlobalVariable
    this.chunkAssetsPublicpath = chunkAssetsPublicpath
    this.maxChunkAssetsRetries = maxChunkAssetsRetries
    this.chunkAssetsReloadQueryValue = chunkAssetsReloadQueryValue || function (url, times) {
      if( times === 0 ) {
        return url
      }
      if( url.indexOf('?') === -1 ) {
        return url + '?reload=' + times
      }else {
        return url + '&reload=' + times
      }
    }

    if( typeof chunkAssetsRetryDelay === 'function' ) {
      const chunkRetryDelayStr = chunkAssetsRetryDelay.toString()
      if( chunkRetryDelayStr.indexOf('function') === -1) {
        throw Error('chunkAssetsRetryDelay needs to be declared using the function field, for example: \n chunkAssetsRetryDelay: function () { \n  }')
      }
      this.chunkAssetsRetryDelay = chunkRetryDelayStr
    }else {
      this.chunkAssetsRetryDelay = chunkAssetsRetryDelay
    }
  }


  apply(compiler) {
    const { inlineAssets, inlineAssetsGlobalVariable, dynamicAssets,  dynamicAssetsGlobalVariable } = this
    let coreJsContent = ``
    
    if( inlineAssets && inlineAssets.length > 0 ) {
      const inlineAssetsBackup = inlineAssets.map(_url => _url.slice(1))
      const inlineAssetsGlobalFnName = JSON.stringify(inlineAssetsGlobalVariable)
      coreJsContent += `
        window[${inlineAssetsGlobalFnName}] = (function () {
          var cdnAssetsList = ${JSON.stringify(inlineAssetsBackup)}
          var cdnReloadTimesMap = {};

          return function (domTarget, cdnIndex) {
            var tagName = domTarget.tagName.toLowerCase()
            var getTimes = cdnReloadTimesMap[cdnIndex] === undefined ? ( cdnReloadTimesMap[cdnIndex] = 0 ) : cdnReloadTimesMap[cdnIndex]
            var useCdnUrl = cdnAssetsList[cdnIndex][getTimes++]
            cdnReloadTimesMap[cdnIndex] = getTimes
            if( !useCdnUrl ) {
              return
            }
            if( tagName === 'script' ) {
              var scriptText = '<scr' + 'ipt type=\"text/javascript\" src=\"' + useCdnUrl + '\" onerror=\"${inlineAssetsGlobalFnName}(this, ' + cdnIndex + ')\" ></scr' + 'ipt>'
              document.write(scriptText)
            }
            else if( tagName === 'link' ) {
              var newLink = domTarget.cloneNode()
              newLink.href = useCdnUrl
              domTarget.parentNode.insertBefore(newLink, domTarget)
            }
          }
        })();
      `
    }

    if( this.dynamicAssets) {
      coreJsContent += `
        window[${JSON.stringify( dynamicAssetsGlobalVariable)}] = (function () {
          var head = document.getElementsByTagName('head')[0]
          var cdnAssetsList =  ${JSON.stringify(dynamicAssets)}
          var loadTimesMap = {}
          var cdnCache = {}

          function loaderScript (src, options, successCallBack, errorCallback) {
            var $script = document.createElement('script')
            for (var key in options) {
              $script[key] = options[key]
            }
            $script['crossorigin'] = 'anonymous'
            $script.onload = successCallBack
            $script.onerror = errorCallback
            $script.src = src
            ;(document.body || document.head).appendChild($script)
            return $script
          }

          function loaderCss (src, options, successCallBack, errorCallback) {
            var $link = document.createElement('link')
            for (var key in options) {
              $script[key] = options[key]
            }
            $link.onload = successCallBack
            $link.onerror = errorCallback
            $link.href = src
            $link.rel = 'stylesheet'
            $link.type = 'text/css'
            ;(head || document.head || document.body).appendChild($link)
            return $link
          }

          function removeScript (element) {
            (document.body || document.head).removeChild(element)
          }

          function removeCss (element) {
            (head || document.head || document.body).removeChild(element)
          }

          function mount (cdnName) {
            var options, successCallBack, errorCallback;
            var mountArguments = arguments

            if( typeof arguments[1] === 'object' ) {
              options = arguments[1]
              successCallBack = arguments[2] || function(){}
              errorCallback = arguments[3] || function(){}
            } else {
              successCallBack = arguments[1] || function(){}
              errorCallback = arguments[2] || function(){}
            }

            options = options || {}

            // 获取cdn队列
            var cdnUrlList = cdnAssetsList[cdnName] 
            var getTimes = loadTimesMap[cdnName] === undefined ? ( loadTimesMap[cdnName] = 0 ) : loadTimesMap[cdnName]
            if( !cdnUrlList || cdnUrlList[getTimes] === undefined ) {
              errorCallback && errorCallback.call(null, loadTimesMap[cdnName])
              return 
            }
            var cdnUrl = cdnUrlList[getTimes]

            if ( cdnCache[cdnName] ) {
              successCallBack && successCallBack.apply(cdnCache[cdnName], arguments)
              return 
            }

            var successCallBackWrapper = function () {
              cdnCache[cdnName] = this
              successCallBack && successCallBack.apply(this, arguments)
            }

            if( /\\.js$/.test(cdnUrl) ) {
              loaderScript( cdnUrl, options, successCallBackWrapper, function() {
                removeScript(this)
                loadTimesMap[cdnName]++
                mount.apply(null, mountArguments)
              })
            }

            else if( /\\.css$/.test(cdnUrl) ) {
              loaderCss( cdnUrl, options, successCallBackWrapper, function() {
                removeCss(this)
                loadTimesMap[cdnName]++
                mount.apply(null, mountArguments)
              })
            }
          }

          function destroy (cdnName, successCallback, errorCallback) {
            var successCallback = successCallback || function(){}
            var errorCallback = errorCallback || function(){}
            if( cdnCache[cdnName] ) {
              var cdnUrlList = cdnAssetsList[cdnName] 
              var getTimes = loadTimesMap[cdnName] === undefined ? ( loadTimesMap[cdnName] = 0 ) : loadTimesMap[cdnName]
              if( !cdnUrlList || cdnUrlList[getTimes] === undefined ) {
                errorCallback && errorCallback.call(null)
                return
              }
              var cdnUrl = cdnUrlList[getTimes]

              function catchError(callback) {
                try {
                  callback.call(null)
                  cdnCache[cdnName] = undefined
                  successCallback.call(cdnCache[cdnName])
                } catch(e) {
                  errorCallback.call(null, e)
                }
              }

              if( /\\.js$/.test(cdnUrl) ) {
                catchError(function () {
                  removeScript(cdnCache[cdnName])
                })
              }
              else if( /\\.css$/.test(cdnUrl) ) {
                catchError(function () {
                  removeCss(cdnCache[cdnName])
                })
              }
            }else {
              errorCallback.call(null)
            }
          }

          function get (cdnName) {
            return cdnCache[cdnName]
          }

          return {
            get,
            mount,
            destroy
          }
        })();
      `
    }
  
    compiler.hooks.emit.tap( pluginName, (compilation) => {
      Object.keys(compilation.assets).forEach(assetsKey => {
        if( assetsKey.indexOf(PLUGIN_CORE_FILE) > -1 ) {
          compilation.assets[assetsKey] = new RawSource(coreJsContent)
        }
      })
    })
    // 注入html
    compiler.hooks.make.tapAsync( pluginName, async ( compilation, callback ) => {
      
      compilation.hooks.htmlWebpackPluginAlterAssetTags.tap(pluginName, (pluginArgs ) => {
        const injectScripts = []
        let inejctTarget
        if ( this.inject === 'head' ) {
          inejctTarget = pluginArgs.head
        }
        else if ( this.inject === 'body' ) {
          inejctTarget = pluginArgs.body
        }

        if( this.inlineCore ) {
          injectScripts.push({
            tagName: 'script',
            closeTag: true,
            innerHTML: coreJsContent,
            attributes: {
              type: 'text/javascript'
            }
          })
        } else {
          let cdnScript;
          let coreScriptIndex = pluginArgs.head.findIndex(s => s.tagName === 'script' && s.attributes && s.attributes.src.indexOf(PLUGIN_CORE_FILE) > -1)
  
          if( coreScriptIndex > -1 ) {
            cdnScript = pluginArgs.head[coreScriptIndex]
            pluginArgs.head.splice(coreScriptIndex, 1)
            injectScripts.push(cdnScript)
          }else {
            coreScriptIndex = pluginArgs.body.findIndex(s => s.tagName === 'script' && s.attributes && s.attributes.src.indexOf(PLUGIN_CORE_FILE) > -1)
            if( coreScriptIndex > -1 ) {
              cdnScript = pluginArgs.body[coreScriptIndex]
              pluginArgs.body.splice(coreScriptIndex, 1)
              injectScripts.push(cdnScript)
            }
          }
        }

        inlineAssets && inlineAssets.forEach((_url, cdnIndex) => {
          if( /\.js$/.test(_url[0]) ) {
            injectScripts.push({
              tagName: 'script',
              closeTag: true,
              attributes: {
                type: 'text/javascript',
                src: _url[0],
                onerror: `__CDN_RELOAD__(this, ${cdnIndex})`
              }
            })
          }   
          else if( /\.css$/.test(_url[0]) ) {
            injectScripts.push({
              tagName: "link",
              selfClosingTag: false,
              voidTag: true,
              attributes: {
                href: _url[0],
                rel: "stylesheet",
                onerror: `__CDN_RELOAD__(this, ${cdnIndex})`
              }
            })
          }
        })

        inejctTarget.unshift(...injectScripts)
      })

      // const minifyCoreJsContent = await minify(coreJsContent)
      // coreJsContent = minifyCoreJsContent.code

      // 需要内联
      if( !this.inlineCore ) {
        virtualFilesystem({
          fs: compilation.inputFileSystem,
          modulePath: path.join(__dirname, PLUGIN_CORE_FILE_EXT),
          contents: coreJsContent
        });

        const name = PLUGIN_CORE_FILE
        const dep = SingleEntryPlugin.createDependency(path.join(__dirname, PLUGIN_CORE_FILE_EXT), name);
        compilation.addEntry(undefined, dep, name, callback);
      } else {
        callback()
      }
    })

    // 以下是正常处理资源重载
    compiler.hooks.compilation.tap(pluginName, compilation => {
      const { Template } = webpack;
      const { mainTemplate } = compilation;


      // 修改启动部分模版
      mainTemplate.hooks.bootstrap.tap(pluginName, source => {
        if (!source) {
          return;
        }
        return Template.asString([
          source,
          `var originPublicPath;`,
          `var __webpack_url_format__ = ${this.chunkAssetsReloadQueryValue.toString()}`
        ]);
      });

      // 修改入参
      mainTemplate.hooks.requireExtensions.tap(pluginName, source => {
        return source.replace(
          "function requireEnsure(chunkId) {",
          "function requireEnsure(chunkId, times) {"
        );
      });
      // 修改加载函数 __webpack_require__.e 外部调用
      mainTemplate.hooks.beforeStartup.tap(
        pluginName,
        (source, chunk, hash) => {
          if (!source) {
            return;
          }
          var newRequireEnsure = `
          function newRequireEnsure (chunkId, options) {
            var url = jsonpScriptSrc(chunkId)
            var matched = url.match(/\.([0-9a-z]+)(?:[\?#]|$)/i)
            var type = matched[1] || 'js'
            if (options === undefined) {
              options = {};
            }
            var times = options[type] !== undefined ? ++options[type] : (options[type] = 0);
            __webpack_require__.p = getPublicPath(times)

            if( times === 0 ) {
              return __webpack_require__.oldE(chunkId, times).then(function () {}, function (err) {
                console.error(err);
                if (times < ${this.maxChunkAssetsRetries}) { 
                  return newRequireEnsure(chunkId, options);
                }
              })
            } else {
              var delayTime = typeof getRetryDelay === 'function' ? getRetryDelay(times) : getRetryDelay              
              return sleep(delayTime).then(function () {
                return __webpack_require__.oldE(chunkId, times).then(function () {}, function (err) {
                  console.error(err);
                  if (times < ${this.maxChunkAssetsRetries}) {
                    return newRequireEnsure(chunkId, options);
                  }
                })
              })
            }
          }`;

          const resSource = Template.asString([
            source,
            "__webpack_require__.oldE = __webpack_require__.e;",
            "originPublicPath = __webpack_require__.p",
            `var chunkPublicpath = ${JSON.stringify(this.chunkAssetsPublicpath)};`,
            `var publicPathpathFull = [ originPublicPath ].concat(chunkPublicpath);`,
            `function getPublicPath(times) {
              return publicPathpathFull[ Math.min(publicPathpathFull.length - 1, times) ];
            }`,
            `var sleep = function (delay) {
              return new Promise(function(resolve, reject) {
                setTimeout(resolve, delay)
              })
            }
            `,
            `var getRetryDelay = ${this.chunkAssetsRetryDelay};`,
            `__webpack_require__.e = ${newRequireEnsure}`
          ]);

          
          return prettier.format(resSource, {
            singleQuote: true,
            parser: 'babel'
          })
        }
      )

      // 修改加载函数 __webpack_require__.e 内部
      mainTemplate.hooks.requireEnsure.tap(
        pluginName,
        (source, chunk, hash) => {
          const cssHackReplace = "linkTag.href = fullhref;";

          source = source.replace(
            cssHackReplace,
            Template.asString([
              `linkTag.href = __webpack_url_format__(fullhref, times)`,
            ])
          );
          const jsHackReplace = "script.src = jsonpScriptSrc(chunkId);";
          source = source.replace(
            jsHackReplace,
            Template.asString([
              `var newSrc = jsonpScriptSrc(chunkId);`,
              `script.src = __webpack_url_format__(newSrc, times)`
            ])
          );
          return source;
        }
      );
      
    })
  }
}

module.exports = {
  AssetsReloadWebpackPlugin
}


