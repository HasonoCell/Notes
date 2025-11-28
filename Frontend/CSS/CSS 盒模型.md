# 标准盒模型
当某一容器为标准盒模型时，我们设置的 `width / height` 仅仅指内容区域尺寸，容器的总宽高为 `width / height + padding + border`，如：

```html
<div class="main"></div>
<style>
  .main {
    width: 100px;
    height: 100px;
    border: 10px solid red;
    padding: 10px;
    /* box-sizing: border-box; */
  }
</style>

```

该容器的内容宽高为 100px，容器的宽高为 100px (内容) + 20px (左右padding) + 20px (左右border) = 140px

# border-box 盒模型
当某一容器为 border-box 盒模型时，我们设置的 `width / height` 是设置的整个容器的宽高，容器的总宽高为 `padding + border` 再加上内容的尺寸；内容尺寸由  `width / height` 减去  `padding + border` 动态计算得出，上文的例子，如果设置为了 border-box 盒模型，则内容尺寸将被压缩到 60 px，而容器尺寸就是我们设置的 100px。

# offsetHeight, clientHeight 与 scrollHeight、
**理解这三种 height 是实现虚拟列表的重点之一，而理解的重点在于搞清楚标准盒模型和 border-box 盒模型中对于容器宽高的不同定义**。

**offsetHeight**：

1. 若为标准盒模型，获取到容器的高度，如代码块，div 的 offsetHeight 为 140 px
2. 若为 border-box 盒模型，获取到容器的高度，如代码块，div 的 offsetHeight 为 100 px

**clientHeight**：

1. 若为标准盒模型，获取到容器的高度（不含 `border`），如代码块，div 的 clientHeight 为 120 px
2. 若为 border-box 盒模型，获取到容器的高度（不含 `border`），如代码块，div 的 clientHeight 为 80 px

**<font style="color:#DF2A3F;">offsetHeight 和 clientHeight 的区别就在于后者不会获取 border</font>**



**scrollHeight（由于内容尺寸没超出容器时与 clientHeight 相同，这里重点解释超出容器的情况）**

1. 若为标准盒模型，获取到 `实际内容尺寸 + 一边的 padding` 的高度（不含 `border`），如下文代码块，div 的 scrollHeight 为 310 px

```html
<div class="main">
  /* 实际内容高度超出了预设内容高度 */ 
  <div style="height: 300px"></div> 
</div>
<style>
  .main {
    width: 100px;
    height: 100px;
    border: 10px solid red;
    padding: 10px;
    /* box-sizing: border-box; */
  }
```

2. 若为 border-box 盒模型，获取到值与标准盒模型下的情况相同（原因是内容宽度已经超出了预设宽度，也就不存在什么内容被自动压缩的问题。而 scrollHeight 一直是处理实际情况下的内容高度；值得注意的是，**容器本身的宽高依然会根据是否为标准盒模型改变**）此时为容器加上 `overflow: auto` 就可以滚动查看超出容器的内容部分。

