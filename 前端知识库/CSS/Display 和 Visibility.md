### Display 属性的默认值是什么？
**<font style="color:rgb(15, 17, 21);">display 属性没有唯一的“全局默认值”。它的默认值取决于具体的 HTML 元素。</font>**<font style="color:rgb(15, 17, 21);">浏览器为不同的 HTML 元素预设了不同的 </font>`<font style="color:rgb(15, 17, 21);background-color:rgb(235, 238, 242);">display</font>`<font style="color:rgb(15, 17, 21);"> 值，这被称为 </font>**<font style="color:rgb(15, 17, 21);">“用户代理样式表”</font>**<font style="color:rgb(15, 17, 21);">。</font>

<font style="color:rgb(15, 17, 21);">最常见的默认值有以下几种：</font>

+ `**<font style="color:rgb(15, 17, 21);background-color:rgb(235, 238, 242);">display: block</font>**`<font style="color:rgb(15, 17, 21);"> </font><font style="color:rgb(15, 17, 21);">（块级元素）</font>
    - <font style="color:rgb(15, 17, 21);">特点：独占一行，可以设置宽度、高度、内外边距。</font>
    - <font style="color:rgb(15, 17, 21);">常见元素：</font>`<font style="color:rgb(15, 17, 21);background-color:rgb(235, 238, 242);"><div></font>`<font style="color:rgb(15, 17, 21);">,</font><font style="color:rgb(15, 17, 21);"> </font>`<font style="color:rgb(15, 17, 21);background-color:rgb(235, 238, 242);"><p></font>`<font style="color:rgb(15, 17, 21);">,</font><font style="color:rgb(15, 17, 21);"> </font>`<font style="color:rgb(15, 17, 21);background-color:rgb(235, 238, 242);"><h1></font>`<font style="color:rgb(15, 17, 21);"> </font><font style="color:rgb(15, 17, 21);">到</font><font style="color:rgb(15, 17, 21);"> </font>`<font style="color:rgb(15, 17, 21);background-color:rgb(235, 238, 242);"><h6></font>`<font style="color:rgb(15, 17, 21);">,</font><font style="color:rgb(15, 17, 21);"> </font>`<font style="color:rgb(15, 17, 21);background-color:rgb(235, 238, 242);"><ul></font>`<font style="color:rgb(15, 17, 21);">,</font><font style="color:rgb(15, 17, 21);"> </font>`<font style="color:rgb(15, 17, 21);background-color:rgb(235, 238, 242);"><li></font>`<font style="color:rgb(15, 17, 21);">,</font><font style="color:rgb(15, 17, 21);"> </font>`<font style="color:rgb(15, 17, 21);background-color:rgb(235, 238, 242);"><section></font>`<font style="color:rgb(15, 17, 21);">,</font><font style="color:rgb(15, 17, 21);"> </font>`<font style="color:rgb(15, 17, 21);background-color:rgb(235, 238, 242);"><article></font>`<font style="color:rgb(15, 17, 21);"> </font><font style="color:rgb(15, 17, 21);">等。</font>
+ `**<font style="color:rgb(15, 17, 21);background-color:rgb(235, 238, 242);">display: inline</font>**`<font style="color:rgb(15, 17, 21);"> </font><font style="color:rgb(15, 17, 21);">（行内元素）</font>
    - <font style="color:rgb(15, 17, 21);">特点：不会独占一行，与其他行内元素在同一行显示。</font>**<font style="color:rgb(15, 17, 21);">无法设置宽度和高度</font>**<font style="color:rgb(15, 17, 21);">，其大小由内容撑开。垂直方向的内外边距不生效或表现异常。</font>
    - <font style="color:rgb(15, 17, 21);">常见元素：</font>`<font style="color:rgb(15, 17, 21);background-color:rgb(235, 238, 242);"><span></font>`<font style="color:rgb(15, 17, 21);">,</font><font style="color:rgb(15, 17, 21);"> </font>`<font style="color:rgb(15, 17, 21);background-color:rgb(235, 238, 242);"><a></font>`<font style="color:rgb(15, 17, 21);">,</font><font style="color:rgb(15, 17, 21);"> </font>`<font style="color:rgb(15, 17, 21);background-color:rgb(235, 238, 242);"><strong></font>`<font style="color:rgb(15, 17, 21);">,</font><font style="color:rgb(15, 17, 21);"> </font>`<font style="color:rgb(15, 17, 21);background-color:rgb(235, 238, 242);"><em></font>`<font style="color:rgb(15, 17, 21);">,</font><font style="color:rgb(15, 17, 21);"> </font>`<font style="color:rgb(15, 17, 21);background-color:rgb(235, 238, 242);"><img></font>`<font style="color:rgb(15, 17, 21);">（特殊情况）等。</font>
+ `**<font style="color:rgb(15, 17, 21);background-color:rgb(235, 238, 242);">display: inline-block</font>**`<font style="color:rgb(15, 17, 21);"> </font><font style="color:rgb(15, 17, 21);">（行内块元素）</font>
    - <font style="color:rgb(15, 17, 21);">特点：像行内元素一样可以和其他元素在同一行显示，但同时像块级元素一样可以设置宽度、高度和内外边距。</font>
    - <font style="color:rgb(15, 17, 21);">常见元素：</font>`<font style="color:rgb(15, 17, 21);background-color:rgb(235, 238, 242);"><img></font>`<font style="color:rgb(15, 17, 21);">,</font><font style="color:rgb(15, 17, 21);"> </font>`<font style="color:rgb(15, 17, 21);background-color:rgb(235, 238, 242);"><button></font>`<font style="color:rgb(15, 17, 21);">,</font><font style="color:rgb(15, 17, 21);"> </font>`<font style="color:rgb(15, 17, 21);background-color:rgb(235, 238, 242);"><input></font>`<font style="color:rgb(15, 17, 21);">,</font><font style="color:rgb(15, 17, 21);"> </font>`<font style="color:rgb(15, 17, 21);background-color:rgb(235, 238, 242);"><select></font>`<font style="color:rgb(15, 17, 21);"> </font><font style="color:rgb(15, 17, 21);">等。</font>

**<font style="color:rgb(15, 17, 21);">总结：</font>**<font style="color:rgb(15, 17, 21);"> 当你没有给一个元素设置 </font>`<font style="color:rgb(15, 17, 21);background-color:rgb(235, 238, 242);">display</font>`<font style="color:rgb(15, 17, 21);"> 属性时，它会使用浏览器为它定义的默认值。例如，一个 </font>`<font style="color:rgb(15, 17, 21);background-color:rgb(235, 238, 242);"><div></font>`<font style="color:rgb(15, 17, 21);"> 的默认 </font>`<font style="color:rgb(15, 17, 21);background-color:rgb(235, 238, 242);">display</font>`<font style="color:rgb(15, 17, 21);"> 值是 </font>`<font style="color:rgb(15, 17, 21);background-color:rgb(235, 238, 242);">block</font>`<font style="color:rgb(15, 17, 21);">，而一个 </font>`<font style="color:rgb(15, 17, 21);background-color:rgb(235, 238, 242);"><span></font>`<font style="color:rgb(15, 17, 21);"> 的默认值是 </font>`<font style="color:rgb(15, 17, 21);background-color:rgb(235, 238, 242);">inline</font>`<font style="color:rgb(15, 17, 21);">。</font>

<font style="color:rgb(15, 17, 21);"></font>

### <font style="color:rgb(15, 17, 21);">Display: none 和 Visibility: hidden 的区别</font>
<font style="color:rgb(15, 17, 21);">它们的核心区别在于</font><font style="color:rgb(15, 17, 21);"> </font>**<font style="color:rgb(15, 17, 21);">元素是否在文档布局中占据空间</font>**<font style="color:rgb(15, 17, 21);"> </font><font style="color:rgb(15, 17, 21);">以及</font><font style="color:rgb(15, 17, 21);"> </font>**<font style="color:rgb(15, 17, 21);">是否影响渲染树的生成</font>**<font style="color:rgb(15, 17, 21);">。</font>

| <font style="color:rgb(15, 17, 21);">特性</font> | `<font style="color:rgb(15, 17, 21);background-color:rgb(235, 238, 242);">display: none</font>` | `<font style="color:rgb(15, 17, 21);background-color:rgb(235, 238, 242);">visibility: hidden</font>` |
| --- | --- | --- |
| **<font style="color:rgb(15, 17, 21);">在页面中是否可见</font>** | **<font style="color:rgb(15, 17, 21);">完全不可见</font>** | **<font style="color:rgb(15, 17, 21);">不可见，但占据原有空间</font>** |
| **<font style="color:rgb(15, 17, 21);">是否占据空间</font>** | **<font style="color:rgb(15, 17, 21);">否</font>**<font style="color:rgb(15, 17, 21);">，元素从布局中完全移除</font> | **<font style="color:rgb(15, 17, 21);">是</font>**<font style="color:rgb(15, 17, 21);">，会保留一个空白区域</font> |
| **<font style="color:rgb(15, 17, 21);">是否可以被交互</font>** | **<font style="color:rgb(15, 17, 21);">否</font>**<font style="color:rgb(15, 17, 21);">（无法点击、选中等）</font> | **<font style="color:rgb(15, 17, 21);">否</font>**<font style="color:rgb(15, 17, 21);">，但子元素可以设置为可见（见下文）</font> |
| **<font style="color:rgb(15, 17, 21);">是否影响渲染树</font>** | **<font style="color:rgb(15, 17, 21);">是</font>**<font style="color:rgb(15, 17, 21);">，元素不会出现在渲染树中</font> | **<font style="color:rgb(15, 17, 21);">否</font>**<font style="color:rgb(15, 17, 21);">，元素会出现在渲染树中，只是被绘制为透明</font> |
| **<font style="color:rgb(15, 17, 21);">性能考虑</font>** | <font style="color:rgb(15, 17, 21);">引起</font>**<font style="color:rgb(15, 17, 21);">重排</font>**<font style="color:rgb(15, 17, 21);">，对性能影响较大</font> | <font style="color:rgb(15, 17, 21);">引起</font>**<font style="color:rgb(15, 17, 21);">重绘</font>**<font style="color:rgb(15, 17, 21);">，对性能影响较小</font> |
| **<font style="color:rgb(15, 17, 21);">子元素是否可继承</font>** | <font style="color:rgb(15, 17, 21);">子元素也必定不可见，无法覆盖</font> | <font style="color:rgb(15, 17, 21);">子元素可以继承隐藏，但可通过</font><font style="color:rgb(15, 17, 21);"> </font>`<font style="color:rgb(15, 17, 21);background-color:rgb(235, 238, 242);">visibility: visible</font>`<br/><font style="color:rgb(15, 17, 21);"> </font><font style="color:rgb(15, 17, 21);">覆盖</font> |


#### <font style="color:rgb(15, 17, 21);">详细解释与示例：</font>
**<font style="color:rgb(15, 17, 21);">1. 空间占据：</font>**

`<font style="color:rgb(15, 17, 21);background-color:rgb(235, 238, 242);">display: none</font>`<font style="color:rgb(15, 17, 21);">： 元素就像被从页面上“删除”了一样，完全不占据任何空间，后面的元素会顶替上来。</font>

`<font style="color:rgb(15, 17, 21);background-color:rgb(235, 238, 242);">visibility: hidden</font>`<font style="color:rgb(15, 17, 21);">： 元素虽然看不见，但它原来占据的空间依然保留着，就像“隐形”了一样。</font>

**<font style="color:rgb(15, 17, 21);">示例代码：</font>**

```html
<div>第一个div</div>
<div style="display: none;">display: none 的div</div>
<div>第三个div</div>

<br><br>

<div>第一个div</div>
<div style="visibility: hidden;">visibility: hidden 的div</div>
<div>第三个div</div>
```

**<font style="color:rgb(15, 17, 21);">效果：</font>**<font style="color:rgb(15, 17, 21);"> </font><font style="color:rgb(15, 17, 21);">第一组中，“第三个div”会紧挨着“第一个div”显示。第二组中，“第三个div”和“第一个div”之间会有一个空白区域，就是那个隐藏的div占据的空间。</font>

**<font style="color:rgb(15, 17, 21);">2. 对子元素的影响：</font>**

`<font style="color:rgb(15, 17, 21);background-color:rgb(235, 238, 242);">visibility: hidden</font>`<font style="color:rgb(15, 17, 21);"> 的一个关键特性是，</font>**<font style="color:rgb(15, 17, 21);">其隐藏性可以被子元素覆盖</font>**<font style="color:rgb(15, 17, 21);">。</font>

```html
<div style="visibility: hidden;">
  这个父元素是隐藏的。
  <span style="visibility: visible;">但这个子元素是可见的！</span>
</div>
```

<font style="color:rgb(15, 17, 21);">在这个例子中，父元素虽然隐藏了，但子元素通过 </font>`<font style="color:rgb(15, 17, 21);background-color:rgb(235, 238, 242);">visibility: visible</font>`<font style="color:rgb(15, 17, 21);"> 设置成了可见。最终效果是：父元素占据的空间保留，但背景等内容不可见，只有子元素这段文字是可见的。</font>

<font style="color:rgb(15, 17, 21);">而 </font>`<font style="color:rgb(15, 17, 21);background-color:rgb(235, 238, 242);">display: none</font>`<font style="color:rgb(15, 17, 21);"> 是绝对隐藏，其所有子元素无论设置什么 </font>`<font style="color:rgb(15, 17, 21);background-color:rgb(235, 238, 242);">display</font>`<font style="color:rgb(15, 17, 21);"> 值都不可见。</font>

