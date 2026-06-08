
# 杂

`javac` 命令用来将 .java 代码编译为 .class 字节码；`java` 命令用来将 .class 字节码跑在 jvm 虚拟机上。

# 字符拼接为字符串

在Java中，将多个字符拼接成字符串，最推荐使用 `String.valueOf()` 结合 `+` 运算符，或使用 [StringBuilder](https://cloud.tencent.com/developer/article/2484940) 以保证代码清晰和高性能。对于字符数组，直接使用 `new String(char[])` 是最快捷的方式。

以下为您整理了几种最常用的拼接方式，您可以根据具体场景进行选择：

## 1. 快捷转换：直接使用 `String` 构造方法

如果字符都在一个数组中，直接将其包装成 `String` 对象是最高效的方法。

```java
char[] chars = {'H', 'e', 'l', 'l', 'o'};
String str = new String(chars);
```

## 2. 空字符串 `""` 拼接（适合少量字符）

通过双引号将字符转为字符串并相加是最直观的写法。

- 注意： 单个字符之间直接相加会触发 ASCII 码数值相加，必须使用 `"" + 字符` 的形式让 Java 自动识别为字符串。

```java
char c1 = 'A';
char c2 = 'B';
String str = "" + c1 + c2; // 结果为 "AB"
```

## 3. `StringBuilder`（适合循环或大量拼接）

当需要拼接的字符较多或在循环中频繁拼接时，使用可变字符序列性能最好。

```java
StringBuilder sb = new StringBuilder();
sb.append('J').append('a').append('v').append('a');
String str = sb.toString();
```

## 4. `String.join` 或 `StringJoiner`（适合带分隔符）

如果多个字符需要用特定的连接符（如逗号）隔开，可以使用 Java 标准库提供的方法。

```java
// 使用 String.join
String str = String.join(",", "A", "B", "C"); // 结果为 "A,B,C"
```

---

# 字符串和数组的常见方法

Java 中的数组和字符串操作与 TypeScript 有一些核心差异，尤其是 **String 在 Java 中是不可变对象（Immutable）**，而 **数组的长度是固定的**。并且 Java 提供了一个专门的工具类 `java.util.Arrays` 来操作数组。

为你整理的 Java 数组与字符串常见方法总结表：

|**数据分类**|**方法 / 属性**|**功能描述**|**考试避坑提示 & TS 对比**|
|---|---|---|---|
|**String (字符串)**|`length()`|返回字符串的长度|**易错点：** Java 字符串求长度是**方法**，必须带括号 `str.length()`；TS 中是属性。|
||`charAt(int index)`|返回指定索引处的字符 (`char`)|类似于 TS 的 `str[index]` 或 `charAt()`。|
||`substring(int begin, int end)`|截取子串（包含 `begin`，不包含 `end`）|等同于 TS 的 `substring`。注意 Java 没有 `slice` 方法。|
||`equals(Object anObject)`|比较两个字符串的**内容**是否相等|**考试必考：** 比较字符串内容**必须**用 `equals()`。Java 中的 `==` 比较的是内存地址；TS 中用 `===` 比较内容。|
||`equalsIgnoreCase(String str)`|忽略大小写比较字符串内容|专门用于不区分大小写的比较，非常实用。|
||`indexOf(String str)`|返回子字符串首次出现的索引|找不到返回 `-1`，与 TS 一致。|
||`split(String regex)`|根据正则表达式将字符串分割为数组|返回 `String[]` 数组。与 TS 行为基本一致。|
||`trim()`|去除字符串首尾的空白字符|与 TS 一致。|
||`toCharArray()`|将字符串转换为字符数组|返回 `char[]`。在需要频繁修改字符时常用（TS 一般用 `split('')`）。|
||`replace(CharSequence target, ...)`|替换指定的字符或字符串片段|Java 会替换**所有**匹配的片段；TS 的 `replace` 默认只替换第一个。|
|**Array (数组基础)**|`.length`|获取数组的容量大小|**易错点：** Java 数组获取长度是**属性**，不带括号 `arr.length`。|
||`arr[index]`|访问或修改数组元素|与 TS 一致，但如果索引越界，Java 会抛出严格的 `ArrayIndexOutOfBoundsException` 异常，而 TS 会返回 `undefined`。|
|**Arrays 工具类**<br><br>  <br><br>`java.util.Arrays`|`Arrays.toString(type[] a)`|将一维数组内容格式化为字符串|**考试必考：** 直接打印 Java 数组 `System.out.println(arr)` 会输出内存地址（如 `[I@1b6d3586`），必须用此方法转成可视字符串。|
||`Arrays.sort(type[] a)`|对数组元素进行升序排序|直接修改原数组。比 TS 的 `sort()` 更聪明，TS 默认按字符串排序，Java 会根据数值大小正确排序。|
||`Arrays.copyOf(type[] original, ...)`|复制指定数组，截取或用默认值填充|因为 Java 数组长度不可变，扩容或缩容时通常用此方法生成一个**新数组**。|
||`Arrays.equals(type[] a, type[] a2)`|比较两个数组的**内容**是否完全一致|与字符串同理，比较两个数组的内容不能用 `==`。|
||`Arrays.fill(type[] a, type val)`|将数组的所有元素替换为指定值|与 TS 的 `fill()` 行为一致。|
||`Arrays.binarySearch(type[] a, ...)`|使用二分查找法搜索指定值的索引|**前提条件：** 数组必须先经过 `Arrays.sort()` 排序，否则结果不确定。|

在应对学校的代码阅读或填空题时，牢记 **“String 用 `length()`，Array 用 `.length`”** 以及 **“判断相等永远用 `equals` 而不是 `==`”**，这两个陷阱几乎是所有初级 Java 考试的必考点。对于数组的各种复杂操作，遇到需要排序、比对、打印时，第一时间联想导入 `java.util.Arrays` 这个工具类。

---
# 常见代码片段

scanner 输入：
```java
import java.util.Scanner;

public class Main {
    public static void main(String[] args) {
        Scanner scanner = new Scanner(System.in); // 创建Scanner对象
        System.out.print("Input your name: "); // 打印提示
        String name = scanner.nextLine(); // 读取一行输入并获取字符串
        System.out.print("Input your age: "); // 打印提示
        int age = scanner.nextInt(); // 读取一行输入并获取整数
        System.out.printf("Hi, %s, you are %d\n", name, age); // 格式化输出
    }
}

```

java 中的 for each 遍历：
```java
public class Main {
    public static void main(String[] args) {
        int[] arr = {1, 2, 3, 4, 5};

        for (int n : arr) {
            System.out.println(n);
        }
    }
}
```

java 中的倒序排列：
```java
import java.util.Arrays;

public class SortTest {
    public static void main(String[] args) {
        Integer[] numbers = {5, 2, 8, 1, 9};
        
        // (v1, v2) -> v2 - v1 表示降序排列
        // lambda 只有一行代码时，可省略 {} 和 return 关键字
        Arrays.sort(numbers, (v1, v2) -> v2 - v1);
        
        System.out.println(Arrays.toString(numbers)); 
        // 输出结果: [9, 8, 5, 2, 1]
    }
}

```