```javascript
const fetchData = () => {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve("Data from Internet!");
    }, 5000);
  });
};

function* generator() {
  const result = yield fetchData();
  console.log(result);
}

const gen = generator();
const result = gen.next();

result.value.then((data) => gen.next(data));
```

---

### 1. Promise：异步操作的标准化容器
**是什么？**  
Promise 是一个对象，它代表了一个异步操作的**最终完成（或失败）及其结果值**。它提供了一种标准化、链式的方式来处理异步操作，解决了传统回调函数“回调地狱”（Callback Hell）的问题。

**核心特点：**

+ **三种状态**：
    - `pending`：初始状态，既不是成功，也不是失败。
    - `fulfilled`：意味着操作成功完成。
    - `rejected`：意味着操作失败。  
（状态一旦改变，就不可再变。）
+ **链式调用（.then() & .catch()）**：`.then()` 方法返回一个**新的 Promise**，这使得你可以将多个异步操作串联起来，避免了层层嵌套。
+ **错误冒泡**：链中的任何一个 Promise 被拒绝（rejected），错误都会一直向下传递，直到被最近的 `.catch()` 捕获。

**代码示例：**

```javascript
function fetchUserData(userId) {
    return new Promise((resolve, reject) => {
        setTimeout(() => {
            if (userId === '123') {
                resolve({ name: 'Alice', age: 30 }); // 操作成功，传递结果
            } else {
                reject(new Error('User not found')); // 操作失败，传递错误
            }
        }, 1000);
    });
}

// 使用链式调用
fetchUserData('123')
    .then(user => {
        console.log('User:', user.name);
        return user.age; // 同步返回值会被自动包装为 resolved Promise
    })
    .then(age => {
        console.log('Age:', age);
    })
    .catch(error => {
        console.error('Error:', error.message); // 捕获链中任何错误
    });
```

**解决的问题：** 回调地狱，提供了更清晰、更可控的异步流程。  
**遗留的问题：** 虽然链式调用比嵌套回调好，但对于复杂的业务逻辑，仍然需要大量的 `.then()` 块，代码看起来依然不够“同步”和直观。

---

### 2. Generator：可以暂停和恢复的函数
**是什么？**  
Generator（生成器）是 ES6 引入的一种特殊函数，它可以通过 `yield` 关键字**暂停**函数的执行，并可以通过 `.next()` 方法**恢复**执行。它使用 `function*` 来声明。

**核心特点：**

+ **暂停与恢复**：函数执行到 `yield` 表达式时就会暂停，并将 `yield` 后面的值返回给调用者。下次调用 `.next()` 时，从上次暂停的地方继续执行。
+ **双向通信**：`.next(value)` 方法不仅可以恢复执行，还可以向 Generator 函数内部传入一个值，这个值会作为**上一个 **`yield`** 表达式整体的返回值**。这是实现 Async/Await 的关键。
+ **迭代协议**：Generator 对象同时也是可迭代对象（Iterator），可以用 `for...of` 循环处理。

**代码示例：**

```javascript
function* numberGenerator() {
    const a = yield 1; // 第一次next()，停在这里，返回{value: 1, done: false}。下次next(10)传入时，a = 10
    console.log(a); // 10
    const b = yield 2; // 继续执行，停在这里，返回{value: 2, done: false}。下次next(20)传入时，b = 20
    console.log(b); // 20
    yield 3;
}

const gen = numberGenerator();
console.log(gen.next());    // { value: 1, done: false }
console.log(gen.next(10));  // { value: 2, done: false }，并向函数内传入10
console.log(gen.next(20));  // { value: 3, done: false }，并向函数内传入20
console.log(gen.next());    // { value: undefined, done: true }
```

**带来的可能性：** 它提供了**控制异步流程**的能力（暂停等待异步操作完成，完成后再恢复）。但它本身不管理异步，需要外部代码（如执行器）来驱动。

---

### 3. Async / Await：异步编程的终极解决方案（语法糖）
**是什么？**  
Async/Await 是 ES2017 引入的语法，它建立在 Promise 之上，但让你能用**写同步代码的方式**来写异步代码。`async` 用于声明一个函数是异步的，`await` 用于等待一个 Promise 的解决（resolve）。

**核心特点：**

+ **同步风格**：代码是线性的，没有回调函数或 `.then()` 链，逻辑异常清晰。
+ **错误处理**：可以使用传统的 `try...catch` 块来捕获异步错误，这与同步代码的错误处理完全一致。
+ **基于 Promise**：任何一个 `async` 函数都会隐式返回一个 Promise 对象。`await` 后面通常是一个 Promise，如果不是，会被转成一个立即 resolved 的 Promise。

**代码示例：**

```javascript
// 基于上面的 fetchUserData Promise
async function getUserInfo() {
    try {
        console.log('Fetching user data...');
        const user = await fetchUserData('123'); // 函数在此“暂停”，直到Promise解决，结果赋给user
        console.log('User:', user.name);
        console.log('Age:', user.age);
        return user; // 等价于 return Promise.resolve(user)
    } catch (error) {
        console.error('Failed to get user:', error); // 用try-catch捕获reject的错误
    }
}

getUserInfo();
```

**解决的问题：** 彻底解决了异步代码的“可读性”和“可维护性”问题，是目前编写异步代码的最佳实践。

---

### 三者的内在联系与演进
它们的关系可以用一个完美的总结来概括：

**Async/Await 是 Generator 和 Promise 的组合的语法糖，其执行机制是 Generator 的，但其管理的值是 Promise 的。**

1. **Promise 是基础**：它代表了异步操作的**最终结果**。它是 Async/Await 的底层基石，`await` 等待的就是一个 Promise。
2. **Generator 是机制**：它提供了“**暂停函数执行**”和“**从外部注入值**”的能力。这正是 `await` 关键字所做的事情——它暂停了 `async` 函数的执行，等到 Promise 有结果后，再将结果注入回函数中，并恢复执行。
3. **Async/Await 是完美封装**：
    - 它**内部融合了 Generator 的暂停/恢复机制**。你可以把 `async function` 看作一个 Generator 函数。
    - 它**内置了一个自动执行器**。你不需要像使用 Generator 时那样自己写一个 `run` 函数去不停地调用 `g.next()`，JavaScript 引擎帮你做了这一切。
    - 它**强制规定 **`yield`**（即 **`await`**）后面的值必须是 Promise**。这让它的目的非常纯粹，专门用于处理异步。

**演进历程：**  
**回调函数 → Promise（管理异步结果） → Generator（提供控制能力） → Async/Await（结合二者优势，提供终极解决方案）**

