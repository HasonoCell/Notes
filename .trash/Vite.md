Esbuild： 负责预构建和压缩这两个对速度要求极高的环节。

Rollup： 负责核心打包环节（模块图构建、解析、转换、Tree-shaking、代码分割）。因其生态和打包输出优化非常成熟稳定。

# Vite 常用配置项一览
CSS 有关配置：

```javascript
import { defineConfig } from "vite";

export default defineConfig({
  css: {
    // PostCSS 有关配置
    postcss: {},
    // CSS 预处理器有关配置
    preprocessorOptions: {
      scss: {},
      less: {},
    },
  },
});
```

配置路径别名：

```typescript
import { defineConfig } from 'vite'
import path from 'path'

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '~components': path.resolve(__dirname, './src/components'),
    },
  },
})
```

使用`base`配置静态资源访问路径：

**1. 根路径部署（默认）：**

```javascript
export default defineConfig({
  base: '/', // 默认值，部署在域名根目录
  // 访问：https://example.com/
})
```

**2. 子路径部署：**

```javascript
export default defineConfig({
  base: '/my-app/', // 部署在子目录
  // 访问：https://example.com/my-app/
})
```

**3. 相对路径部署：**

```javascript
export default defineConfig({
  base: './', // 相对路径，适合不确定部署位置
})
```

**未设置 base 时：**

```html
<script src="/assets/index-abc123.js"></script>
<link href="/assets/index-def456.css" rel="stylesheet">
```

**设置 base: '/my-app/' 后：**

```html
<script src="/my-app/assets/index-abc123.js"></script>
<link href="/my-app/assets/index-def456.css" rel="stylesheet">
```

# Vite 的开发阶段构建过程
1. `no-bundle`机制：**针对源代码（即项目中自己写的代码）**，不需要像 Webpack 一样打包好所有文件后再启动浏览器，Vite **在构建阶段直接不打包**！采用浏览器原生支持的 ES Module 机制加载模块和文件，并且 Vite 采用了按需加载的方式，只有需要的模块才会发起浏览器 http 请求。

---

2. 依赖预构建：针对第三方库（依赖），我们必须要确保**一些非 ES Module 格式的代码（比如 CommonJS）转为 ESM 模式，**这样才能在 Vite 中正常运行。此外我们知道，ESM 模块是`import`语句通过`http`请求拿到的，当某一个第三方库使用了太多的 ESM 组织内部代码，会导致我们的项目使用该库时出现大量的`http`**请求瀑布流（如下图）。**这个时候我们就需要将第三方库分散的文件整合到一起，减少 http 请求，优化性能。  
![](https://cdn.nlark.com/yuque/0/2025/webp/53866714/1755602201170-8f587442-47fb-4ec2-8f8b-c54abaddaed2.webp)

	对于上述需求**（规范格式和合并文件）**，Vite 采用了`Esbuild`进行**依赖预构建。**依赖预构建的产物会放在`node_modules`文件夹下的`.vite`文件夹中，此后在开发过程中对第三方依赖的请求路径重写到`.vite`文件夹下，并且对 Dev Server 设置了强缓存：

![](https://cdn.nlark.com/yuque/0/2025/webp/53866714/1755602888933-80e2f0c0-21e1-443a-828e-39e1b262d833.webp)

	总结：开发阶段，Vite 采用了**浏览器加载原生 ESM 实现 no-bundle** 和 **Esbuild 实现第三方依赖预构建**的机制，实现了极速的开发体验。



<font style="color:rgb(51, 51, 51);">V</font><font style="color:rgb(51, 51, 51);">ite 将预构建相关的配置项都集中在</font>`optimizeDeps`<font style="color:rgb(51, 51, 51);">属性上，通常使用三个配置项：</font>

`<font style="color:rgb(51, 51, 51);">entries</font>`<font style="color:rgb(51, 51, 51);">：定义预构建的入口文件。</font>

`<font style="color:rgb(51, 51, 51);">include</font>`<font style="color:rgb(51, 51, 51);">：决定强制预构建的依赖性。</font>

```typescript
// vite.config.ts
optimizeDeps: {
  // 将所有的 .vue 文件作为扫描入口
  entries: ["**/*.vue"];
  // 配置为一个字符串数组，将 `lodash-es` 和 `vue`两个包强制进行预构建
  include: ["lodash-es", "vue"];
}
```

`esbuildOptions`：自定义 Esbuild 的一些配置，比如使用一些插件。



**<font style="color:#DF2A3F;">什么是二次预构建？</font>**

<font style="color:rgb(64, 64, 64);">当手动安装了一个新的依赖，或者使 </font>`<font style="color:rgb(64, 64, 64);background-color:rgb(236, 236, 236);">node_modules</font>`<font style="color:rgb(64, 64, 64);"> 中的某个包发生了变化时，Vite 在开发服务器启动后</font>**<font style="color:rgb(64, 64, 64);">再次运行</font>**<font style="color:rgb(64, 64, 64);">依赖预构建的过程。</font>

可以<font style="color:rgb(64, 64, 64);">通过 </font>`<font style="color:rgb(64, 64, 64);background-color:rgb(236, 236, 236);">optimizeDeps.include</font>`<font style="color:rgb(64, 64, 64);"> 或 </font>`<font style="color:rgb(64, 64, 64);background-color:rgb(236, 236, 236);">optimizeDeps.exclude</font>`<font style="color:rgb(64, 64, 64);"> 显式地包含或排除依赖，避免 Vite 在每次启动时都进行依赖扫描和无效的重建。</font>



# Esbuild 代码调用与插件开发
通过以下方式使用函数来调用 esbuild：

```typescript
import { transform } from "esbuild";
import { build } from "esbuild";

// 打包有关配置项
const runBuild = async () => {
  const result = await build({});
};

// 转译有关配置项
const runTransform = async () => {
  const result = await transform({});
};
```

esbuild 的插件被设计为一个对象，拥有`name`和`setup`两个属性，name 是插件的名称，setup 是一个函数，其中入参是一个`build`对象，此对象上有两个重要 hook：`onResolve`和`onLoad`，分别控制路径解析和模块内容加载的过程。以下代码展示了一个基础的插件开发：

```typescript
import type { Plugin } from 'esbuild'

let envPlugin: Plugin = {
  name: 'env',
  setup(build) {
    build.onResolve({ filter: /^env$/ }, (args) => ({
      path: args.path,
      namespace: 'env-ns',
    }))

    build.onLoad({ filter: /.*/, namespace: 'env-ns' }, () => ({
      contents: JSON.stringify(process.env),
      loader: 'json',
    }))
  },
}

require('esbuild').build({
  entryPoints: ['src/index.jsx'],
  bundle: true,
  outfile: 'out.js',
  // 应用插件
  plugins: [envPlugin],
}).catch(() => process.exit(1))
```

# Rollup 打包的基本使用
## 单入口和产物
创建`rollup.config.js`：

```typescript
import { defineConfig } from "rollup";

export default defineConfig({
  // 入口配置
  input: ["src/index.js"],
  // 产物配置
  output: {
    // 产物输出目录
    dir: "dist",
    // 产物格式
    format: "esm",
  },
});
```

随后，执行命令`pnpm exec rollup -c`，-c 参数代表使用配置文件的意思。值得一提的是，`Rollup`的打包**自带**`**Tree Shaking**`**的能力**，可以删除没有使用到的代码。

## 多入口和产物
```typescript
import { defineConfig } from "rollup";

export default defineConfig({
  // 多入口
  input: ["src/index.js", "src/util.js"],
  // 多产物
  output: [
    {
      dir: "dist/esm",
      format: "esm",
    },
    {
      dir: "dist/cjs",
      format: "cjs",
    },
  ],
});
```

详细的`output`配置：

```typescript
output: {
  // 产物输出目录
  dir: path.resolve(__dirname, 'dist'),
  // 以下三个配置项都可以使用这些占位符:
  // 1. [name]: 去除文件后缀后的文件名
  // 2. [hash]: 根据文件名和文件内容生成的 hash 值
  // 3. [format]: 产物模块格式，如 es、cjs
  // 4. [extname]: 产物后缀名(带`.`)
  // 入口模块的输出文件名
  entryFileNames: `[name].js`,
  // 非入口模块(如动态 import)的输出文件名
  chunkFileNames: 'chunk-[hash].js',
  // 静态资源文件输出文件名
  assetFileNames: 'assets/[name]-[hash][extname]',
  // 产物输出格式，包括`amd`、`cjs`、`es`、`iife`、`umd`、`system`
  format: 'cjs',
  // 是否生成 sourcemap 文件
  sourcemap: true,
  // 如果是打包出 iife/umd 格式，需要对外暴露出一个全局变量，通过 name 配置变量名
  name: 'MyBundle',
  // 全局变量声明
  globals: {
    // 项目中可以直接用`$`代替`jquery`
    jquery: '$'
  }
}
```

## 自定义拆包配置
Vite 的默认拆包机制会将所有 JS 打包成一份文件，该文件体积较大，不利于首屏渲染。这时候我们可以自定义拆包选项，优化打包产物。

```typescript
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          "react-vendor": ["react", "react-dom"],
          "component-lib": ["antd", "@ant-design/x"],
        },
      },
    },
  },
});
```

## 通过 JS 代码使用 Rollup
```typescript

const rollup = require("rollup");

// 常用 inputOptions 配置
const inputOptions = {
  input: "./src/index.js",
  external: [],
  plugins:[]
};

const outputOptionsList = [
  // 常用 outputOptions 配置
  {
    dir: 'dist/es',
    entryFileNames: `[name].[hash].js`,
    chunkFileNames: 'chunk-[hash].js',
    assetFileNames: 'assets/[name]-[hash][extname]',
    format: 'es',
    sourcemap: true,
    globals: {
      lodash: '_'
    }
  }
  // 省略其它的输出配置
];

async function build() {
  let bundle;
  let buildFailed = false;
  try {
    // 1. 调用 rollup.rollup 生成 bundle 对象
    bundle = await rollup.rollup(inputOptions);
    for (const outputOptions of outputOptionsList) {
      // 2. 拿到 bundle 对象，根据每一份输出配置，调用 generate 和 write 方法分别生成和写入产物
      const { output } = await bundle.generate(outputOptions);
      await bundle.write(outputOptions);
    }
  } catch (error) {
    buildFailed = true;
    console.error(error);
  }
  if (bundle) {
    // 最后调用 bundle.close 方法结束打包
    await bundle.close();
  }
  process.exit(buildFailed ? 1 : 0);
}

build();
```

# 自定义开发 Vite 插件
一**个 Vite 插件中各个 hooks 的执行顺序：**

![](https://cdn.nlark.com/yuque/0/2025/webp/53866714/1755861066666-e2d317ce-dcde-4f4d-a662-222867cfdeb2.webp)

+ <font style="color:rgb(51, 51, 51);">服务启动阶段: </font>`<font style="color:rgb(255, 80, 44);background-color:rgb(255, 245, 245);">config</font>`用于对配置文件中导出的对象的进一步自定义修改<font style="color:rgb(51, 51, 51);">、</font>`<font style="color:rgb(255, 80, 44);background-color:rgb(255, 245, 245);">configResolved</font>`得到最终的配置<font style="color:rgb(51, 51, 51);">、</font>`<font style="color:rgb(255, 80, 44);background-color:rgb(255, 245, 245);">options</font>`进行 Rollup 配置的转换<font style="color:rgb(51, 51, 51);">、</font>`<font style="color:rgb(255, 80, 44);background-color:rgb(255, 245, 245);">configureServer</font>`自定义一些 Dev Server 中间件<font style="color:rgb(51, 51, 51);">、</font>`<font style="color:rgb(255, 80, 44);background-color:rgb(255, 245, 245);">buildStart</font>`正式开启构建流程
+ <font style="color:rgb(51, 51, 51);">请求响应阶段: 如果是 </font>`<font style="color:rgb(255, 80, 44);background-color:rgb(255, 245, 245);">html</font>`<font style="color:rgb(51, 51, 51);"> 文件，仅执行</font>`<font style="color:rgb(255, 80, 44);background-color:rgb(255, 245, 245);">transformIndexHtml</font>`<font style="color:rgb(51, 51, 51);">钩子；对于非 HTML 文件，则依次执行</font>`<font style="color:rgb(255, 80, 44);background-color:rgb(255, 245, 245);">resolveId</font>`<font style="color:#262626;background-color:transparent;">解析模块路径</font><font style="color:rgb(51, 51, 51);">、</font>`<font style="color:rgb(255, 80, 44);background-color:rgb(255, 245, 245);">load</font>`<font style="color:#262626;">加载模块内容</font><font style="color:rgb(51, 51, 51);">、</font>`<font style="color:rgb(255, 80, 44);background-color:rgb(255, 245, 245);">transform</font>`<font style="color:rgb(51, 51, 51);">对模块内容进行自定义转译。</font>
+ <font style="color:rgb(51, 51, 51);">热更新阶段: 执行</font>`<font style="color:rgb(255, 80, 44);background-color:rgb(255, 245, 245);">handleHotUpdate</font>`<font style="color:rgb(51, 51, 51);">钩子。</font>
+ <font style="color:rgb(51, 51, 51);">服务关闭阶段: 依次执行</font>`<font style="color:rgb(255, 80, 44);background-color:rgb(255, 245, 245);">buildEnd</font>`<font style="color:rgb(51, 51, 51);">和</font>`<font style="color:rgb(255, 80, 44);background-color:rgb(255, 245, 245);">closeBundle</font>`<font style="color:rgb(51, 51, 51);">钩子。</font>

<font style="color:rgb(51, 51, 51);">Vite 相较于 Rollup 的5 个独有 hook 分别是: </font>`<font style="color:rgb(255, 80, 44);background-color:rgb(255, 245, 245);">config</font>`<font style="color:rgb(51, 51, 51);">、</font>`<font style="color:rgb(255, 80, 44);background-color:rgb(255, 245, 245);">configResolved</font>`<font style="color:rgb(51, 51, 51);">、</font>`<font style="color:rgb(255, 80, 44);background-color:rgb(255, 245, 245);">configureServer</font>`<font style="color:rgb(51, 51, 51);">、</font>`<font style="color:rgb(255, 80, 44);background-color:rgb(255, 245, 245);">transformIndexHtml</font>`<font style="color:rgb(51, 51, 51);">和</font>`<font style="color:rgb(255, 80, 44);background-color:rgb(255, 245, 245);">handleHotUpdate</font>`<font style="color:rgb(51, 51, 51);">。</font>

**多个 Vite 插件中各个插件的执行顺序：**

![](https://cdn.nlark.com/yuque/0/2025/webp/53866714/1755861353680-aefe0291-a6a3-4182-870c-d90d01c1a2c7.webp)

一个简单的 Vite 插件例子（处理虚拟模块）：  


```typescript
// 插件主体
import type { Plugin as VitePlugin } from "vite";

export const testPlugin = (): VitePlugin => {
  const virtualModuleId = "virtual:hello";
  const resolvedVirtualModuleId = "\0virtual:hello";

  return {
    name: "vite-test-plugin",

    resolveId(id) {
      if (id === virtualModuleId) {
        return resolvedVirtualModuleId;
      }
    },

    load(id) {
      if (id === resolvedVirtualModuleId) {
        return 'export const msg = "Hello from virtual module"';
      }
    },

    // 3. 转换虚拟模块内容
    transform(code, id) {
      if (id === resolvedVirtualModuleId) {
        // 这里可以对 code 做进一步处理，比如加注释
        return code + `\n// transformed by vite-virtual-hello-plugin`;
      }
    },
  };
};

// 前端代码中，专门处理这样的导入语句
import { msg } from "virtual:hello";
console.log(msg);
```

# Vite 实现模块联邦
<font style="color:rgb(51, 51, 51);">模块复用的历史解决方案，主要包括</font>`发布 npm 包`、`Git Submodule`、`依赖外部化 + CDN 导入`和 `Monorepo 架构`，但都存在各自的问题。



<font style="color:rgb(51, 51, 51);"> Module Federation 模块联邦能近乎完美地解决模块共享问题，主要原因包括</font>`实现了任意粒度的模块共享`、`减少构建产物体积`、`运行时按需加载`以及`共享第三方依赖`<font style="color:rgb(51, 51, 51);">这四个方面：</font>

1. **<font style="color:rgb(51, 51, 51);">实现任意粒度的模块共享</font>**<font style="color:rgb(51, 51, 51);">。这里所指的模块粒度可大可小，包括第三方 npm 依赖、业务组件、工具函数，甚至可以是整个前端应用！而整个前端应用能够共享产物，代表着各个应用单独开发、测试、部署，这也是一种</font>**<font style="color:rgb(51, 51, 51);">微前端</font>**<font style="color:rgb(51, 51, 51);">的实现。</font>
2. **<font style="color:rgb(51, 51, 51);">优化构建产物体积</font>**<font style="color:rgb(51, 51, 51);">。远程模块可以从本地模块运行时被拉取，而不用参与本地模块的构建，可以加速构建过程，同时也能减小构建产物。</font>
3. **<font style="color:rgb(51, 51, 51);">运行时按需加载</font>**<font style="color:rgb(51, 51, 51);">。远程模块导入的粒度可以很小，如果你只想使用 app1 模块的</font>`add`<font style="color:rgb(51, 51, 51);">函数，只需要在 app1 的构建配置中导出这个函数，然后在本地模块中按照诸如</font>`import('app1/add')`<font style="color:rgb(51, 51, 51);">的方式导入即可，这样就很好地实现了模块按需加载。</font>
4. **<font style="color:rgb(51, 51, 51);">第三方依赖共享</font>**<font style="color:rgb(51, 51, 51);">。通过模块联邦中的共享依赖机制，我们可以很方便地实现在模块间公用依赖代码，从而避免以往的</font>`external + CDN 引入`<font style="color:rgb(51, 51, 51);">方案的各种问题。</font>



Vite 主要使用 [@originjs/vite-plugin-federation](https://github.com/originjs/vite-plugin-federation) 这个插件去实现。

远程模块：

```typescript
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import federation from "@originjs/vite-plugin-federation";

export default defineConfig({
  plugins: [
    react(),
    federation({
      name: "remote",
      // remote 模块入口文件(注意，是打包后的文件！）
      filename: "remoteEntry.js",
      // remote 暴露出去的模块
      exposes: {
        "./Button": "./src/components/Button.js",
        "./App": "./src/App.js",
      },
      // 共享依赖
      shared: ["react", "react-dom"],
    }),
  ],
  build: {
    target: "esnext",
  },
});
```

首先需要启动远程模块项目，得到对应的 URL，这里我们执行命令：

```typescript
// 打包产物
pnpm run build
// 模拟部署效果，一般会在生产环境将产物上传到 CDN 
pnpm exec vite preview --port=3001 --strictPort
```

本地模块：

```typescript
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import federation from "@originjs/vite-plugin-federation";

export default defineConfig({
  plugins: [
    react(),
    federation({
      name: "host",
      remotes: {
        // 远程模块的 URL 地址
        remote: "http://localhost:3001/assets/remoteEntry.js",
      },
      shared: ["react", "react-dom"],
    }),
  ],
  build: {
    target: "esnext",
  },
});
```

![](https://cdn.nlark.com/yuque/0/2025/webp/53866714/1755913114159-e9c4cf63-6a46-47e0-bae0-53bac4c77270.webp)![](https://cdn.nlark.com/yuque/0/2025/webp/53866714/1755913172627-a3efedbc-2685-403a-81f9-6688af7f39ae.webp)

# Vite 读取环境变量
Vite 可以自动读取`.env`文件中的环境变量（**必须要以 VITE 开头**）：

```typescript
VITE_API_URL=https://staging-api.example.com
```

随后，你可以在你的任何前端代码中使用：

```typescript
const apiUrl = import.meta.env.VITE_API_URL;
```

# Vite 的 HMR 
Vite 的 HMR 可以解决两个问题：**<font style="color:#DF2A3F;">局部更新和状态保存</font>****。**在实际开发中，我们不用手动干预 HMR 的流程，Vite 会自动处理大部分场景，并且尝试保存页面的状态。但是如果需要手动干预，我们可以使用以下 API：

`accept`：接受模块的热更新

```typescript
import { useState } from "react";

function App() {
  const [count, setCount] = useState(0);

  return (
    <div>
      <button onClick={() => setCount(count + 1)}>+ 1 </button>
      <p>{count}</p>
    </div>
  );
}

if (import.meta.hot) {
  import.meta.hot.accept((module) => {
    console.log("App 已更新！");
    console.log(module);
  });
}

export default App;
```

2. `dispose`在模块更新，旧模块需要销毁时触发。
3. `data`在不同的模块实例之间共享数据。

## Vite HMR 的工作流程？
具体来说就是 Vite Dev Server 和浏览器维护了一个 Websocket 连接。由于 Vite 开发阶段直接使用 ESM 在浏览器中导入模块，当某一文件发生了更新，Vite 的服务器会检测到这次更新，然后通过 Websocket 向浏览器推送一条包含了更新模块文件路径的 JSON 信息<font style="color:#DF2A3F;">（而不是直接传输更新后的代码）</font>。然后浏览器发送一条 GET 请求来获取该模块的最新代码，Vite 的服务器按需编译并返回给浏览器。 

但这样只是更换了模块本身，导入了它的父模块仍然持有旧的子模块的引用。这时候就要使用到 `import.meta.hot.accept() `这个 HMR API 来让父模块接受子模块的更新，该方法回调函数的入参可以拿到更新后的新模块的内容。但是一般来说我们不用手动调用这些 API，官方插件会替我们自动生成 HMR 的更新逻辑。

# Vite 解决浏览器兼容问题
<font style="color:rgb(51, 51, 51);">旧版浏览器的语法兼容问题主要分两类: </font>**<font style="color:rgb(51, 51, 51);">语法降级问题</font>**<font style="color:rgb(51, 51, 51);">和 </font>**<font style="color:rgb(51, 51, 51);">Polyfill 缺失问题</font>**<font style="color:rgb(51, 51, 51);">。</font>

**<font style="color:rgb(51, 51, 51);">语法降级：</font>**<font style="color:rgb(51, 51, 51);">主要是指将高级语法转换为低级语法，比如将箭头函数</font>`<font style="color:rgb(51, 51, 51);">const func = () => {}</font>`<font style="color:rgb(51, 51, 51);">转换为普通函数</font>`<font style="color:rgb(51, 51, 51);">function func() {}</font>`<font style="color:rgb(51, 51, 51);">。通常借助</font>**<font style="color:rgb(51, 51, 51);">编译时工具</font>**<font style="color:rgb(51, 51, 51);">，代表工具有</font>`<font style="color:rgb(255, 80, 44);background-color:rgb(255, 245, 245);">@babel/preset-env</font>`<font style="color:rgb(51, 51, 51);">和</font>`<font style="color:rgb(255, 80, 44);background-color:rgb(255, 245, 245);">@babel/plugin-transform-runtime</font>`<font style="color:rgb(51, 51, 51);">。</font>

**<font style="color:rgb(51, 51, 51);">Polyfill 缺失：</font>**<font style="color:rgb(51, 51, 51);">主要是说低版本浏览器不存在高版本浏览器提供的一些 JS API，比如</font>`Object.entries`<font style="color:rgb(51, 51, 51);">方法。通常借助</font>**<font style="color:rgb(51, 51, 51);">运行时基础库</font>**<font style="color:rgb(51, 51, 51);">，代表库包括</font>`<font style="color:rgb(255, 80, 44);background-color:rgb(255, 245, 245);">core-js</font>`<font style="color:rgb(51, 51, 51);">和</font>`<font style="color:rgb(255, 80, 44);background-color:rgb(255, 245, 245);">regenerator-runtime</font>`<font style="color:rgb(51, 51, 51);">。</font>

<font style="color:rgb(51, 51, 51);">在 Vite 中，我们通常使用</font>`<font style="color:rgb(51, 51, 51);">@vitejs/plugin-legacy</font>`<font style="color:rgb(51, 51, 51);">去实现兼容问题。</font>

```typescript
import legacy from '@vitejs/plugin-legacy';
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [
    legacy({
      // 设置目标浏览器，browserslist 配置语法
      targets: ['ie >= 11'],
    })
  ]
})
```

这个插件的底层主要调用的是这三个核心库

1. `@babel/core` Babel 的核心库，负责代码的解析、转换和生成。

2. `@babel/preset-env` 用于根据目标浏览器环境自动降级语法。

3. `@babel/plugin-transform-runtime` 用于优化 Polyfill 的注入方式，减少全局污染。

以下是只使用`@babel/preset-env` 的`.babelrc.json`配置文件：

```typescript
{
  "presets": [
    [
      "@babel/preset-env",
      {
        // 指定兼容的浏览器版本
        "targets": {
          "ie": "11"
        },
        // 基础库 core-js 的版本，一般指定为最新的大版本
        "corejs": 3,
        // “usage” 按需实现 Polyfill 注入，精简代码 
        "useBuiltIns": "usage",
        // 不将 ES 模块语法转换为其他模块语法
        "modules": false
      }
    ]
  ]
}
```

<font style="color:#DF2A3F;">但是</font>`<font style="color:#DF2A3F;">@babel/preset-env</font>`<font style="color:#DF2A3F;">的</font>`<font style="color:#DF2A3F;">useBuiltIns</font>`<font style="color:#DF2A3F;">注入 Polyfill 方案会有如下问题</font>：

1. 全局自动注入 Polyfill，容易造成**全局空间污染**。
2. <font style="color:rgb(51, 51, 51);">很多工具函数的实现代码，会在许多文件中重现出现，造成</font>**<font style="color:rgb(51, 51, 51);">文件体积冗余</font>**<font style="color:rgb(51, 51, 51);">。</font>

<font style="color:rgb(51, 51, 51);">更优秀的解决方案：使用</font>`<font style="color:rgb(51, 51, 51);">@babel/plugin-transform-runtime</font>`<font style="color:rgb(51, 51, 51);">插件：不会造成全局污染，只会注入局部 Polyfill，但是注意使用此插件要将</font>`@babel/preset-env`的`useBuiltIns`设置为 false，不然会造成冲突。

推荐：preset-env 只做语法降级，polyfill 交给 transform-runtime。

```typescript
{
  "plugins": [
    // 添加 transform-runtime 插件
    [
      "@babel/plugin-transform-runtime", 
      {
        "corejs": 3
      }
    ]
  ],
  "presets": [
    [
      "@babel/preset-env", 
      {
        "targets": {
          "ie": "11"
        },
        // 关闭 @babel/preset-env 默认的 Polyfill 注入
        "useBuiltIns": false,
        "modules": false
      }
    ]
  ]
}
```

# Rollup 为什么能实现 Tree Shaking
<font style="color:rgb(15, 17, 21);">Rollup 实现 Tree Shaking 的核心流程可以概括为：</font>

1. **<font style="color:rgb(15, 17, 21);">解析</font>**<font style="color:rgb(15, 17, 21);">代码生成 AST，构建模块依赖图。</font>
2. **<font style="color:rgb(15, 17, 21);">进行语义分析</font>**<font style="color:rgb(15, 17, 21);">，模拟执行代码路径，精确追踪每个导出标识符的引用情况。</font>
3. **<font style="color:rgb(15, 17, 21);">标记</font>**<font style="color:rgb(15, 17, 21);">所有“已使用”的代码和“有副作用”的语句。</font>
4. **<font style="color:rgb(15, 17, 21);">在生成最终代码时，安全地省略所有未被标记为“已使用”且无副作用的代码。</font>**

<font style="color:rgb(15, 17, 21);">其高效性和准确性的根本在于 </font>**<font style="color:rgb(15, 17, 21);">ES Module 的静态模块结构</font>**<font style="color:rgb(15, 17, 21);">，使得这种高级的静态分析成为可能。这使得 Rollup 在打包库和应用时，能生成极其精简和高效的代码。</font>

