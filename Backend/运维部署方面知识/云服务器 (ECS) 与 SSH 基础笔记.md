## 1. 核心概念：云服务器 (ECS)

全称：Elastic Compute Service（弹性计算服务）。  

本质：并非物理实体，而是基于虚拟化技术（Virtualization），从高性能物理机（Host）上切分出的“虚拟切片”（Guest）。

特点：  
1. 弹性 (Elastic)：配置（CPU/内存）可按需动态升降，如同水电。
2. 操作系统：通常运行 Linux (如 Ubuntu)，遵循“一切皆文件”的哲学。
3. 关键组件：安全组 (Security Group)：云端的虚拟防火墙。默认关闭所有端口（门），必须手动开放特定端口（如 22 用于 SSH，80 用于 Web）才能访问。

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

### Nginx

Nginx 是一个高性能 Web 服务器，在后端架构中经常作为**网关**，处理并发请求，转发流量，反向代理。

如果把服务器比作一栋大楼，**IP 地址**就是大楼的物理地址（如：朝阳区 xx 路 100 号），只能帮你找到这栋楼。**端口 (Port)**：是大楼的具体的门。Web 服务约定俗成走 **80 端口**。
    
在 **Linux 系统** 中，默认情况下，80 号门是关着的，且没人值守。**Nginx** 就像是**前台接待员**。它坐在 80 号门口监听（Listening）。当用户请求到来时，它负责去仓库（硬盘）取文件（HTML/CSS/JS）。

用更专业的话来说，一个网络请求需要知道服务器的 IP 地址，才能发送请求到服务器，但是请求不知道应该被服务器中的哪个程序去处理，所以我们要让它去跑在 80 端口上的 Nginx 程序去处理。

如下是一个 Nginx 配置文件的基本骨架，可以了解一下：
```nginx
# 全局块
worker_processes 1;

events {
    # 甚至不用管这里
    worker_connections 1024;
}

http {
    # --- 核心业务区 ---

    # 包含一些基础设定（MIME类型等）
    include       mime.types;

    # 每一个 server 就是一个“虚拟主机/网站”
    server {
        listen       80;        # 1. 监听哪个端口
        server_name  localhost; # 2. 叫什么域名

        # 3. 怎么处理请求？（Location 块）
        location / {
            root   html;        # 去哪里找文件
            index  index.html;  # 默认给哪个文件
        }

        # 4. 碰到 api 怎么办？（反向代理）
        location /api {
            proxy_pass http://localhost:3000; # 甩给后端
        }
    }
}
```

举个例子，比如用户访问 www.baidu.com ，这是个域名，首先由 DNS 系统解析为 IP 地址，然后用户就用了目标服务器的 IP 地址，接着发送一个网络请求给服务器，这个请求有极大概率就会先被打到 Nginx 上（跑在目标服务器的 80 端口）
- 如果访问静态资源，直接秒拿。
- 而如果对 API 接口发送了请求，Nginx 再做反向代理，将请求打到用 Java/GO 写的后端服务里面去（比如说有可能跑在 3000 端口上面），这个后端服务再去处理逻辑，读写数据库，返回 JSON。
并且针对 Java/GO 的后端服务，服务器是不直接将其暴露在公网中的（即不开放此服务对应的 3000 端口），这是为了防止恶意攻击。一般来说服务器只会放开 80 端口（Nginx）和 443 端口（HTTPS）给公网，因此 Nginx 还保护了脆弱的后端逻辑（伟大无需多言...)

所以，大型后端架构的基本逻辑都可以视为：**DNS 寻址 -> 网关分流 -> 动静分离 -> 后端处理。**

## 4. Linux 基本知识

### 文件系统

Linux 没有 Windows 的 C盘、D盘概念，它像是一棵**倒置的树**，起点是根目录 `/`。

| **路径**      | **全称**    | **作用**      | **你的使用场景**                                          |
| ----------- | --------- | ----------- | --------------------------------------------------- |
| **`/`**     | Root      | 根目录，一切的起点   | `cd /` 回到最顶层                                        |
| **`~`**     | Home      | **用户主目录**   | 类似于 `C:\Users\Admin`。这是你的私人领地，随便折腾不会坏系统。            |
| **`/etc`**  | Etc       | **系统配置文件**  | Nginx 的配置在 `/etc/nginx/`，相当于 Windows 注册表。要改配置就去那里找。 |
| **`/var`**  | Variable  | **经常变动的数据** | 网站文件常放 `/var/www/`；日志在 `/var/log/`。                 |
| **`/bin`**  | Binaries  | **二进制命令**   | 存放 `ls`, `cp`, `mkdir` 等可执行程序的地方。                   |
| **`/root`** | Root Home | 超级管理员的家     | root 用户的私人目录。                                       |

### 常用命令

`pwd`：Print Working Directory，显示当前所在盘符。
    
`ls`：List，列出当前文件夹的文件。`ls -la`，列出所有文件（包括隐藏文件）及其详细权限信息。
        
`mkdir <名>`：Make Directory，新建文件夹。
    
`touch <名>`：新建一个空文件。
    
`cp <源> <目标>`：Copy，复制文件。`cp -r <源文件夹> <目标>`：复制文件夹（必须加 `-r` 递归）。
        
`mv <源> <目标>`：Move，移动文件，或者**重命名**文件。
    
`rm <名>`：Remove，删除文件。`rm -rf <名>`：**强制删除文件夹**。
        
`cat <文件>`：在终端直接打印文件内容（适合看短文件）。
    
`nano <文件>`：新手友好的文本编辑器。`Ctrl+O` 保存 + 回车 + `Ctrl+X` 退出。
        
`sudo <命令>`：SuperUser Do。以管理员权限执行命令（如安装软件、修改配置）。
    
`chmod <权限> <文件>`：Change Mode。修改文件权限。`chmod 777`：给所有人读写执行权限（测试用）。`chmod +x`：赋予执行权限（用于脚本）。
        
`systemctl`：系统服务管理。`systemctl status nginx`：看 Nginx 活着没。`systemctl reload nginx`：让 Nginx 重新加载配置（修改配置后必做）。


## 5. 前端项目手动上线流程 (SOP)

### Step 1: 本地构建 (Local Build)

在 Windows 开发机上，将 React/Vue 代码编译成浏览器能读懂的静态文件。

```bash
# 在项目根目录
npm run build
# 生成 dist 文件夹，这就是“制品”
```

### Step 2: 传输制品 (Transfer)

将 `dist` 文件夹内的内容上传至服务器。
**工具**：VS Code Remote - SSH (拖拽) 或 `scp` 命令。
**目标路径**：通常为 `/var/www/你的项目名`。
    
### Step 3: 配置网关 (Nginx Config)

告诉 Nginx 去哪里找你的文件。
**编辑文件**：`/etc/nginx/sites-available/default`
**修改 Root**：

```nginx
server {
        listen 80;
        root /var/www/你的项目名;  # 指向上传的文件夹
        index index.html;
    
        location / {
            # 解决 SPA 单页应用刷新 404 问题
            try_files $uri $uri/ /index.html;
        }
    }
```

### Step 4: 生效与验证 (Reload & Verify)

```bash
# 检查配置语法是否正确
nginx -t
# 重载服务
systemctl reload nginx
```

最后访问服务器公网 IP 进行验证。如上操作其实可以进一步标准化为一套完整的 CI/CD 流水线。

## 6. 使用 ECS 实现一个简单的前后端分离架构

**核心知识点**：反向代理、动静分离、虚拟环境、Nginx 配置

### 架构逻辑：动静分离

现代 Web 应用通常采用前后端分离模式：

- **静态资源 (Static)**：HTML/CSS/JS/图片。由 **Nginx** 直接读取硬盘文件返回，速度最快。
    
- **动态资源 (Dynamic)**：API 接口/数据库查询。由 **Nginx** 转发给后端应用（Python/Go/Java）处理。
    
### Nginx 核心配置的一些实操

配置文件位置：`/etc/nginx/sites-available/default`

关键指令解析：

**`server_name`**: 你的域名（如果没有就写 `_`）。
    
**`root`**: 静态文件存放的根目录。
    
**`try_files $uri $uri/ /index.html`**：
- **作用**：解决 SPA (React/Vue) 路由刷新 404 的问题。  
- **逻辑**：先找文件，再找文件夹，都找不到就返回首页（让前端路由接管）。
        
**`proxy_pass http://127.0.0.1:8000`**：**作用**：反向代理，将请求转发给后端。
        
    
注意：不要在 `location /api` 这种接口转发块里写 `try_files`，否则请求会在本地被拦截，永远到不了后端。

### 核心架构图

```Plaintext
+-----------------------------------------------------------------------+
|   User's Browser (PC/Mobile)                                          |
|                                                                       |
|   1. Request: http://<ECS IP 地址>/         2. Request: .../api/hello |
+---------------------+-------------------------------+-----------------+
                      |                               |
                      v                               v
            (Internet / Firewall)           (Internet / Firewall)
                      |                               |
+---------------------+-------------------------------+-----------------+
|   Alibaba Cloud ECS (Linux Ubuntu)                  |                 |
|   [ Public IP: 39.107.x.x ]                         |                 |
|                     |                               |                 |
|   +-------------------------------------------------+-------------+   |
|   |  Nginx Web Server (Listening on Port 80)        |             |   |
|   |  (The "Gatekeeper" & Reverse Proxy)             |             |   |
|   +------------------------+------------------------+-------------+   |
|                            |                        |                 |
|   (Path is /)              |                        | (Path is /api)  |
|   Matches: location /      |                        | Matches:        |
|                            |                        | location /api   |
|   +------------------------v--+                     |                 |
|   |  File System              |             +-------v-------------+   |
|   |  /var/www/ecs-learn       |             |  Internal Network   |   |
|   |  (Static Files)           |   Proxy     |  (Loopback)         |   |
|   |                           |   Pass      |  127.0.0.1:8000     |   |
|   |  [index.html]             |  =======>   +-------+-------------+   |
|   |  [assets/...]             |                     |                 |
|   |                           |                     v                 |
|   +---------------------------+           +-----------------------+   |
|                                           |  Python Process       |   |
|                                           |  (FastAPI + Uvicorn)  |   |
|                                           |                       |   |
|                                           |  [ main.py ]          |   |
|                                           |  Returns JSON Data    |   |
|                                           +-----------------------+   |
+-----------------------------------------------------------------------+
```

## 7. 自动化部署 (CI/CD) 与 进程守护 (Systemd)

这次要实现代码提交即上线（通过 Github Actions 实现自动化），以及服务崩溃自动重启（稳定性）。

---

### CI/CD (持续集成/持续部署)

**本质**：将重复的手工劳动（打包、上传、部署）写成脚本，交给机器人（GitHub Actions）去执行。不管是跑所谓的流水线（pipeline）还是工作流（workflow），本质都是将源代码执行核心的**构建**和**部署**操作，将其转换为用户最终体验到的应用。

#### 核心流程

1. **Trigger (触发)**：当你 `git push` 代码到 main 分支。
    
2. **Runner (执行环境)**：GitHub 启动一台临时的 Ubuntu 虚拟机。
    
3. **Build (构建)**：在虚拟机里安装 Node.js，执行 `npm run build` 生成制品（dist）。
    
4. **Deploy (部署)**：使用 SCP 协议，将 dist 文件夹的内容“搬运”到 ECS。
    

关键配置：GitHub Actions

**配置文件位置**：`.github/workflows/deploy.yml`
    
**Secrets (密钥管理)**：
        
- **配置位置**：GitHub 仓库 -> Settings -> Secrets -> Actions。
        
- **核心原理**：机器人拿着你给它的“私钥”（`SSH_PRIVATE_KEY`），去开服务器的“锁”（`authorized_keys`）。
        

#### SSH 密钥排查 (Troubleshooting)

如果 Actions 报错 `handshake failed`，通常是因为密钥没对上。

- **最佳实践**：不要复用开发者的 Key，而是专门为 CI 机器人生成一对 Key。
    
- **生成命令**：`ssh-keygen -t rsa -b 4096 -f ~/.ssh/github_action -N ""`
    
- **授权命令**：`cat github_action.pub >> authorized_keys`
    

---

### Linux 进程守护 (Systemd)

#### 基本解释

**本质**：将普通的程序（Process）注册为系统服务（Service），由 Linux 内核的 PID 1 (init) 进程直接管理。

为什么要用 Systemd？主要是因为如果只运行一个普通的后端服务进程，它会随 SSH 断开而结束。Systemd 可以让它在后台常驻。

此外，如果程序崩溃（OOM 或 Bug），Systemd 可以配置 `Restart=always` 自动拉起。服务器重启后，服务也可以自动复活。
    

#### 配置文件解剖

位置：`/etc/systemd/system/你的服务名.service`

```Ini, TOML
[Unit]
Description=服务描述
After=network.target  # 只有连上网了才启动

[Service]
User=root             # 以谁的身份运行
WorkingDirectory=/path/to/project
# 启动命令 (必须是绝对路径)
ExecStart=/path/to/venv/bin/python -m uvicorn main:app ...
# 崩溃自动重启
Restart=always

[Install]
WantedBy=multi-user.target # 类似于 Windows 的“正常启动模式”
```

#### 常用管理命令

|**动作**|**命令**|
|---|---|
|**重载配置** (改了.service后必做)|`systemctl daemon-reload`|
|**开启开机自启**|`systemctl enable <服务名>`|
|**启动服务**|`systemctl start <服务名>`|
|**停止服务**|`systemctl stop <服务名>`|
|**查看状态** (排错神器)|`systemctl status <服务名>`|
|**查看日志**|`journalctl -u <服务名> -f`|

---

引入 CI/CD 和进程守护之后，现在的 ECS 架构已经是一个标准的**现代化单体应用**：

```Plaintext
[ 用户浏览器 ]
      |
      | (自动请求)
      v
[ 阿里云 ECS ]
-------------------------------------------------------
|  1. Nginx (Systemd 服务, 80端口)                    |
|     - 静态资源 -> 指向 /var/www (由 GitHub 自动更新) |
|     - 动态 API -> 反向代理给 127.0.0.1:8000         |
|                                                     |
|  2. Python Backend (Systemd 服务, 8000端口)         |
|     - 通过 Systemd 实现进程守护                     |
-------------------------------------------------------
```