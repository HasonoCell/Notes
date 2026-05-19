# LocalStorage
`<font style="color:rgb(64, 64, 64);background-color:rgb(236, 236, 236);">localStorage</font>`<font style="color:rgb(64, 64, 64);"> 是 Web Storage API 的一部分，提供了一个简单的</font>**<font style="color:rgb(64, 64, 64);">键值对（Key-Value）存储机制</font>**<font style="color:rgb(64, 64, 64);">，用于在浏览器中持久化地存储数据，</font>**<font style="color:rgb(64, 64, 64);">除非被手动清除（通过JavaScript或浏览器设置），否则</font>****<font style="color:#DF2A3F;">数据永远不会过期，即使关闭浏览器或者重启电脑</font>**

`localStorage`只能在**同源**的情况下才能访问，并且<font style="color:rgb(64, 64, 64);">所有操作都是同步的，</font>**<font style="color:rgb(64, 64, 64);">可能会阻塞主线程</font>**<font style="color:rgb(64, 64, 64);">，因此不适用于大量数据的复杂操作。</font>

**<font style="color:rgb(64, 64, 64);">适用场景</font>**<font style="color:rgb(64, 64, 64);">：存储</font>**<font style="color:rgb(64, 64, 64);">长期存在的用户设置</font>**<font style="color:rgb(64, 64, 64);">（如主题、语言偏好）、缓存不经常改变的小规模数据。</font>

```javascript
// 存储数据
localStorage.setItem('key', 'value'); // 值必须是字符串
localStorage.setItem('user', JSON.stringify({name: 'Alice'})); // 存对象需转成JSON

// 读取数据
const data = localStorage.getItem('key');
const user = JSON.parse(localStorage.getItem('user')); // 取对象需解析JSON

// 删除数据
localStorage.removeItem('key');

// 清空所有数据
localStorage.clear();
```

# SessionStorage
<font style="color:rgb(64, 64, 64);">同样属于 Web Storage API， API 与</font>`<font style="color:rgb(64, 64, 64);background-color:rgb(236, 236, 236);">localStorage</font>`**<font style="color:rgb(64, 64, 64);">完全一样</font>**<font style="color:rgb(64, 64, 64);">（</font>`<font style="color:rgb(64, 64, 64);background-color:rgb(236, 236, 236);">setItem</font>`<font style="color:rgb(64, 64, 64);">, </font>`<font style="color:rgb(64, 64, 64);background-color:rgb(236, 236, 236);">getItem</font>`<font style="color:rgb(64, 64, 64);">等），关键在于</font>**<font style="color:rgb(64, 64, 64);">生命周期不同和作用域不同：</font>**<font style="color:rgb(64, 64, 64);">数据只在当前浏览器标签页有用，</font>**<font style="color:#DF2A3F;">关闭标签页会导致数据清除，刷新标签页仍会保留数据，且不同标签页之间的 SessionStorage 不共享</font>**<font style="color:rgb(64, 64, 64);">，同样遵守</font>**<font style="color:rgb(64, 64, 64);">同源策略。</font>**

**<font style="color:rgb(64, 64, 64);">适用场景</font>**<font style="color:rgb(64, 64, 64);">：存储一些</font>**<font style="color:rgb(64, 64, 64);">临时性的、不需要长期保存的信息，</font>**<font style="color:rgb(64, 64, 64);">例如：</font>

+ <font style="color:rgb(64, 64, 64);">一个多步骤表单的当前填写状态（防止意外刷新导致数据丢失）。</font>
+ <font style="color:rgb(64, 64, 64);">不需要长期保存的中间过程数据。</font>

<font style="color:rgb(64, 64, 64);"></font>

<font style="color:#DF2A3F;">如何解决两个 Storage 的同步操作大量数据造成页面阻塞的问题？</font>

1. 控制存储数据的大小和频率，避免一次性存入大量数据。
2. 对大数据量进行分批存储或只存储必要信息。
3. 可以将耗时的数据处理（如序列化、压缩）放到 Web Worker 中，处理完再存入 storage。
4. 如果需要异步存储，可以考虑使用 IndexedDB，它支持异步 API，适合大数据量和复杂结构。

# IndexedDB
<font style="color:rgb(64, 64, 64);">一个完整的、</font>**<font style="color:rgb(64, 64, 64);">异步的</font>**<font style="color:rgb(64, 64, 64);">、</font>**<font style="color:rgb(64, 64, 64);">非关系型（NoSQL）</font>**<font style="color:rgb(64, 64, 64);"> 浏览器内数据库，可以存储大量结构化数据（包括文件、二进制大型对象 Blob）。容量巨大，所有操作都是异步的，</font>**<font style="color:rgb(64, 64, 64);">不会阻塞浏览器的主线程和UI</font>**<font style="color:rgb(64, 64, 64);">，性能更好，同样遵循</font>**<font style="color:rgb(64, 64, 64);">同源</font>**<font style="color:rgb(64, 64, 64);">策略。</font>

```javascript
// 1. 打开/创建数据库
const request = indexedDB.open('MyDatabase', 1);

// 2. 处理成功和错误事件
request.onerror = (event) => { ... };
request.onsuccess = (event) => {
  const db = event.target.result;
  // 数据库打开成功
};

// 3. 在版本升级事件中创建对象仓库（类似表）
request.onupgradeneeded = (event) => {
  const db = event.target.result;
  const store = db.createObjectStore('books', { keyPath: 'id' }); // 创建仓库
  store.createIndex('by_title', 'title', { unique: false }); // 创建索引
};

// 4. 后续可以进行增删改查等事务操作（代码较复杂，此处略）
```

**<font style="color:rgb(64, 64, 64);">适用场景</font>**<font style="color:rgb(64, 64, 64);">：</font>

+ <font style="color:rgb(64, 64, 64);">存储大量结构化数据（如离线应用的全部数据、用户生成的文档）。</font>
+ <font style="color:rgb(64, 64, 64);">需要高性能搜索和查询的大型数据集。</font>

