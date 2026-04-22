
1. 先补 Transformer / KV cache / prefill-decode / sampling / batching 这些推理基础。
2. 再学 GPU / CUDA / memory / throughput / latency 这些性能基础。
3. 先过一遍 vLLM，重点看 OpenAI server、PagedAttention、prefix caching、continuous batching。
4. 再过 SGLang，重点看 frontend language、structured outputs、tool/reasoning parser、disaggregation。
5. 最后再看 benchmark / profiling / observability / multi-node / quantization / LoRA serving 这些生产主题。


先学推理基础，顺序最好是：

1. 先读 Attention Is All You Need，抓住 self-attention、multi-head、position encoding 这些基本件。Paper (https://huggingface.co/papers/1706.03762)
2. 再看 Hugging Face 的 KV cache 和 generation strategies，把 prefill / decode / sampling / greedy / beam 这些推理术语串起来。KV cache
(https://huggingface.co/docs/transformers/main/cache_explanation), Generation strategies (https://huggingface.co/docs/transformers/en/generation_strategies)
3. 再看 vLLM 的 Architecture Overview、PagedAttention、Automatic Prefix Caching，理解工业级 serving 怎么把 KV cache、batching、cache reuse 做起来。Arch (https://docs.vllm.ai/en/latest/design/arch_overview.html), PagedAttention (https://docs.vllm.ai/en/stable/api/vllm/attention/ops/paged_attn.html), Prefix caching (https://docs.vllm.ai/en/latest/design/prefix_caching/)
4. 最后再回头看 disaggregated prefilling 这类更偏系统优化的内容。Disagg prefill (https://docs.vllm.ai/usage/disagg_prefill/)

再学 GPU / CUDA / 性能基础，顺序建议是：

1. 先读 CUDA Programming Guide 的 programming model 和 memory hierarchy，建立“线程/warp/block/shared/global memory”的基本模型。CUDA Programming Guide
 (https://docs.nvidia.com/cuda/cuda-c-programming-guide/index.html)
2. 再读 CUDA Best Practices Guide，重点看 bandwidth、coalescing、occupancy、shared memory、host-device transfer。Best Practices
 (https://docs.nvidia.com/cuda/cuda-c-best-practices-guide/)
3. 再跑 NVIDIA 的 Learn CUDA C++ / Getting Started with CUDA 之类的官方训练资源，做几个最小 kernel。CUDA education/training
 (https://developer.nvidia.com/cuda-education-training), CUDA toolkit (https://developer.nvidia.com/cuda/toolkit)
4. 再用 Nsight Systems 看整条 CPU/GPU 时间线，用 Nsight Compute 看 kernel 细节和内存瓶颈。Nsight Systems (https://developer.nvidia.com/nsight-systems), Nsight Compute (https://developer.nvidia.com/tools-overview/nsight-compute/get-started)

5. 最小实践闭环

- 推理侧：自己用 transformers 跑一个 causal LM，观察 generate()、past_key_values、do_sample，再拿同一模型在 vLLM 跑一遍。
- GPU 侧：先写一个 vector add，再写一个 matmul，最后做一次 profiling，重点看 memory bandwidth 和 kernel launch overhead。