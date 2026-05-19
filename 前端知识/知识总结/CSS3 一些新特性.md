
### 一、 核心特性解析与实战示例

#### 1. `@layer` (级联层)

传统的 CSS 权重规则（ID > 类 > 标签）常常导致在大型项目中需要使用 `!important` 来强行覆盖样式。`@layer` 允许你定义样式的“层级”优先级，高优先级层中的样式总是会覆盖低优先级层，**无视传统的选择器权重**。

```CSS
/* 1. 定义层的顺序（越往后优先级越高） */
@layer reset, base, theme;

/* 2. 在不同的层中编写样式 */
@layer theme {
  /* 尽管只有类选择器，但因为它在最高优先级的层，所以它生效 */
  .title { color: blue; } 
}

@layer base {
  /* 尽管使用了 ID 选择器（传统权重极高），但由于 base 层级低，这里会被覆盖 */
  #main .title { color: red; } 
}
```

> **核心价值：** 彻底终结了“权重内卷”，非常适合用来引入第三方组件库（将其放在底层的 layer 中，方便我们自己的业务代码覆盖）。

#### 2. `oklch()` (颜色函数)

OKLCH 是一种基于人类视觉感知的颜色空间，分别代表 Lightness（明度）、Chroma（色度/饱和度）、Hue（色相）。相比于传统的 `rgb()` 或 `hsl()`，它在不同色相下能保持视觉明度的一致，且支持现代显示器的广色域。

```CSS
:root {
  /* 定义一个品牌主色调 */
  --brand-hue: 250; /* 蓝紫色 */
  
  /* 仅通过改变 L (明度) 即可生成一套完美的同色系调色板 */
  --brand-light: oklch(90% 0.05 var(--brand-hue));
  --brand-base:  oklch(60% 0.15 var(--brand-hue));
  --brand-dark:  oklch(25% 0.10 var(--brand-hue));
}

button {
  background-color: var(--brand-base);
  color: white;
}
```

> **核心价值：** 告别色彩断层和“看起来不一样亮”的颜色问题，是构建现代 Design System（设计系统）的首选。

#### 3. `@property` (自定义属性)

过去，CSS 变量（`--my-color`）对浏览器来说只是一串毫无意义的字符串，因此无法被直接用来做渐变动画（过渡效果）。`@property` 允许你给 CSS 变量定义“数据类型”。

```CSS
/* 告诉浏览器：这是一个代表角度的变量，且有初始值 */
@property --gradient-angle {
  syntax: "<angle>";
  initial-value: 0deg;
  inherits: false;
}

.card {
  /* 使用该角度变量构建渐变背景 */
  background: linear-gradient(var(--gradient-angle), blue, red);
  transition: --gradient-angle 1s linear;
}

.card:hover {
  /* 鼠标悬停时改变角度，因为有了类型定义，浏览器能计算出中间的平滑过渡帧 */
  --gradient-angle: 360deg; 
}
```

#### 4. `color-mix()` (颜色混合)

无需预处理器（如 Sass 的 `darken()` 或 `lighten()`），原生 CSS 现在可以直接混合颜色，这在做主题切换或状态反馈（如 hover 态变暗）时极其方便。

```CSS
.btn {
  --btn-color: #007bff;
  background-color: var(--btn-color);
}

.btn:hover {
  /* 在 srgb 色彩空间下，将按钮颜色与 20% 的黑色混合，实现加深效果 */
  background-color: color-mix(in srgb, var(--btn-color), black 20%);
}

.btn:active {
  /* 混合 40% 的黑色 */
  background-color: color-mix(in srgb, var(--btn-color), black 40%);
}
```

#### 5. `:has()` (父级选择器)

长期以来，CSS 只能通过父元素选择子元素（向下查找）。`:has()` 允许你根据子元素的状态或是否存在，来为**父元素**应用样式。

```CSS
/* 场景 1：如果卡片（.card）内包含图片（img），则移除卡片的内边距 */
.card:has(img) {
  padding: 0;
}

/* 场景 2：表单校验 - 如果表单内有无效的输入框，则让整个表单的提交按钮置灰且不可点击 */
form:has(input:invalid) button[type="submit"] {
  opacity: 0.5;
  pointer-events: none;
}
```

---

### 二、 补充：绝对不能错过的三大新特性

现代 CSS 的革新远不止上述这些。以下三个特性在前端布局和工程化上具有里程碑意义：

#### 1. 容器查询 `@container` (Chrome 105+)

媒体查询（`@media`）是基于**整个浏览器视口大小**来改变布局的，而组件往往是嵌套在页面不同区域的。`@container` 允许组件**根据其父容器的大小**来决定自身的布局，实现了真正的“组件级响应式”。

```CSS
/* 1. 将父容器定义为查询容器 */
.sidebar {
  container-type: inline-size;
  container-name: sidebar-container;
}

/* 2. 当父容器宽度小于 300px 时，改变内部子元素的排版 */
@container sidebar-container (max-width: 300px) {
  .user-card {
    flex-direction: column; /* 原本是横排的卡片，空间不足时变为竖排 */
  }
}
```

#### 2. 原生 CSS 嵌套 (Chrome 112+)

你不再必须依赖 Less/Sass 来写嵌套语法的 CSS 了，原生支持极大地降低了前端工程化的门槛。

```CSS
.nav-menu {
  display: flex;
  background: white;

  /* 直接嵌套子元素样式 */
  .nav-item {
    color: black;
    
    /* 直接嵌套伪类 */
    &:hover {
      color: blue;
      text-decoration: underline;
    }
  }
}
```

#### 3. 滚动驱动动画 `Scroll-driven Animations` (Chrome 115+)

过去，我们要实现“阅读进度条”或“滚动渐显”等特效，必须用 JavaScript 监听 `scroll` 事件，性能消耗大且容易卡顿。现在，CSS 可以将动画进度与滚动条的进度直接绑定。

```CSS
/* 页面顶部的阅读进度条 */
.progress-bar {
  position: fixed;
  top: 0;
  height: 5px;
  background: red;
  
  /* 将动画进度与页面的垂直滚动绑定 */
  animation: grow-progress linear;
  animation-timeline: scroll(root block);
}

@keyframes grow-progress {
  from { width: 0; }
  to { width: 100%; }
}
```