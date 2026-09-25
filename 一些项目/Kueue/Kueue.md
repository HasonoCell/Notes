如何理解 Kueue 及其所在的“云原生批量计算”这个体系？

“云原生批量计算”指：在 Kubernetes 上运行训练、数据处理、仿真、HPC 等**有开始和结束、可能需要大量资源的任务**，并解决排队、资源共享和调度问题。Kueue、Volcano 都在这个体系里，但切入点不同。**Kueue 主要决定一个任务什么时候可以开始；Volcano 还深入决定一组 Pod 怎样调度到节点上。**

|                  | Kueue                                  | Volcano                                                                       |
| ---------------- | -------------------------------------- | ----------------------------------------------------------------------------- |
| 核心定位             | Job 级别的排队、配额和准入管理                      | 面向批量任务的调度系统，包含调度器、控制器等                                                        |
| 典型问题             | “团队 A 的训练任务现在能占用 8 张 GPU 吗？”           | “这组相互依赖的 Pod 能否一起被调度，分别放到哪些节点？”                                               |
| 与 Kubernetes 的关系 | 不替换 kube-scheduler；任务获准启动后，通常仍由它调度 Pod | 提供自己的 Volcano Scheduler 代替原有的 kube-scheduler，也有 VolcanoJob、PodGroup、Queue 等资源 |
[Kueue 概览](https://kueue.sigs.k8s.io/docs/overview/) 明确说它管理任务何时等待、启动或被抢占，而 Pod 到节点的调度仍由 Kubernetes 调度器负责；[Volcano 架构](https://volcano.sh/docs/v1.13.0/home/architecture/) 则把自己的 Scheduler 列为核心组件。但两者能力也会有交叉：Volcano 也有[队列和准入](https://volcano.sh/docs/keyfeatures/queueresourcemanagement/)，Kueue 也有[拓扑感知准入](https://kueue.sigs.k8s.io/docs/concepts/topology_aware_scheduling/)。

举个分布式训练例子：两个团队共用一批 GPU，某个训练任务需要 8 个 worker。Kueue 会先根据队列、团队配额、优先级等判断它是否可以启动；启用拓扑感知时，还会检查所需的物理布局是否可行。获准后，Pod 才进入实际的节点调度阶段。Volcano 的强项之一则是在调度阶段处理 gang scheduling：这组相互依赖的 Pod 达不到最低可运行数量时，不让它们零零散散地占住资源。[Kueue 也提供多种 all-or-nothing 机制](https://kueue.sigs.k8s.io/docs/concepts/all_or_nothing/)，但实现层次和 Volcano 的 [gang 调度插件](https://volcano.sh/docs/scheduler/plugins/gang/)不同。

总之就是这么个流程：
```
用户提交 Job / RayJob / 训练任务
          ↓
Kueue：排队、配额、准入、跨团队资源共享
          ↓
Job 控制器：创建和管理 Pod
          ↓
kube-scheduler（或专用调度器）：把 Pod 放到节点
          ↓
节点执行计算任务
```

---
![](assets/Kueue/file-20260920144523456.png)
![](assets/Kueue/file-20260920144811501.png)

---
