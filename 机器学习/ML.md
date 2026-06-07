# week1 & week2

## 概念解释

传统的机器学习（不包含深度学习）基本可以分为监督学习和无监督学习两大类，监督学习又可以分为分类和回归两大类，而无监督学习最主要的思路就是聚类。

比如我们有一组二维数据：日期，以及那个日期对应的气温。我们希望找到一个合适的函数，用日期作为输入，输出对应的预测气温。这个函数不一定要穿过每一个数据点，而是要尽可能描述这些数据背后的主要规律，这个过程就叫做“拟合”。

现实中的数据通常并不完美。有些气温记录可能因为测量问题偏高或偏低；也可能是因为我们只用了“日期”这个特征，而没有考虑湿度、气压、地理位置等其他因素，所以数据中会出现一些不规则波动。

> **延伸：数据在底层的三种形态表达**
>
> 1. **特征 (Feature)**：描述事物的单一维度或属性（如上文的“日期”、“湿度”）。
> 2. **特征向量 (Feature Vector)**：将描述同一个事物的所有特征拼凑在一起形成的一维数组（如 `[日期, 湿度, 气压]`）。它描绘了事物的全貌，在数学上代表了高维空间里的一个点。
> 3. **张量 (Tensor)**：多维数据容器，是多维数组的统称。在机器学习领域，张量主要被借用为计算机底层的数据结构概念（而非严格的物理学概念）。0维是标量，1维是向量，2维是矩阵（数据表），3维及以上可装载图像或复杂序列数据。在模型中，所有的数据最终都会被转换为张量供 GPU 计算。_注意_：“1维张量”是底层的数据结构，而“特征向量”是业务上的逻辑概念（容器里装的具体内容，比如房子的面积和价格）。
>
> 维度这个词的歧义也要注意一下：
>
> 1. **计算机视角（存储维度/Tensor Rank）**：看的是数据的嵌套层级。比如数组 `[120, 3, 500]` 只需要一个索引就能遍历，所以它是 **1维张量**，哪怕里面装了十万个数，它依然是 1维的。
> 2. **数学视角（特征空间维度）**：看的是特征的数量。上面的数组包含了面积、卧室数、距离 3 个独立特征，所以它代表了 **3维几何空间** 中的一个坐标点。
>
> 一个长度为 N 的 1维张量，在几何上代表了 N 维特征空间里的 1 个点。

这些无法被当前模型解释的波动部分，可以理解为“噪声”。

如果模型太复杂，它可能会把训练数据里的噪声也当成规律去学习，甚至几乎穿过所有训练数据点。这样它在已有数据上表现很好，但在新的日期上预测反而不准，这叫“过拟合”。

相反，如果模型太简单，比如用一条直线去拟合明显具有季节周期变化的气温数据，它可能连主要趋势都学不到，那么它在训练数据和新数据上都会表现不好，这叫“欠拟合”。

当我们有了一个合适的拟合函数后，就可以输入新的日期，预测对应的气温。因为气温是一个连续数值，所以这类任务叫做“回归”任务。

为了判断模型预测得好不好，我们需要定义一个损失函数。损失函数用来衡量预测值和真实值之间的差距。比如真实气温是 40，模型预测是 50，那么误差就比较大；如果预测是 40.1，那么误差就比较小。损失函数的值越小，通常说明模型预测得越接近真实数据。

因此，训练模型的目标就是调整函数里的参数，让损失函数的值尽可能小。梯度告诉我们损失函数上升最快的方向，所以如果想让损失下降，就要沿着梯度的反方向更新参数。这种方法就叫做“梯度下降”。

前面提到了连续数值的预测任务被叫做“回归”任务，相反的，离散数值的预测任务就叫“分类”任务，比如根据肿瘤大小推测是否是良性肿瘤。

## 单变量线性回归模型的训练全流程

```python
from __future__ import annotations

from datetime import date, timedelta
from math import sqrt


TrainingPoint = tuple[date, float]


DATA: list[TrainingPoint] = [
    (date(2026, 6, 1), 24.2),
    (date(2026, 6, 2), 24.8),
    (date(2026, 6, 3), 25.1),
    (date(2026, 6, 4), 25.9),
    (date(2026, 6, 5), 26.2),
    (date(2026, 6, 6), 27.0),
    (date(2026, 6, 7), 27.3),
    (date(2026, 6, 8), 35.0),  # A suspiciously high sensor reading.
    (date(2026, 6, 9), 28.2),
    (date(2026, 6, 10), 28.7),
    (date(2026, 6, 11), 29.0),
    (date(2026, 6, 12), 29.8),
    (date(2026, 6, 13), 30.1),
    (date(2026, 6, 14), 30.6),
]


# hθ(x) = θ0 + θ1x
def hypothesis(theta0: float, theta1: float, x: float) -> float:
    return theta0 + theta1 * x


# (hypothesis(theta0, theta1, x) - y) ** 2
# 即均方误差：单个点的 loss 值 = (预测值 - 真实值) 的平方
# 为什么要平方？一是消除正负号方便计算，二是通过平方放大误差值
def loss(theta0: float, theta1: float, xs: list[float], ys: list[float]) -> float:
    m = len(xs)
    squared_errors = [
        (hypothesis(theta0, theta1, x) - y) ** 2 for x, y in zip(xs, ys, strict=True)
    ]

    # 乘一个 1/2 是为了抵消计算偏导数时求导多出来的 2
    return sum(squared_errors) / (2 * m)


def loss_gradients(
    theta0: float,
    theta1: float,
    xs: list[float],
    ys: list[float],
) -> tuple[float, float]:
    m = len(xs)
    d_theta0 = 0.0
    d_theta1 = 0.0

    for x, y in zip(xs, ys, strict=True):
        error = hypothesis(theta0, theta1, x) - y  # 第一步：算误差
        d_theta0 += error  # 第二步：累加 theta0 的梯度
        d_theta1 += error * x  # 第三步：累加 theta1 的梯度

    return d_theta0 / m, d_theta1 / m  # 第四步：求平均坡度



def loss_gradients_descent(
    xs: list[float],
    ys: list[float],
    learning_rate: float,
    iterations: int,
) -> tuple[float, float]:
    theta0 = 0.0
    theta1 = 0.0

    for step in range(iterations + 1):
        if step % 400 == 0:
            print(f"step={step:4d}, loss={loss(theta0, theta1, xs, ys):.4f}")

        d_theta0, d_theta1 = loss(theta0, theta1, xs, ys)
        theta0 -= learning_rate * d_theta0
        theta1 -= learning_rate * d_theta1

    return theta0, theta1


def day_numbers(data: list[TrainingPoint]) -> list[float]:
    first_day = data[0][0]
    return [float((day - first_day).days) for day, _ in data]


def normalize(xs: list[float]) -> tuple[list[float], float, float]:
    mean_x = sum(xs) / len(xs)
    variance = sum((x - mean_x) ** 2 for x in xs) / len(xs)
    std_x = sqrt(variance)
    return [(x - mean_x) / std_x for x in xs], mean_x, std_x


def main() -> None:
    xs = day_numbers(DATA)
    ys = [temperature for _, temperature in DATA]

    normalized_xs, mean_x, std_x = normalize(xs)

    print("Training a date -> temperature model")
    print("h(x) = theta0 + theta1 * x")
    print()

    theta0, theta1 = loss_gradients_descent(
        normalized_xs,
        ys,
        learning_rate=0.1,
        iterations=2_000,
    )

    intercept = theta0 - theta1 * mean_x / std_x
    slope = theta1 / std_x

    print()
    print("Learned model:")
    print(f"temperature = {intercept:.2f} + {slope:.2f} * days_since_2026_06_01")
    print()
    print("Training data predictions:")

    first_day = DATA[0][0]
    for observed_day, actual_temperature in DATA:
        days_since_start = float((observed_day - first_day).days)
        predicted_temperature = intercept + slope * days_since_start
        error = predicted_temperature - actual_temperature
        print(
            f"{observed_day.isoformat()}  actual={actual_temperature:5.1f}  "
            f"predicted={predicted_temperature:5.1f}  error={error:6.2f}"
        )

    next_day = DATA[-1][0] + timedelta(days=1)
    next_day_number = float((next_day - first_day).days)
    next_day_prediction = intercept + slope * next_day_number

    print()
    print(f"Prediction for {next_day.isoformat()}: {next_day_prediction:.1f} C")


if __name__ == "__main__":
    main()

```

## 多变量线性回归

更多时候特征值不止一个而是多个，比如:

$$h_\theta(x) = \theta_0 + \theta_1 x_1 + \theta_2 x_2 + \dots + \theta_n x_n$$

为了可以充分并行化计算，我们将式子改写为：

$$h_\theta(x) = \theta_0 x_0 + \theta_1 x_1 + \theta_2 x_2 + \dots + \theta_n x_n$$

那么针对两个一维张量，即参数向量 $\theta$: $[\theta_0, \theta_1, \theta_2, \dots, \theta_n]$ 和特征向量 $X$: $[x_0, x_1, x_2, \dots, x_n]$，就可以通过线性代数的知识写为：

$$h_\theta(x) = \theta^T X$$

### 特征缩放

在多变量线性回归中，不同特征的取值范围往往差异巨大。例如，预测房价时，$x_1$（房屋面积）可能在 $100 \sim 200$ 之间，而 $x_2$（卧室数量）在 $1 \sim 5$ 之间。这种数量级的悬殊会导致损失函数的等高线图呈现出极其狭长的椭圆状。当使用梯度下降时，参数在数值大的特征方向上更新极其缓慢，而在数值小的特征方向上极易发生剧烈震荡，导致模型收敛极其困难。

为了消除这种特征尺度差异带来的影响，我们需要进行**特征缩放**。最常用的数学手段是**Z-score 标准化 (Standardization)**，它的目的是将所有特征按比例缩放，强行拉到同一水平线上。

对每一个特征 $x$ 执行以下数学操作：

$$x_{new} = \frac{x - \mu}{\sigma}$$

- $\mu$ 代表该特征在样本集中的平均值（均值平移，将数据中心拉到 0）。
- $\sigma$ 代表该特征在样本集中的标准差（方差缩放，压缩数据的离散程度）。

经过标准化后，原本狭长的等高线会被“捏”成规整的同心圆。此时，不管从哪个初始点出发，梯度的方向都会精准指向谷底，使得梯度下降能够以极快的速度收敛。

### 正规方程

梯度下降是一种需要不断试错、迭代的启发式算法，不仅需要手动设置学习率 $\alpha$，还需要多次循环才能逼近最优解。对于线性回归问题，其损失函数是一个完美的凸函数（碗状）。既然是凸函数，我们是否可以跳过一步步试探的循环，直接通过数学解析的手段，一步到位算出谷底（导数为 0 的点）的绝对坐标？

正规方程就是求解线性回归参数 $\theta$ 的解析解（Analytical Solution）。它利用矩阵运算和微积分，直接求得令代价函数最小化的参数向量 $\theta$。

假设我们有一个包含 $m$ 个样本、$n$ 个特征的数据集。我们将所有特征组合成一个 $m \times (n+1)$ 的设计矩阵 $X$（包含常数项 $x_0 = 1$），并将所有真实结果组合成一个 $m \times 1$ 的向量 $y$。

如果不考虑误差，我们期望的完美线性方程体系可以表示为：

$$X \theta = y$$

为了解出 $\theta$，常规代数思维是等式两边同除以 $X$。但在矩阵运算中，只有方阵（行数等于列数）才可能存在逆矩阵。由于 $X$ 通常是长方形矩阵（样本数 $m$ 远大于特征数 $n$），无法直接求逆。

数学家的解决方案是：在等式两边同时左乘 $X$ 的转置矩阵 $X^T$：

$$X^T X \theta = X^T y$$

此时，$(X^T X)$ 必然是一个 $(n+1) \times (n+1)$ 的方阵。只要该方阵可逆，我们就可以在等式两边同时左乘它的逆矩阵 $(X^T X)^{-1}$：

$$(X^T X)^{-1} X^T X \theta = (X^T X)^{-1} X^T y$$

由于矩阵与其逆矩阵相乘等于单位矩阵 $I$：

$$I \theta = (X^T X)^{-1} X^T y$$

我们得出了一步求解 $\theta$ 的“上帝公式”：

$$\theta = (X^T X)^{-1} X^T y$$

- **优势**：不需要选择学习率 $\alpha$，不需要迭代计算，直接代入矩阵得出全局最优解。
- **局限**：计算矩阵的逆 $(X^T X)^{-1}$ 的时间复杂度大约是 $O(n^3)$。当特征数量 $n$ 非常大（例如 $n > 10000$）时，计算会极其缓慢甚至导致内存溢出。因此，正规方程仅适用于中小规模的机器学习问题；面对海量参数的现代深度学习模型，梯度下降依然是唯一的选择。

**其实现在大模型架构的本质，也是：定义海量参数矩阵 $\theta \rightarrow$ 前向传播算 Loss $\rightarrow$ 反向传播算梯度 $\rightarrow$ 更新参数。后面慢慢学吧**

# week3

## 逻辑回归（Logistic Regression）

首先澄清一下，虽然名字里带回归，但是它其实是用来**做分类的**。为什么线性回归不能做分类呢？现实的分类目标通常是“非黑即白”的离散状态（比如肿瘤的良性 0 或恶性 1），而线性回归的输出是无边无际的连续数值。如果强行用一条无限延伸的直线去拟合，会引发两个灾难：

1. **物理意义的崩塌**：直线算出的预测值可能 $>1$（如 2.5）或 $<0$（如 -1.2），这在概率学上毫无意义。
2. **异常值的“杠杆效应”**：一根笔直的拟合线极易被极端的异常点（Outliers）拉歪。为了迁就远处的一个异常值，整条直线会被向下或向上压平，导致原本正常的样本被分类边界（如 $y=0.5$）错误划分。

### Sigmoid 函数

为了控制预测值不越界，我们需要引入 **Sigmoid 函数（逻辑函数）** 作为“压缩机”。它的作用是把线性回归算出来的从负无穷到正无穷的所有数字，压缩进 $(0, 1)$ 这个绝对安全的概率区间内。

- 输入极大的正数，输出无限接近于 1。
- 输入极小的负数，输出无限接近于 0。
- 输入 0，输出刚好是 0.5。

线性回归：
![](assets/ML/file-20260607124550451.png)

Sigmoid：
![](assets/ML/file-20260607124607034.png)

在线性方程的基础上套上一层 Sigmoid 外壳：

- 线性组合部分：$z = \theta^T X$
- Sigmoid 函数：$g(z) = \frac{1}{1 + e^{-z}}$
- 逻辑回归最终预测模型：

$$h_\theta(x) = \frac{1}{1 + e^{-\theta^T X}}$$

算出来的 $h_\theta(x)$ 具有了严格的概率学意义。即在给定特征 $x$ 和参数 $\theta$ 的情况下，目标等于 1 的概率：$h_\theta(x) = P(y=1 | x; \theta)$。

### 交叉墒损失

我们不能再沿用线性回归的“均方误差 (MSE)”。因为把带有指数运算的 Sigmoid 函数塞进均方误差的平方项里，损失函数会扭曲成**非凸函数 (Non-convex Function)**。此时使用梯度下降，极易陷入局部最优解，无法找到全局最低点。

我们引入了信息论中的 **对数损失 (Log Loss)**，也即大模型中常用的 **交叉熵损失 (Cross-Entropy Loss)**。它的核心判罚逻辑是如果预测错得离谱且概率极高，惩罚值会飙升至无穷大。

因为标签 $y$ 只有 1 和 0 两种可能，我们可以将惩罚分段：

- 当 $y = 1$ 时：$Cost = -\log(h_\theta(x))$
- 当 $y = 0$ 时：$Cost = -\log(1 - h_\theta(x))$

利用代数技巧将它们融合为一个**统一的代价函数**：

$$Cost(h_\theta(x), y) = -y \log(h_\theta(x)) - (1 - y) \log(1 - h_\theta(x))$$
_(注：当 $y=1$ 时后半部分消掉，当 $y=0$ 时前半部分消掉，极其优雅)_

更换了极其复杂的对数损失函数后，我们重新得到了一个平滑的“大碗”（凸函数）。利用微积分的链式法则对整体代价函数求偏导后，我们得到了参数 $\theta_j$ 的更新公式：

$$\theta_j = \theta_j - \alpha \frac{1}{m} \sum_{i=1}^{m} (h_\theta(x^{(i)}) - y^{(i)}) x_j^{(i)}$$

这个公式与第一周线性回归的梯度下降公式在形式上完全一模一样，唯一的区别仅仅在于内部的预测函数 $h_\theta(x)$ 从普通的直线变成了一根 $S$ 型曲线。

### Loss 和 Cost

**Loss Function (损失函数)**：定义在**单个样本**上的误差。它衡量的是模型对某一个具体输入预测值与真实值之间的“痛苦指数”。

**Cost Function (代价函数)**：定义在**整个训练集**（或一个 Batch）上的平均误差。它是所有样本 Loss 的宏观平均，是梯度下降算法真正要去最小化的终极目标。

以逻辑回归为例，单个样本的 **Loss Function** 为：
$$\text{Loss}(h_\theta(x^{(i)}), y^{(i)}) = -y^{(i)} \log(h_\theta(x^{(i)})) - (1 - y^{(i)}) \log(1 - h_\theta(x^{(i)}))$$

而整个数据集的 **Cost Function** $J(\theta)$ 则是对所有样本 Loss 取均值：
$$J(\theta) = \frac{1}{m} \sum_{i=1}^{m} \text{Loss}(h_\theta(x^{(i)}), y^{(i)}) = -\frac{1}{m} \sum_{i=1}^{m} \left[ y^{(i)} \log(h_\theta(x^{(i)})) + (1 - y^{(i)}) \log(1 - h_\theta(x^{(i)})) \right]$$

### 一对多

基础的逻辑回归通过 Sigmoid 函数将输出限制在 $(0,1)$，天生只能处理非黑即白的“二元分类”问题。但在实际业务中（如天气预测：晴、雨、阴、雪），目标往往包含 $K$ 个离散类别 ($K > 2$)，无法直接用单根 S 型曲线搞定。

既然模型只会做“二选一”，便采取**分而治之**的策略。将一个多分类任务拆解为 $K$ 个独立的二分类任务。针对每一个类别，都训练一个独立的逻辑回归模型，将“当前类别”设为正例（1），而将“其余所有类别”统一打包看作负例（0）。

设定类别 $i \in \{1, 2, \dots, K\}$，针对每个类别训练出来的模型为：
$$h_\theta^{(i)}(x) = P(y=i \mid x; \theta)$$

当输入一个全新的测试样本 $x$ 时，将其同时喂给这 $K$ 个模型，每个模型都会吐出一个概率值。最终的预测结果，取算出的概率值最大的那个模型所对应的类别：
$$\text{prediction} = \arg\max_{i} h_\theta^{(i)}(x)$$
*(注：这正是现代大语言模型在词表里评估并生成下一个词的最初级分类雏形)*

举个简单的例子，比如：

- 模型 1 负责区分“晴天”和“非晴天”（把雨、阴、雪全当成一类）。
- 模型 2：负责区分“雨天”和“非雨天”。
- 模型 3：负责区分“阴天”和“非阴天”。
- 模型 4：负责区分“雪天”和“非雪天”。

当明天的新数据 $x$ 输入进来时，把这个数据同时喂给这 4 个模型，它们会各自吐出一个概率。模型 1 报告：“是晴天的概率是 15%”；模型 2 报告：“是雨天的概率是 82%”；模型 3 报告：“是阴天的概率是 10%”；模型 4 报告：“是雪天的概率是 2%”。由于模型 2 算出的概率最高（82%），所以明天的预测结果就是“雨天”。

### 正则化 

当特征空间维度极高、参数过多时，模型为了在训练集上拿到满分（使 Cost 降为 0），会不择手段地放大高阶特征（比如 $x^3, x^4$ 这样的特征）的权重参数 $\theta$，画出一条极其扭曲、死记硬背所有数据点的曲线。这导致模型产生**过拟合**，丧失了对未知新数据的泛化能力。

为了防止权重参数 $\theta$ 肆意疯长，在原有的代价函数尾巴上强行加上一个**正则化惩罚项**。不仅要求模型预测得准（减少 loss），还要求所有的权重参数自身越小越好（约束模型复杂度），以此逼迫扭曲的曲线重新变得平滑。

**公式推导 (以线性回归加入 L2 正则化为例)**，引入正则化参数 $\lambda$ (Lambda)，重构后的 **Cost Function** 为：
$$J(\theta) = \frac{1}{2m} \left[ \sum_{i=1}^{m} (h_\theta(x^{(i)}) - y^{(i)})^2 + \lambda \sum_{j=1}^{n} \theta_j^2 \right]$$
*(注：依照工业惯例，常数项/截距 $\theta_0$ 不参与正则化惩罚)*

对这个带有惩罚项的新代价函数求偏导，推导得出其**梯度下降更新公式**：
$$\theta_j := \theta_j - \alpha \left[ \frac{1}{m} \sum_{i=1}^{m} (h_\theta(x^{(i)}) - y^{(i)}) x_j^{(i)} + \frac{\lambda}{m} \theta_j \right]$$

为了看清其物理本质，我们将关于 $\theta_j$ 的项合并同类项，变形为：
$$\theta_j := \theta_j \left( 1 - \alpha \frac{\lambda}{m} \right) - \alpha \frac{1}{m} \sum_{i=1}^{m} (h_\theta(x^{(i)}) - y^{(i)}) x_j^{(i)}$$

**得出结果 (权重衰减 Weight Decay)**：因为 $\alpha, \lambda, m$ 均为正数，括号内的 $\left( 1 - \alpha \frac{\lambda}{m} \right)$ 必然是一个略小于 1 的数字（例如 0.99）。这意味着，**在每一轮迭代更新、向谷底迈步之前，模型都会强制让当前的权重 $\theta_j$ 乘以 0.99 自动“缩水”一部分**。这种在数学上自然推导出的机制，在工业界被称为**权重衰减 (Weight Decay)**，是现代各大深度学习优化器（如 AdamW）抗过拟合、稳定训练的绝对底层基石。