# 模块系统

在 js 中，一个 .js 文件就是一个模块；但是在 go 中，一个文件夹（目录）才是一个模块或者说包。比如 user 文件夹下有 a.go 和 b.go，只要它们第一行都声明了 package user，那么它们里面的变量和函数是完全共享的。a.go 可以直接调用 b.go 里的函数，不需要任何 import。

# 指针

好久没涉及过指针这个概念了哈哈哈

```go
// 基础用法
package main

func change(pointer *int) int {
	*pointer = 999
	return *pointer
}

func main() {
	foo := 1
	change(&foo)

	println(foo)
}

// 经典的交换数值函数

package main

func change(p1, p2 *int) {
	var tmp = *p1
	*p1 = *p2
	*p2 = tmp
}

func main() {
	foo := 1
	bar := 9
	change(&foo, &bar)
	println(foo, bar)
}
```

# defer

一个比较有意思的关键字，可以通过将函数推入执行栈来控制函数的执行时机

```go
package main

func func1() {
	println("func1")
}

func func2() {
	println("func2")
}

func call() {
	func1()
	func2()

}

func defer_call() {
	defer func1()
	defer func2()
}

func main() {
	// call() 本来是 1，2
	defer_call() // 变成了 2，1
}
```

如果一个函数中又有 defer 又有 return，先执行 return 语句，再执行 defer

# 切片

```go
package main

func append_with_1(slice []int) []int {
	slice = append(slice, 1)
	return slice
}

func main() {
	slice1 := make([]int, 3)
	slice1 = append_with_1(slice1)

	for _, value := range slice1 {
		println(value) // 0, 0, 0, 1
	}
}
```

## 深拷贝一个切片

由于 Go 中的切片就像 JS 中的动态数组一样，当你通过 `slice2 := slice1` 这样的去赋值时，复制的是一个引用，改变一个切片会影响另外一个切片

可以通过 make 和 copy 深拷贝一个切片

```go
package main

func main() {
	slice1 := []int{1, 2, 3}
	slice2 := make([]int, len(slice1))

	copy(slice2, slice1)
	slice2[2] = 4
	println(slice1[2]) // 3
}
```

## 切片的底层结构和扩容机制

切片底层是一个包含三个字段的结构体：指针 (array)、长度 (len)、容量 (cap)。

当调用 append 时，Go 运行时（Runtime）会根据当前切片的容量（cap）是否够用，采取两种截然不同的策略：

情况 A：容量够用（len < cap）

- 假设你的切片长度是 2，但底层数组的容量是 4。

- append 会直接通过指针找到底层数组的第 3 个位置。

- 把新元素放进去。

- 把切片结构体的 len 加 1（变成 3）。

结果：没有开辟新内存，极速完成。

情况 B：容量不够了（len == cap） —— 触发扩容
这是 append 最复杂、也最消耗性能的动作。如果底层数组已经塞满了，Go 会怎么做？

- 申请新内存：Go 会在内存中寻找一块更大的连续空间，创建一个新的底层数组。

- 复制旧数据：把老数组里的数据原封不动地拷贝到新数组里。

- 追加新数据：把你要 append 的新元素放在新数组的末尾。

- 生成新切片：返回一个全新的切片结构体，它的指针指向了新数组，len 增加了，cap 也变大了（通常为原来容量的两倍）。

```go
package main

import "fmt"

func main() {
	slice := []int{1, 2, 3}
	fmt.Printf("len: %v, cap: %v\n", len(slice), cap(slice)) // len: 3, cap: 3

	slice = append(slice, 4)
	fmt.Printf("len: %v, cap: %v\n", len(slice), cap(slice)) // len: 4, cap: 6
}
```

## append 方法的注意事项

**为什么必须写成 s = append(s, x)？**

既然 append 有时候直接修改底层原数组，为什么它不能像 JS 的 arr.push(x) 那样，直接在原变量上操作，而必须要求我们把返回值重新赋值给 s 呢？

根本原因有两个：

1. 应对扩容：如果触发了上面提到的“情况 B”，底层数组的内存地址变了！如果你不接收返回值，你的老变量 s 就永远指着那块被废弃的旧内存。

2. Go 是值传递：你传给 append 函数的切片外壳，只是一个副本。就算底层数组没换（情况 A），副本的 len 变了，老变量的 len 没变。如果不重新赋值，你在用老变量时，它是“看”不到新加进来的元素的。

# Map

map 的赋值和访问方式居然是和 JS 中的对象属性的动态访问一样....

```go
package main

import "fmt"

func main() {
	hash_map := make(map[string]any, 10)
	hash_map["one"] = "hasono" // 赋值
	fmt.Print(hash_map["one"]) // 访问

	// 也可以采用如下方式方便地在创建 map 的同时赋值
	hash_map := map[string]any{
		"one": "hasono",
		"two": "cell",
	}
	fmt.Print(hash_map["one"])
}
```

# 结构体

type 关键字和结构体的定义：

```go
// 具名结构体
type Person struct {
	name string
	age  int
}

// 匿名结构体
tempUser := struct {
        Name string
        Age  int
    }{
        Name: "Bob",
        Age:  28,
    }
```

go 没有 ts 中的联合类型这种东西，就是说你不能写 `type ID = number | string` 这种代码，go 中的 type 相当于就是简单地给一个类型起个名字，比如 `type myint int` 这样子。为什么？其实最核心的就是 go 不像 ts 是一门解释型语言，作为静态编译型语言，一个变量在声明的那一刻，它在内存里的内存布局就必须是百分之百确定的（string 占多大，int 占多大，完全不同）。所以一个变量不能在编译的时候既是 int 类型又是 string 类型，自然也就没有了联合类型。

## 结构体作为函数参数

go 中的结构体在作为函数参数被传递的时候，默认传递的是值的拷贝，或者说 go 的函数传参永远、永远、永远是“拷贝一份值”进去。要想修改原有的结构体，就得传一个指针。这和 js 很不一样，js 函数传参时默认传递的是值的引用，这使得在函数中可以直接修改原对象。

```go
type Person struct {
	name string
	age  int
}

func changeName(person *Person) {
	(*person).name = "jame"
}

func main() {
	person := Person{
		name: "hasono",
		age:  18,
	}

	changeName(&person)
	fmt.Println(person.name) // jame
}
```

这里其实有一个十分关键的点：**既然 go 的函数参数默认传递的是值的拷贝，为什么 slice 和 map 这两种类型当作函数参数传递的时候在函数中可以直接修改原有的值？**

这是因为 slice 和 map 这两种类型本身就是一个包含了指针的数据结构。slice 是一个包含了指针（指向底层真正的数组）的结构体，而 map 本身就是一个指针（指向真正的 hash map）。所以即使传参时指针的值被完整拷贝了一遍，但是指针的指向依旧不变，仍然是之前的那个数据。所以在函数中，凭借拷贝后的指针，仍然能找到原有的数据并修改。

## 为结构体挂载方法

go 里面想要为结构体挂载方法，和 js / python 的做法很不一样，相比起在 class { ... } 大括号里面写方法的 js 和 python 来说，go 里面的数据（结构体）和行为（方法）是完全解耦的。

这种挂载在函数名前面的参数，有一个专属名词叫做 “接收器”（Receiver）。并且 go 里面一般不用 this 或者 self 来命名这个 receiver，而是用这个结构体的小写首字母来命名。

此外，和前面我们讲过的函数传参的规则一样，这里的 receiver 接收的也是该结构体实例的值的复制，要想在一个方法中修改实例，还是得传一个指针。

```go
type Person struct {
	name string
	age  int
}

func (p Person) Greet() {
	fmt.Println("hello", p.name)
}

func (p *Person) SetName(newName string) {
	(*p).name = newName
}

func main() {
	person := Person{
		name: "hasono",
		age:  20,
	}

	person.Greet() // hello hasono
	person.SetName("jame")
	person.Greet() // hello jame
}
```

## 封装，继承和多态

### 封装

在 go 中，通过控制属性名和方法名首字母的大小写，来确定其是否私有，是否能被外部 package 访问。

### 继承

go 中的继承很简单，不需要 js 那样的 super() 方法，直接在定义子类的同时将父类写在里面就行。

```go
type Animal struct {
}

type Dog struct {
	Animal // 这样就实现了 Dog 对 Animal 类的继承
}
```

### 多态

通过 interface 关键字实现了多态。一个 interface 类型的变量本质是装着两个指针的的一个结构体，一个指针指向具体的类型，另一个指针指向真实的数据。

go 的 interface 具有了鸭子类型的特点，由于 interface 只定义方法签名，只要某个结构体实现了某个接口里面的全部方法，那么 go 就会认为这个结构体实现了该接口。

在 go 中你也可以先初始化一个 interface 变量，随后进行“接口赋值”操作。

```go
package main

import "fmt"

// 定义一个接口 Speaker
// 它不关心你是谁，只要拥有 Speak 方 就行
type Speaker interface {
    Speak() string
}

// 定义两个互不相干的结构体
type Dog struct {
    Name string
}

type Cat struct {
    Name string
}

// 为 Dog 挂载方法
func (d Dog) Speak() string {
    return "汪汪汪！我是 " + d.Name
}

//  为 Cat 挂载方法
func (c Cat) Speak() string {
    return "喵喵喵！我是 " + c.Name
}

// 这个函数只接收 Speaker 接口类型，不关心具体是猫是狗
func MakeItSound(s Speaker) {
    fmt.Println(s.Speak())
}

func main() {
    dog := Dog{Name: "旺财"}
    cat := Cat{Name: "汤姆"}

    // dog 和 cat 都能传入这个函数
    MakeItSound(dog)
    MakeItSound(cat)


	// 这里可能会有些疑问：既然 interface 类型的变量是一个结构体，为什么一个地址值可以直接赋值给一个接口？
	// 实际上 go 的编译器会自动构造为一个结构体，再将这个地址值填进去
	// 比如这里，它把 *Dog 这个类型标识填进了 interface 的类型指针，再把 &dog 这个真实地址填进了数据指针。
	var speaker Speaker
	speaker = &dog
	fmt.Println(speaker.Speak())

	// 当你后续调用 speaker.Speak() 的时候：
	// go 会先去查类型指针，看看这个类型到底有没有 Speak 方法。
	// 找到方法后，go 会把数据指针里的真实数据地址拿出来，喂给这个方法执行。
}
```

### 万能类型和类型断言

interface 还能用作万能类型，类似于 ts 中的 any。通过类型断言来实现类型收窄。更现代的写法是将 `interface {}` 直接写作 `any`

其实 interface {} 能用作万能类型并不难理解。一个空接口，其结构体内没有存储任何东西，自然也就能代表任何东西。

```go
// 这里也可以直接写 any
func Test(arg interface{}) {
	fmt.Println("function is called...")
	fmt.Println(arg)

	// 为 arg 参数做类型断言
	value, ok := arg.(string)
	if ok {
		fmt.Printf("arg is string type, arg = %v", value)
	}
}
```

# 反射

## pair

要想了解 go 中的反射必须要了解 pair 这个概念。在 go 中，任何一个变量在底层都包含着一个 (type, value) 的配对。

```go
var name string = "hasono"
// 此时 name 的 pair 是 (string, "hasono")

var box any = name
// box 作为一个 interface，它会把 name 的整个 pair 完完整整地记录下来。所以，此时 box 内部的 pair 依然是 (string, "hasono")
```

通过 pair，go 语言实现了及其优雅的 type switch，不用再通过 if ok 一个个地收窄类型：

```go
package main

import "fmt"

// 接收一个 any
func CheckType(box any) {
    // 语法：box.(type)
    switch v := box.(type) {
    case int:
    case string:
    case bool:
    default:
    }
}
```

## reflect

在计算机科学中，“反射（Reflection）”的核心定义是：程序在运行时能够检查、修改自身结构和行为的能力。js 本身就是动态语言，它不需要专门的反射工具；而 go 天生的强静态类型，必须靠反射才能在程序运行中获取到类型和数据信息。

通过 TypeOf 和 ValueOf 来获取一个变量的 pair 中的 type 和 value

```go
package main

import (
	"fmt"
	"reflect"
)

type User struct {
	Name string
	Age  int
}

func main() {
	user := User{
		Name: "hasono",
		Age:  20,
	}

	t := reflect.TypeOf(user)
	v := reflect.ValueOf(user)
	fmt.Println(t, v)
}
```

## tags

tags 是添加在结构体每个字段中的一些 key-value 结构的 meta 数据，和 python 中的 Annotation 设计类似。

tags 的出现主要是为了解决如下问题：比如某个接口要求返回的 json 格式是 {"username": "Alice", "age": 20}（全小写）。但你在 go 里只能定义 Name 和 Age（全大写，不然就会变成私有属性无法被外部访问）。如果你直接把结构体转成 json，输出的会是 {"Name": "Alice", "Age": 20}，也就和之前的要求相冲突了。此时有了 tags，各种底层库在处理结构体字段时，就有了额外的元信息，知道具体该怎么做。

```go
type User struct {
    Name string `json:"username"`
    Age  int    `json:"age,omitempty"`
    Email string `json:"email" gorm:"column:user_email"`
}
```

在 go 生态里到处都能看到标签的身影：

- json/xml 序列化：json:"name" （最常见）

- orm：gorm:"primaryKey;column:user_id" （定义主键和表列名）

- 参数校验（如 validator 库）：binding:"required,min=5,max=10" （告诉校验框架，这个字段必填，且长度在 5-10 之间）

- 配置文件解析（如 viper 库）：yaml:"server_port" mapstructure:"port"

下面的代码展示了如何解析 tags

```go
package main

import (
    "fmt"
    "reflect"
)

type User struct {
    Name  string `json:"username" db:"user_name"`
    Age   int    `json:"age,omitempty"`
    Email string `json:"email" validate:"required"`
}

func main() {
    user := User{}
    t := reflect.TypeOf(user)
    // 遍历结构体里到底有几个字段 (NumField)
    for i := 0; i < t.NumField(); i++ {
        // 拿到第 i 个字段的所有元数据 (名字、类型、标签等)
        field := t.Field(i)
		// 获取 Tags 信息
        jsonTag := field.Tag.Get("json")
        dbTag := field.Tag.Get("db")

        // 打印结果
        fmt.Printf("Go 字段名: %-5s | JSON 标签: %-15s | DB 标签: %s\n",
            field.Name, jsonTag, dbTag)
    }
}
```

# goroutine 和 channel

## goroutine

相比起 js 的非阻塞异步 I/O 的并发模型，go 的并发模型非常简单粗暴：需要有 n 个任务并发？那我就让 n 个任务多线程同时执行。但是这里的多线程并不是直接对应到了操作系统层面的多线程（那样资源开销太大了），实际上，在操作系统的 m 个线程和一个 go 进程本身，由 go 的 runtime 虚拟了一个 goroutine 层，这一层可以由一个协程调度器调度出来 n 个无比轻量（只有几 kb）的协程（goroutine），让这些协程去一对一地处理每一个并发任务。就算某一个任务长时间阻塞了，也只会影响那一个协程而非其它协程。这样既不会大幅度占用操作系统的线程资源，又真正意义上实现了并发。**这就是 Go 非常著名的 GMP 模型**

通过 go 关键字来创建一个协程，下面的代码中 main 和 goroutine 的 i 将会交替并行打印；此外，可以通过 runtime 包中的 Goexit 函数退出一个协程。

```go
package main

import (
	"fmt"
	"time"
)

func task() {
	i := 0

	for {
		i++
		fmt.Printf("goroutine: %d times\n", i)
		time.Sleep(1 * time.Second)
	}
}

func main() {
	go task()

	i := 0

	for {
		i++
		fmt.Printf("main: %d times\n", i)
		time.Sleep(1 * time.Second)
	}
}
```

## channel

在协程之间通过 channel 来通信。通过 make 来创建一个 channel

```go
package main

import (
	"fmt"
)

func main() {
	c := make(chan int)

	go func() {
		defer fmt.Println("goroutine done...")
		fmt.Println("goroutine begin...")
		c <- 100
	}()

	data := <-c

	fmt.Printf("the data from goroutine is: %d\n", data)
	fmt.Println("main done...")
}
```

值得注意的是：**无缓冲通道的 channel 是具有阻塞性**的，也就是说不管怎么样，如果接收方先执行到了 channel 传递消息的语句而发送方还没有执行到，那么接收方会一直阻塞直到发送方执行语句并发送消息过来；反之，如果发送方先执行了传递消息的语句而接收方还没来得及接收，那么发送方也会一直阻塞直到接收方收到消息。

## range

range 关键字可以遍历 go 中的任何数据类型，包括 slice，map，channel 等。通过 range 遍历时，得到的 value 永远是值的拷贝，这符合 go 一贯的设计风格。

通过 range 遍历 channel 还有一个好处就是，当 channel 被关闭(close)时，range 会自动退出。不用手动写 `data, ok := <-c` 的形式。

```go
package main

import (
    "fmt"
)

func main() {
    c := make(chan int, 3)

    go func() {
        for i := range 3 {
            c <- i
            fmt.Printf("第 %d 个数据已发送...\n", i+1)
        }
        close(c)
    }()

    for data := range c {
        fmt.Println(data)
    }
}
```

## select

select 语句用于处理多个 channel 的操作。它会阻塞当前协程直到某个 channel 有数据可读。也就是说，只要哪个 channel 返回数据更快，select 就会执行对应的 case。

- 如果 select 语句中有多个 channel 都可以通信（一样快），select 会随机选择一个。

- 如果 select 语句中有 default 分支，当没有 channel 准备好通信时，会执行 default 分支。

```go
package main

import (
    "fmt"
    "time"
)

func main() {
    ch1 := make(chan string)
    ch2 := make(chan string)

    go func() {
        time.Sleep(2 * time.Second)
        ch1 <- "from channel 1"
    }()

    go func() {
        time.Sleep(1 * time.Second)
        ch2 <- "from channel 2"
    }()

    select {
    case msg1 := <-ch1:
        fmt.Println(msg1)
    case msg2 := <-ch2:
        fmt.Println(msg2) // 因为 ch2 更快，程序会走这个分支
    }
}
```

# 目录结构

go 最经典的目录结构由 cmd, internal, pkg 这三部分组成

cmd 作为整个应用的主入口，通常只包含 main.go，其逻辑非常简单，通常只负责读取配置、初始化数据库连接、然后调用其他包把服务启动起来。绝对不要把业务逻辑写在 cmd 里。

internal 用来存放一个项目的核心业务逻辑。只要一个文件夹的名字叫 internal，除了这个项目本身的代码，任何外部项目都无法访问和使用。

```text
my-project/
└── internal/
    ├── handler/   # 处理 HTTP 请求的 Controller
    ├── service/   # 核心业务逻辑 (如下单、扣库存)
    └── model/     # 数据库结构体
```

pkg 用来存放整个代码库的公共代码部分，比如一些工具函数，并且外部也可直接导入并使用 pkg 中的代码。

```text
my-project/
└── pkg/
    ├── logger/    # 极其好用的日志封装
    └── encrypt/   # 通用的加解密工具
```

# net 

go 的 net 模块，本质上就是对操作系统底层 Socket API（如 C 语言的 socket(), bind(), listen(), accept(), read(), write()）的面向对象封装。

## net 模块的三大核心 API 拆解

一：`net.Listen("tcp", ":8888")` -> 绑定端口与监听 Socket
底层行为：这行代码对应操作系统的 bind() 和 listen() 系统调用。

物理意义：程序向操作系统内核申请占用本机的 8888 端口。内核会为该端口分配一块内存缓冲区，并将该 Socket 的状态设置为 LISTEN（监听状态）。此时，服务器准备好接收来自客户端的 TCP 三次握 的 SYN 报文。

---

二：`conn, err := listener.Accept()` -> 接收 Connection
底层行为：对应操作系统的 accept() 系统调用。

物理意义：当一个客户端发起连接，并且在操作系统内核层面完成了完整的 TCP 三次握手后，内核会将这个连接放入一个叫做“全连接队列（Accept Queue）”的数据结构中。

阻塞机制：Accept() 方法的核心特性是同步阻塞。如果内核的全连接队列为空（即没有新客户端连进来），执行到这行代码的 Goroutine 会被挂起，让出 CPU 执行权，直到队列中出现新的已完成握手的连接才会被唤醒并返回一个 net.Conn 对象。也就是说，Accept 方法返回的是 TCP 三次握手的一个**结果**。

---

三：`net.Conn` -> 已建立的 TCP 连接
底层行为：它内部包裹了由 accept() 返回的全新的、专门用于和该客户端通信的文件描述符（FD）。

数据结构：TCP 是面向连接的、可靠的字节流协议。net.Conn 实现了 Go 的 io.Reader 和 io.Writer 接口，通过它发送和接收的只能是纯粹的二进制字节数组（[]byte）。

---

再对上面介绍的三点进行总结和凝练：

1. 一个服务器要处理网络请求，就先得在自身这台计算机上选一个端口来监听请求是否到来，即首先通过 net.Listen() 方法以 tcp 的方式监听一个 address（由 ip 和 port 组成）。

2. 监听之后会返回一个 listener 作为句柄，通过 Accept() 方法阻塞当前协程，一直等待某一个请求到来，一旦来了新请求并在操作系统层面完成了 tcp 三次握手，Accept 方法就返回握手结果，即返回一个新建立的 connection 句柄。

3. 通过 connection 句柄再去解析网络中传输的字节流，解析数据，并处理业务逻辑。



# sync

channel 擅长的是**控制数据流转和信号传递**；而 sync 包擅长的是**保护结构体内部的共享状态免受数据竞争的破坏**。两者在底层的实现原理不同，应用场景也完全互补。为什么 js 没有类似的 api？原因就在于 js 作为单线程语言，其执行的各种操作本身就是原子性的。

---

一：`sync.Mutex` (互斥锁)

**物理意义**：用于保护一段代码或数据，在同一时刻只能被**唯一一个** Goroutine 访问。这段被保护的代码在操作系统中被称为**临界区（Critical Section）**。

**底层机制**：当 Goroutine A 调用 `mu.Lock()` 成功获取锁后，如果 Goroutine B 执行到 `mu.Lock()`，B 会被 Go Runtime 挂起（陷入阻塞），直到 A 执行 `mu.Unlock()`，B 才会被唤醒并尝试抢锁。

---

二：`sync.RWMutex` (读写锁)

这是对标准互斥锁在特定场景下的**性能优化方案**。

**物理意义**：读写锁将访问权限做了严格的隔离。它允许多个 Goroutine **同时**进行读操作，但写操作依然是绝对互斥的。

**触发条件（读多写少）**：

- **读锁 (`RLock`)**：只要当前没有人在写，无数个协程可以同时拿到读锁，优化并发读取的性能。
- **写锁 (`Lock`)**：一旦有人要写，必须等待所有正在读的人结束；且写的时候，任何人不能读，也不能写。

---

三：`sync.WaitGroup` (等待组)

类似于 js 中的 `Promise.all`

**物理意义**：它底层维护着一个**并发安全的原子计数器（Atomic Counter）**。主协程通过判断这个计数器是否归零，来决定是阻塞等待，还是放行。

**三大核心 API**：

- `.Add(n)`：在主协程中调用，表示有 n 个并发任务要执行（计数器 +n）。
- `.Done()`：在子协程的末尾调用，表示当前任务完成（计数器 -1，本质是 `.Add(-1)`）。
- `.Wait()`：在主协程中调用，阻塞当前协程，直到计数器严格等于 0。

---

四：`sync.Once` (绝对单次执行)

专门解决多线程环境下的**懒加载（Lazy Initialization）**或**单例模式（Singleton Pattern）**问题。

**物理意义**：无论你有 1 个协程还是 10 万个协程同时调用某段代码，`sync.Once` 在底层能通过双重检查机制（Double-Checked Locking）和原子操作（Atomic Load/Store），保证传入的函数**在整个程序的生命周期内，只被执行严格的 1 次**。



### 总结与工程边界

在 Go 的严谨工程开发中：

1. **控制流的同步、任务的分发、超时掐断**：首选 `Channel`。
2. **保护一个 `map`、修改一个共享的 `struct` 字段**：毫无疑问，使用 `sync.Mutex` 或 `sync.RWMutex`。
3. **等待一批 Goroutine 聚合结果**：使用 `sync.WaitGroup`。

既然我们聊到了并发访问共享内存最容易导致的致命问题——**数据竞争（Data Race）**（即两个协程在没有任何锁保护的情况下，同时修改同一个内存地址，导致数据错乱或程序崩溃）。

**你想知道 Go 语言的工具链提供了一个什么样极其逆天的“黑科技”指令，能够让你在测试阶段，精准地将代码中哪怕藏得再深的 Data Race 给当场“抓获”并打印出精确的堆栈信息的吗？**