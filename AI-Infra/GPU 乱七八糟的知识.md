# GPU 的存储结构

```
CPU RAM = 我们常说的内存条（8G/16G 这种）
       = Host Memory / System Memory

GPU 显存 = GPU 自己使用的大容量内存
        = VRAM
        = CUDA 里的 Device Memory / Global Memory
```

在独立显卡上，CPU RAM 和 GPU 显存是两块不同的内存。一个 GPU Kernel 中，所有 Thread 都可以访问的 GPU 主存储。

关于 CPU RAM、GPU 显存和 GPU 内部存储可以参考如下的结构图：

```
CPU
├── CPU Core
└── CPU RAM / 内存条
        │
        │ PCIe / NVLink
        ▼
GPU
├── GPU 显存
│   └── Global Memory / Device Memory
│
└── SM
    ├── L2 Cache
    ├── Shared Memory
    ├── Register
    └── CUDA Core / Tensor Core
```

不同存储的关系：

|存储|所属位置|访问范围|容量|速度|
|---|---|---|---|---|
|CPU RAM|主机|CPU|较大|中等|
|GPU Global Memory|GPU 显存|所有 GPU Thread|较大|相对较慢|
|L2 Cache|GPU|GPU 自动管理|中等|较快|
|Shared Memory|SM|同一个 Block|较小|很快|
|Register|SM|单个 Thread|极小|最快|
GPU 显存通常使用 GDDR 或 HBM。它和 CPU RAM 的用途类似，都是“大容量存储”，但在独立显卡中物理上是两块不同的内存。

对于一个 PyTorch Tensor，默认情况下：

```
x = torch.tensor([1, 2, 3])
```

它通常创建于 CPU RAM 中。其实这个比较好理解，因为本身这个 Python 进程也是由 CPU 来管理的，所以这个 Tensor 最初位于 RAM 中～接下来需要执行：

```
x = x.to("cuda")
```

之后，`x` 会被复制到 GPU 显存中。对于一个模型也是一样：

```
model = model.to("cuda")
```

会把模型参数放到 GPU 显存。然后继续执行：

```
y = model(x)
```

大致过程是：

```
模型参数、输入数据
    ↓
存放在 GPU Global Memory，也就是显存
    ↓
Kernel 把数据加载到 SM 附近
    ↓
Register / Shared Memory 临时保存数据
    ↓
CUDA Core / Tensor Core 执行计算
    ↓
结果写回 GPU 显存
```

所以 Kernel 的作用可以理解成：把显存中的数据取出来，在 GPU 的计算单元上处理，再把结果写回显存。

通常训练一个模型时，GPU 显存通常会存储这些东西：

- 模型参数；
- 输入 token；
- 中间激活值；
- 梯度；
- 优化器状态。

推理时通常会放：

- 模型参数；
- 输入 token；
- 中间激活值；
- KV Cache。

例如一个 7B 参数模型使用 FP16 精度：

```
7 billion parameters × 2 bytes
≈ 14 GB
```

这 14GB 只是模型参数本身，还没有计算激活值、临时 Tensor 和 KV Cache，所以实际运行所需显存会更大。

最后，在如 NVIDIA 这样的独立显卡上，CPU RAM 和 GPU 显存分开；而在 Apple Silicon 的统一内存架构中，CPU 和 GPU 可能共享同一套物理内存，但在我们去理解仍然可以用 `Host Memory` 和 `Device Memory` 来理解不同的访问角色。