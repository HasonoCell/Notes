本文主要就是探讨 Promise 的更多用法。在平常我们接触 Promise，可能更多时候是去处理一个现成的 Promise， 比如某个 fetch、setTimeout 函数返回的东西，我用 `.then()`或者 `await` 处理结果，大部分人的认知仅限于此。



然而，Promise 能做的远不止这些，在 JavaScript 这门单线程语言中，要想实现复杂的代码执行流程的控制，Promise 以及微队列是绝佳的原生任务调度原语，通过 Promise 控制微队列，可以实现非常复杂的任务调度流程。想要对 JS 的异步编程有更深入的理解，<font style="color:#DF2A3F;">就必须从“被动处理 Promise”转变为“主动使用 Promise”</font><font style="color:#000000;">。</font>

<font style="color:#000000;"></font>

**基础知识复习：**

在正式开始之前，我们先来复习一下一些 Promise 的基础知识，这些知识在后续的代码中都会有所体现。

1. `Promise` 代表一个异步任务的结果，不管该异步任务是否有返回值，都会返回一个 Promise
2. 通过 `Promise.resolve`，我们可以快速创建一个 `fulfilled`状态的 Promise
3. 在 `Promise.then(() => {})`中，只有前面的 Promise 从 `pending`状态变为 `settled`状态（即 `fulfilled`或者 `rejected`）之后，`then`中的回调才会被作为一个微任务推入微队列
4. 通过`(Promise.then()).then` 这样的形式，我们可以创建出一条 Promise 链，实现执行流程的前后顺序管理。
5. 每一个`then`返回的 Promise 的状态取决于里面的回调函数是否被执行完，如果回调函数返回的也是一个 Promise 且保持 `pending`，那么外层的 `then`返回的 Promise 也会保持`pending`

<font style="color:#000000;"></font>

<font style="color:#000000;">如下的例子，如果我不想更改两行代码之间的顺序，有什么办法先输出 first 再输出 second 呢？</font>

```typescript
console.log("second");
console.log("first");
```

答案是 Promise！仅仅只需要一行代码，我们就可以创建一个微任务，从而实现代码执行流程的控制：

```typescript
Promise.resolve().then(() => console.log("second"));
console.log("first");
```

从这个简单的例子，你就可以窥见 Promise 以及微任务管理任务流程的魔力，下面我们着重介绍更多 Promise 管理流程的代码与思考模式，而非 Promise 的基础用法介绍。



所谓控制任务流程，其实无非分为两个部分：串行和并发，其它任何复杂的功能，都可以看作是在这两个最基本的流程控制上进行扩展。那么通过 Promise 实现串行和并发两种模式也比较简单，具体如下：  


**串行：**

串行的核心就是，前一个任务做完之后，下一个任务才能开始执行，所以，我们可以自然而然地想到两个与 Promise 有关的东西：`.then`和 `await`，而后者可以看作是前者的一个语法糖。 通过构建一条 Promise 链，我们可以实现任务的串行执行，以下是两种常用的实现方法：

```typescript
// async/await
async sequence() {
    for (const task of tasks) {
      await task();
    }
  }

// .then 回调
  sequence() {
    return tasks.reduce((promise, task) => {
      return promise.then(task);
    }, Promise.resolve());
  }
```



**并行：**

并行的核心在于多个任务同时执行，通常我们使用 `Promise.all` 来管理多个异步任务执行的结果，常用以下代码实现：

```typescript
parallel() {
    const promises = tasks.map((task) => task());
    return Promise.all(promises);
  }
```

这里很多人会对 map 方法有误区，认为并发是通过 map 实现的，其实在这里，map 只是一个 task 数组元素的遍历器，和并发并无直接关系，JS 的“并发”通常是指：当短时间调用多个异步任务时，JS 主线程会将这些任务交给底层库（也可以说成是宿主环境），然后由底层库去真正地实现任务并行的能力（比如依靠多线程编程）。所以你只要短时间内<font style="color:#DF2A3F;">调用了</font><font style="color:#000000;">多个异步任务，那么 JS 的底层库就会帮你去做并发，以下两种调用方式都是可以的：</font>

```typescript
const promises = tasks.map((task) => task());
const promises = [task1(), task2(), task3()];
```



讲完了最基本的两种流程控制，我们就可以看一些综合案例，如下实现了一个 `TaskQueue`，实现基本的添加任务，串行执行和并行执行的能力。

```typescript
type Task = () => Promise<any>;

class TaskQueue {
  tasks: Task[];

  constructor() {
    this.tasks = [];
  }

  add(task: Task) {
    this.tasks.push(task);
    return this;
  }

  parallel() {
    const promises = this.tasks.map((task) => task());
    return Promise.all(promises);
    return this;
  }

  async sequence() {
    for (const task of this.tasks) {
      await task();
    }
    return this;
  }
}

const sleep = (ms: number) => {
  return new Promise((resolve) => setTimeout(resolve, ms));
};

const tq = new TaskQueue();
tq.add(() => sleep(3000).then(() => console.log("3s")))
  .add(() => sleep(6000).then(() => console.log("6s")))
  .sequence(); // 串行执行，一共等待 9s 执行两个任务
  // 也可以 .parallel 并行执行，只等待 6s 就执行了两个任务
```



搞懂下面的 `Scheduler`类，基于 Promise 的异步编程能力就可以说是比较强了

```typescript
type Task = () => Promise<any>;

class Scheduler {
  private prev: Promise<any>;

  constructor() {
    this.prev = Promise.resolve();
  }

  log(message: string) {
    this.prev = this.prev.then(() => console.log(message));
    return this;
  }

  wait(ms: number) {
    this.prev = this.prev.then(() => {
      return new Promise((resolve) => setTimeout(resolve, ms));
    });
    return this;
  }

  run(task: Task, timeoutLimit?: number) {
    this.prev = this.prev.then(() => {
      if (!timeoutLimit) {
        return task();
      }

      let timer: any;
      const taskPromise = task();
      const timeoutPromise = new Promise((_, reject) => {
        timer = setTimeout(() => {
          reject(new Error(`Timeout ${timeout}ms!`));
        }, timeout);
      });

      try {
        return Promise.race([taskPromise, timeoutPromise]);
      } finally {
        clearTimeout(timer!);
      }
    });
    return this;
  }

  parallel(tasks: Task[], parallelLimit?: number) {
    this.prev = this.prev.then(() => {
      if (!parallelLimit) {
        const promises = tasks.map((task) => task());
        return Promise.all(promises);
      }

      return new Promise((resolve) => {
        const total = tasks.length;
        const limit = Math.min(parallelLimit, total);
        const results: any[] = [];
        let taskId = 0;

        const workers = Array(limit)
          .fill(null)
          .map(async () => {
            while (taskId < total) {
              const currentId = taskId++;
              const task = tasks[currentId];
              try {
                results[currentId] = await task();
              } catch (error) {
                results[currentId] = error;
              }
            }
          });

        Promise.all(workers).then(() => resolve(results));
      });
    });
    return this;
  }

  retry(retryLimit: number, task: Task, delay?: number) {
    const attempt = async (retryLeft: number) => {
      try {
        return await task();
      } catch (error) {
        if (retryLeft === 0) {
          throw error;
        }

        if (delay) {
          await new Promise((resolve) => setTimeout(resolve, delay));
        }

        return attempt(retryLeft - 1);
      }
    };

    this.prev = this.prev.then(() => attempt(retryLimit));
    return this;
  }

  done(): Promise<any> {
    return this.prev;
  }
}
```

上面的`Scheduler.parallel`多适用于处理一个已知的、固定的任务集合。例如：并行请求页面所需的多个资源、并行处理一个文件夹下的所有文件。下面展示了另一种并发限制的实现，适用于任务源源不断或不可预知的场景，可以更灵活地添加任务并执行。<font style="color:#E4495B;">这两种方式都可以实现并发限制，各有各的使用场景。</font>

```typescript
type Task = () => Promise<any>;

const createLimitedPool = (limit: number) => {
  const queue: Task[] = [];
  let runningCount = 0;

  const runNext = async () => {
    if (!queue.length || runningCount >= limit) return;

    const task = queue.shift();
    if (!task) return;

    runningCount++;
    try {
      await task();
    } finally {
      runningCount--;
      await runNext();
    }
  };

  return function add(task: Task) {
    queue.push(task);
    runNext();
  };
};

// 创建一个并发限制为 2 的请求池
const add = createLimitedPool(2);

// 添加任务到池中
add(createTask(1, 1000)); // 立即执行
add(createTask(2, 800)); // 立即执行
add(createTask(3, 1200)); // 等待任务 2 完成后执行
add(createTask(4, 500)); // 等待任务 1 完成后执行
add(createTask(5, 900)); // 等待前面的任务完成后执行
```

**总结两种实现的适用场景：**

**工作者池（worker pool）实现**

+ 适合：任务数量固定，全部任务已知
+ 优点：代码简洁，逻辑清晰，易于维护

**RunningCount 标志位实现**

+ 适合：任务数量不确定，任务可动态添加
+ 优点：灵活，支持随时添加新任务，适合事件驱动或流式任务场景

