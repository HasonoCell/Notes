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

## 6. 一个简单的前后端分离架构
```graph TD
    subgraph Client [用户端 (Browser/App)]
        Browser[浏览器]
    end

    subgraph Aliyun_ECS [阿里云 ECS 服务器 (IP: 39.107.xxx.xxx)]
        
        %% 入口层
        Nginx[Nginx 网关]
        
        %% 防火墙示意
        Firewall{阿里云安全组}
        
        %% 静态资源区 (文件系统)
        subgraph FileSystem [文件系统 /var/www]
            ReactDist[React 打包文件 (dist)]
            indexHTML[index.html]
        end
        
        %% 后端服务区 (本机回环)
        subgraph Backend [后端服务 (Localhost)]
            FastAPI[Python FastAPI 服务]
            DB[(未来可接数据库)]
        end
    end

    %% 流量路径
    Browser -- HTTP请求 (Port 80) --> Firewall
    Firewall -- 允许通过 --> Nginx

    %% Nginx 分流逻辑
    Nginx -- 路径是 / --> ReactDist
    ReactDist -. 找不到文件 (try_files) .-> indexHTML
    
    Nginx -- 路径是 /api --> FastAPI
    FastAPI -- JSON 数据 --> Nginx
    
    %% 端口标注
    style Nginx fill:#f9f,stroke:#333,stroke-width:2px,color:black
    style FastAPI fill:#bbf,stroke:#333,stroke-width:2px,color:black
    style Firewall fill:#ff9,stroke:#333,stroke-width:2px,stroke-dasharray: 5 5,color:black
```