## 1. 核心概念：云服务器 (ECS)

全称：Elastic Compute Service（弹性计算服务）。  

本质：并非物理实体，而是基于虚拟化技术（Virtualization），从高性能物理机（Host）上切分出的“虚拟切片”（Guest）。

特点：  
1. 弹性 (Elastic)：配置（CPU/内存）可按需动态升降，如同水电。
2. 操作系统：通常运行 Linux (如 Ubuntu)，遵循“一切皆文件”的哲学。
3. 关键组件：
   * 安全组 (Security Group)：云端的虚拟防火墙。默认关闭所有端口（门），必须手动开放特定端口（如 22 用于 SSH，80 用于 Web）才能访问。

## 2. 核心协议：SSH (Secure Shell)

定义：用于计算机之间加密登录的网络协议。是连接本地终端与远程服务器的唯一“安全隧道”。

底层逻辑：非对称加密。
  • 公钥 (Public Key)：类似“挂锁”，放在服务器上。
  • 私钥 (Private Key)：类似“钥匙”，保存在本地，不可泄露。
  • 优势：通过“公钥加密，私钥解密”的方式，比密码登录更安全，防暴力破解，且支持自动化。

常用命令：
  • `ssh root@ip`：以 root 身份登录指定 IP 的服务器。
  • `ssh-keygen`：生成密钥对。
 
## 3. 关键工具与环境

Root 用户：Linux 系统中的超级管理员，拥有最高的权限（包括删除系统核心文件）。


包管理器 (apt)：Linux (Debian/Ubuntu) 管理应用的工具，如同 Windows 的 winget 或者 MacOS 的 brew。
  • `apt update`：刷新软件列表。
  • `apt install <软件名>`：安装软件。


Nginx：高性能 Web 服务器。监听 80 端口，负责接收 HTTP 请求并返回网页文件。

  
Tmux：终端复用器。允许会话与窗口分离（Detach），确保程序在 SSH 断开后仍在后台继续运行（持久化）。