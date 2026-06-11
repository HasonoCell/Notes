
Kafka 是一个分布式的、持久化的、追加写入的提交日志系统。现代 Kafka 采用 KRaft 架构替代了外部依赖（ZooKeeper）。KRaft 基于 Raft 共识算法，在 Controller 节点之间维护高可用的元数据状态机，通过日志复制和 Leader 选举独立完成集群共识。

**Kafka 主要的使用场景一个就是高并发场景下缓解数据库压力，削峰填谷；另一个就是用作日志链路缓冲日志流，让ES可以慢慢消费。**

一些概念：

* Topic：纯逻辑概念，代表一类消息的集合，无对应的单一物理文件。
* Partition：物理存储与扩展的核心单元。一个 Topic 被划分为多个 Partition，每个 Partition 在物理磁盘上对应独立的日志目录（包含 `.log` 和 `.index` 等文件）。Kafka 仅保证单一 Partition 内部的严格顺序性。
* Offset：Partition 内消息的单调递增序号。由消费者端（或 Consumer Group）主动维护和提交，使得 Broker 端维持无状态的高效读写。
* Consumer Group：通过组内消费者实例对 Partition 的独占消费机制，实现了发布-订阅模型与点对点队列模型的统一。

以 3 个 Broker 节点、1 个 Topic（设为 3 个 Partition: P0, P1, P2）、ReplicationFactor 为 2 的集群为例：

* **Broker 进程**：每个节点上独立运行的 Kafka Java 进程。多个 Broker 通过共享集群配置与网络通信构成完整集群。
* **副本分布**：为保证容错，同一 Partition 的不同副本严格分布在不同的 Broker 上。Leader 唯一负责处理该 Partition 所有客户端读写请求的节点。Follower 不直接对接客户端，通过异步拉取（Fetch）操作从 Leader 同步增量日志，维持数据一致性。
* **状态示例**：
    * Broker 0: 承载 P0 (Leader), P2 (Follower)
    * Broker 1: 承载 P1 (Leader), P0 (Follower)
    * Broker 2: 承载 P2 (Leader), P1 (Follower)

将单一主题的请求分散到多个独立的 Partition 复制组中，具备以下工程优势：

* **极致的负载均衡**：通过将不同 Partition 的 Leader 节点均匀离散至集群的各个 Broker 上，避免了单一节点的网络 I/O 与磁盘读写成为系统全局瓶颈。
* **控制故障爆炸半径**：当单一物理节点（如 Broker 0）发生宕机时，仅影响以该节点为 Leader 的特定 Partition（如 P0）。其余 Leader 位于健康节点的 Partition 读写不受影响。集群控制器会迅速在存活的 Follower 中触发 Leader Election 恢复服务，保障系统的高可用性。

一些简单的代码例子：

producer：
```go
package main

import (
	"context"
	"fmt"
	"log"
	"time"

	"github.com/segmentio/kafka-go"
)

func main() {
	// 定义要写入的 Topic 和 Kafka 集群地址
	topic := "UserActivity"
	brokers := []string{"localhost:9092"} // 实际生产环境中通常会填入多个 Broker 地址

	// 初始化一个 kafka.Writer
	// Writer 内部维护了连接池，并自动处理 Partition 路由和失败重试
	w := &kafka.Writer{
		Addr:                   kafka.TCP(brokers...),
		Topic:                  topic,
		Balancer:               &kafka.Hash{}, // 路由策略：根据 Key 的 Hash 值决定写入哪个 Partition
		RequiredAcks:           kafka.RequireAll, // 对应 acks=all，要求所有 ISR 副本确认，保证最高的数据可靠性
		AllowAutoTopicCreation: true,          // 如果 Topic 不存在则自动创建（生产环境通常关闭）
	}

	defer func() {
		if err := w.Close(); err != nil {
			log.Fatal("failed to close writer:", err)
		}
	}()

	// 模拟连续发送 5 条消息
	for i := 0; i < 5; i++ {
		msgKey := fmt.Sprintf("user-%d", i)
		msgValue := fmt.Sprintf("click-event-timestamp-%d", time.Now().UnixNano())

		err := w.WriteMessages(context.Background(),
			kafka.Message{
				Key:   []byte(msgKey),   // Key 决定了消息落入哪个具体的 Partition
				Value: []byte(msgValue), // 实际的业务数据载荷
			},
		)

		if err != nil {
			log.Printf("写入消息失败: %v\n", err)
		} else {
			fmt.Printf("成功写入消息 | Key: %s | Value: %s\n", msgKey, msgValue)
		}
		time.Sleep(time.Second)
	}
}
```

consumer：
```go
package main

import (
	"context"
	"fmt"
	"log"

	"github.com/segmentio/kafka-go"
)

func main() {
	topic := "UserActivity"
	brokers := []string{"localhost:9092"}
	groupID := "analytics-service-group" // 声明当前消费者属于哪个组

	// 初始化一个 kafka.Reader
	r := kafka.NewReader(kafka.ReaderConfig{
		Brokers:  brokers,
		GroupID:  groupID,
		Topic:    topic,
		MinBytes: 10e3, // 10KB：每次向 Broker 拉取的最小数据量，达不到则等待，优化网络开销
		MaxBytes: 10e6, // 10MB：每次拉取的最大数据量
	})

	defer func() {
		if err := r.Close(); err != nil {
			log.Fatal("failed to close reader:", err)
		}
	}()

	fmt.Printf("消费者已启动，加入组 [%s]，正在监听 Topic [%s]...\n", groupID, topic)

	// 开启一个无限循环，持续拉取消息
	for {
		// ReadMessage 会阻塞，直到有新消息到达
		// 它在内部自动处理了 Offset 的提交 (Auto Commit)
		m, err := r.ReadMessage(context.Background())
		if err != nil {
			log.Printf("读取消息出错: %v\n", err)
			break
		}

		// 打印收到的消息元数据和内容
		fmt.Printf("收到消息 | Partition: %d | Offset: %d | Key: %s | Value: %s\n",
			m.Partition, // 这条消息物理上存在哪个分区
			m.Offset,    // 在该分区日志文件中的绝对单调递增序号
			string(m.Key),
			string(m.Value),
		)
	}
}
```

- **路由与负载均衡 (`Balancer: &kafka.Hash{}`)：** 在 Producer 中设置了 Hash 路由。这意味着具有相同 Key（如同一个 `user_id`）的消息，其 Hash 值计算结果相同，会永远被路由到同一个 Partition 中，这保证了**局部有序性**。
    
- **安全性保障 (`RequiredAcks: kafka.RequireAll`)：** 这行代码直接呼应了底层架构中的 ISR（In-Sync Replicas）机制。它告诉 Broker 的 Leader：“收到这条消息后不要立刻返回成功，必须等后台的 Follower 们都把这条日志同步到它们各自的 `.log` 文件后，再告诉客户端写入成功。”
    
- **游标控制 (`ReadMessage` 中的 Offset)：** 当 Consumer 读取消息时，它并不修改服务端的 `.log` 文件（这是追加写入的只读模型）。Consumer 只是拿到了当前消息的 `Offset`，并在后台将其提交到 Kafka 内部的特殊 Topic（`__consumer_offsets`）中，以此来记录当前消费组在这个 Partition 的“阅读进度”。

此外 Kafka 还做了如下优化：

* **顺序磁盘 I/O**：采用追加模式，规避磁盘随机寻道时间，最大化底层存储设备的写入吞吐率。
* **Page Cache**：将内存管理职责下移至操作系统内核（页缓存），减少 JVM 堆内存压力与垃圾回收（GC）引起的系统停顿。
* **零拷贝 (Zero-Copy)**：在消费者拉取数据时，调用操作系统的 `sendfile` 指令，使数据流直接从 Page Cache 经过网络接口卡（NIC）传输，省去了内核态到用户态的数据拷贝开销。