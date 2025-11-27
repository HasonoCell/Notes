# Webpack 常用配置一览
```javascript
module.exports = {
  // 打包入口
  entry: './path/to/my/entry/file.js',

  // 构建产物
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'my-first-webpack.bundle.js',
  },

  // Loader
  // test 属性，识别出哪些文件会被转换。
  // use 属性，定义出在进行转换时，应该使用哪个 loader。
  module: {
    rules: [
      { test: /\.css$/, use: 'css-loader' },
      { test: /\.ts$/, use: 'ts-loader' },
    ],
  },

  // Plugin
  plugins: [new HtmlWebpackPlugin({ template: './src/index.html' })],
};
```

# 常见问题
## 为什么 Webpack 需要 Loader？
<font style="color:rgb(43, 58, 66);">Webpack </font>**<font style="color:rgb(43, 58, 66);">只能理解</font>**<font style="color:rgb(43, 58, 66);"> JavaScript 和 JSON 文件。而 </font>**<font style="color:rgb(43, 58, 66);">Loader</font>**<font style="color:rgb(43, 58, 66);"> 让 Webpack 能够去处理其他类型的文件，并将它们转换为有效 </font>[<font style="color:rgb(26, 107, 172);">模块</font>](https://webpack.docschina.org/concepts/modules)<font style="color:rgb(43, 58, 66);">，以供应用程序使用，以及被添加到依赖图中。</font>

**<font style="color:rgb(43, 58, 66);">loader 从右到左（或从下到上）地执行。</font>**<font style="color:rgb(43, 58, 66);">比如上述的代码例子中，先执行了</font>`<font style="color:rgb(43, 58, 66);">ts-loader</font>`<font style="color:rgb(43, 58, 66);">，再执行</font>`<font style="color:rgb(43, 58, 66);">css-loader</font>`<font style="color:rgb(43, 58, 66);">。</font>

## <font style="color:rgb(43, 58, 66);">Loader 和 Plugin 有什么区别？</font>
Loader：用来处理非 JS 和 JSON 文件的加载，即**资源的转换。**

Plugin：用来解决 Loader 无法实现的其他事，即**能力的扩展。**

![](https://cdn.nlark.com/yuque/0/2025/webp/53866714/1756024142879-1991f2e2-ff37-4d7f-bab0-dc2e3b0cfc3e.webp)

## 常见的 Plugin 和 Loader
Loader：

![](https://cdn.nlark.com/yuque/0/2025/webp/53866714/1756024238933-f91bb76e-b0f1-4783-9bcb-9a9be6795ef0.webp)Plugin：

![](https://cdn.nlark.com/yuque/0/2025/webp/53866714/1756024252787-e0d89dff-ce27-4ab8-ae2c-abbddb8e3e93.webp)

## Webpack 的 mode 有什么用？
```javascript
// ...existing code...
export default {
  // ...其他配置...
  mode: 'development', // 或 'production'
  // ...existing code...
};
```

设置 `mode` 是为了让 webpack 根据你的需求自动优化构建过程，主要作用如下：

1. **自动优化**
+ `production`：自动压缩代码、去除无用代码、优化性能，适合上线环境。
+ `development`：保留源码、生成 source map、构建速度快，适合本地开发和调试。
2. **默认行为**  
不同模式下，webpack 会自动启用或关闭一些插件和功能，无需手动配置。
3. **消除警告**  
不设置 `mode`，webpack 会警告并默认用 `production`。

相比之下，Vite 简化了 `mode` 的设置流程，Vite 会根据你运行的命令自动区分开发和生产环境：

+ 运行 `vite` 或 `vite dev` 时，自动进入开发模式。
+ 运行 `vite build` 时，自动进入生产模式。

Vite 会自动切换相关优化和行为，开发者无需手动设置 `mode`，只需关注命令本身。这也是 Vite 设计上的“约定优于配置”，让开发体验更简单直接，而 Webpack 需要显式设置 `mode`，以便区分不同环境的构建策略。

## Webpack 如何去优化代码分离？
三种方式，分别是：

**<font style="color:rgb(43, 58, 66);">入口起点</font>**<font style="color:rgb(43, 58, 66);">：使用 </font>[<font style="color:rgb(26, 107, 172);">entry</font>](https://webpack.docschina.org/configuration/entry-context)<font style="color:rgb(43, 58, 66);"> 配置手动地分离代码。</font>

```javascript
const path = require('path');

module.exports = {
  mode: 'development',
  entry: {
    index: './src/index.js',
    another: './src/another-module.js',
  },
  output: {
    filename: '[name].bundle.js',
    path: path.resolve(__dirname, 'dist'),
  },
};
```

这样就手动实现了 index.js 和 another-module.js 的代码分离，缺点是<font style="color:#DF2A3F;">不够灵活，只是机械地根据文件的不同去分离代码，并没防止不同文件中重复的代码部分被打包（比如两个文件都引入了 lodash，这个库会被重复地打包）</font>

<font style="color:#DF2A3F;"></font>

**<font style="color:rgb(43, 58, 66);">防止重复</font>**<font style="color:rgb(43, 58, 66);">：使用 </font>[<font style="color:rgb(26, 107, 172);">入口依赖</font>](https://webpack.docschina.org/configuration/entry-context/#dependencies)<font style="color:rgb(43, 58, 66);"> 或者 </font>[<font style="color:rgb(26, 107, 172);">SplitChunksPlugin</font>](https://webpack.docschina.org/plugins/split-chunks-plugin)<font style="color:rgb(43, 58, 66);"> 去重和分离 chunk</font><font style="color:rgb(43, 58, 66);">。</font>

+ <font style="color:rgb(43, 58, 66);">入口依赖：</font><font style="color:rgb(43, 58, 66);">在配置文件中配置 </font>[<font style="color:rgb(26, 107, 172);">dependOn</font>](https://webpack.docschina.org/configuration/entry-context/#dependencies)<font style="color:rgb(43, 58, 66);"> 选项，以在多个 chunk 之间共享模块（比如 lodash）如果想要在一个 HTML 页面上使用多个入口起点，还需设置 </font>`<font style="color:rgb(43, 58, 66);background-color:rgba(70, 94, 105, 0.05);">optimization.runtimeChunk: 'single'</font>`<font style="color:rgb(43, 58, 66);">，否则会遇到 </font>[<font style="color:rgb(26, 107, 172);">此处</font>](https://bundlers.tooling.report/code-splitting/multi-entry/)<font style="color:rgb(43, 58, 66);"> 所述的麻烦。</font>

```javascript
const path = require('path');

module.exports = {
  mode: 'development',
  entry: {
    index: {
      import: './src/index.js',
      dependOn: 'shared',
    },
    another: {
      import: './src/another-module.js',
      dependOn: 'shared',
    },
    shared: 'lodash',
  },
  output: {
    filename: '[name].bundle.js',
    path: path.resolve(__dirname, 'dist'),
  },
  optimization: {
    runtimeChunk: 'single',
  },
};
```

+ SplitChunksPlugin：一个内置的 Webpack 插件，所以不用像普通的插件一样在 plugins 数组中调用。此<font style="color:rgb(43, 58, 66);">插件可以将公共的依赖模块提取到已有的入口 chunk 中，或者提取到一个新生成的 chunk。</font>

```javascript
const path = require('path');

module.exports = {
  mode: 'development',
  entry: {
    index: './src/index.js',
    another: './src/another-module.js',
  },
  output: {
    filename: '[name].bundle.js',
    path: path.resolve(__dirname, 'dist'),
  },
  // 使用插件
  optimization: {
    splitChunks: {
      chunks: 'all',
    },
  },
};
```

<font style="color:rgb(43, 58, 66);">使用 </font>[<font style="color:rgb(26, 107, 172);">optimization.splitChunks</font>](https://webpack.docschina.org/plugins/split-chunks-plugin/#optimizationsplitchunks)<font style="color:rgb(43, 58, 66);"> 配置选项后构建，将会发现 </font>`<font style="color:rgb(43, 58, 66);background-color:rgba(70, 94, 105, 0.05);">index.bundle.js</font>`<font style="color:rgb(43, 58, 66);"> 和 </font>`<font style="color:rgb(43, 58, 66);background-color:rgba(70, 94, 105, 0.05);">another.bundle.js</font>`<font style="color:rgb(43, 58, 66);"> 已经移除了重复的依赖模块。从插件将 </font>`<font style="color:rgb(43, 58, 66);background-color:rgba(70, 94, 105, 0.05);">lodash</font>`<font style="color:rgb(43, 58, 66);"> 分离到单独的 chunk，并且将其从 main bundle 中移除，减轻了 bundle 大小。</font>

由于 Webpack 中，css 文件的处理是通过对应的 loader，使用 js 生成 style 标签的方式引入 css 的，通常会被打包在一起。如果我们想分离 css 为单独的打包文件，可以使用 [<font style="color:rgb(26, 107, 172);">mini-css-extract-plugin</font>](https://webpack.docschina.org/plugins/mini-css-extract-plugin)<font style="color:rgb(26, 107, 172);">。</font>

<font style="color:rgb(26, 107, 172);"></font>

**<font style="color:rgb(43, 58, 66);">动态导入</font>**<font style="color:rgb(43, 58, 66);">：通过模块的内联函数调用分离代码。</font>

