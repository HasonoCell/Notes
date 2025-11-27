# 一些概念
镜像`(images)`：用来创建一个个容器的**模板**，类似于做蛋糕的模具。

容器`(containers)`：根据镜像，通过**虚拟技术**给**宿主机**的应用程序封装的一个个独立的运行环境，和**虚拟机**的根本区别是每个虚拟机都拥有一个操作系统的完整内核，而容器之间共用同一个系统内核

## 常用命令
`<font style="color:rgb(31, 9, 9);">docker images</font>`<font style="color:rgb(31, 9, 9);"> 列出下载的所有镜像</font>

`<font style="color:rgb(31, 9, 9);">docker ps</font>`<font style="color:rgb(31, 9, 9);"> 查看正在运行的容器 (ps 代表 process status)</font>

`<font style="color:rgb(31, 9, 9);">docker ps</font>`<font style="color:rgb(31, 9, 9);"> 查看所有容器（不管是否在运行）</font>

`<font style="color:rgb(31, 9, 9);">docker pull <镜像地址></font>`<font style="color:rgb(31, 9, 9);"> 下载镜像</font>

`<font style="color:rgb(31, 9, 9);">docker rmi <镜像名称或ID></font>`<font style="color:rgb(31, 9, 9);"> 删除镜像</font>

`<font style="color:rgb(31, 9, 9);">docker rm <容器名称或ID></font>`<font style="color:rgb(31, 9, 9);"> 删除容器，添加</font>`<font style="color:rgb(31, 9, 9);">-f</font>`<font style="color:rgb(31, 9, 9);">参数会强制清除正在运行的容器</font>

`<font style="color:rgb(31, 9, 9);">docker run <镜像名称或ID></font>`<font style="color:rgb(31, 9, 9);"> 使用镜像创建容器，会占用当前窗口</font>

`<font style="color:rgb(31, 9, 9);">docker run -d <镜像名称或ID></font>`<font style="color:rgb(31, 9, 9);"> 启用分离模式 (detached) 使用镜像创建容器，不会占用当前窗口</font>

`<font style="color:rgb(31, 9, 9);">docker run -p <宿主机端口>:<容器端口> <镜像名称或ID></font>`<font style="color:rgb(31, 9, 9);"> 启用端口映射运行容器</font>

`<font style="color:rgb(31, 9, 9);">docker run -v <宿主机文件目录>:<容器文件目录> <镜像名称或ID></font>`<font style="color:rgb(31, 9, 9);"> 启用文件映射运行容器（实现容器内数据的持久化保存）</font>

`docker run --network host <font style="color:rgb(31, 9, 9);"><镜像名称或ID></font>` 使用 host 网络模式运行容器，无需端口映射，直接通过宿主机的端口访问容器

`docker exec -it <font style="color:rgb(31, 9, 9);"><镜像名称或ID></font> /bin/sh` 为正在运行的容器启动一个交互式的 shell

`<font style="color:rgb(31, 9, 9);">docker stop</font>`<font style="color:rgb(31, 9, 9);"> <镜像名称或ID> 停止正在运行的容器</font>

`<font style="color:rgb(31, 9, 9);">docker start</font>`<font style="color:rgb(31, 9, 9);"><镜像名称或ID> 启动正在运行的容器</font>

`docker build -t <创建的镜像的名字> .`根据 Dockerfile 在当前目录内创建出镜像

# 实战
## 使用 Docker 为一个极简后端运行容器
后端代码：

```javascript
import express from "express";

const app = express();
const PORT = 4000;

app.get("/", (req, res) => {
  res.send("<h1>Hello World!</h1>");
});

app.listen(PORT, () => {
  console.log(`Server is running at port:${PORT}`);
});
```

我们使用`Dockfile`来为当前项目创建镜像的一些配置

```dockerfile
# 选择一个基础镜像
FROM node:20

# 确定镜像中的工作目录，后续的命令都是在该目录下执行的
WORKDIR /app

# 将选中的代码文件拷贝到镜像内的工作目录
COPY package.json pnpm-lock.yaml ./

# 将命令写入镜像层，当根据Dockerfile构建镜像时会被执行
RUN npm install -g pnpm && pnpm install

# 将宿主机当前目录下的所有文件拷贝到镜像内的工作目录
COPY . .

# 暴露出当前的服务器端口
EXPOSE 4000

# 当由此镜像创建出来的容器启动时自动运行命令
CMD ["pnpm", "dev"]
```

同时创建`.dockerignore`创建Docker忽略文件

```plain
node_modules
npm-debug.log
.DS_Store
.git
```

随后执行`docker build -t dock-test .`就可以根据该 Dockfile 创建出来对应的镜像

再执行`docker run -d -p 4000:4000 --name docker-test-container docker-test`创建容器，访问 4000 端口即可看到内容

随后，可以使用`docker rm -f docker-test-container`强制移除容器

## 将镜像推送到 Docker Hub 上
执行`docker login`登录到 Docker Hub，返回结果中着重关注这两行

```plain
Your one-time device confirmation code is: QFCC-QBVX
Press ENTER to open your browser or submit your device code here: https://login.docker.com/activate
```

登录网址，将验证码填入，显示出`Login Succeeded`代表登录成功

然后在构建镜像时添加上自己的用户名，例如：`docker build -t hasonocell/docker-test .`

最后推送到 Docker Hub 上：`docker push hasonocell/docker-test`，成功后，仓库地址为`docker.io/hasonocell/docker-test`

如果有人想使用你的进行，那就直接运行`docker pull hasonocell/docker-test`

## 使用 Docker Compose 管理多个容器
`Docker Compose`是一种轻量的容器编排技术，适用于个人项目中容器数量较少的情况。

假设一个全栈项目分为`be`与`fe`，各自对应的`Dockerfile`如下

```dockerfile
# be
FROM node:20

WORKDIR /app

COPY package.json pnpm-lock.yaml ./

RUN npm install -g pnpm && pnpm install

COPY . .

EXPOSE 3000

CMD ["pnpm", "dev"]

# fe
FROM node:20

WORKDIR /app

COPY package.json pnpm-lock.yaml ./

RUN npm install -g pnpm && pnpm install

COPY . .

EXPOSE 5173

CMD ["pnpm", "dev"]
```

我们可以使用`Docker Compose`来集中管理。

在项目根目录下创建`docker-compose.yaml`文件，内容如下:

```yaml
# 定义服务
services:
  be:
    # be 服务会在 be 目录下查找 Dockerfile 并构建镜像
    build: ./be
    container_name: docker_test_be
    ports:
      - "8080:3000"
  fe:
    # fe 服务会在 fe 目录下查找 Dockerfile 并构建镜像
    build: ./fe
    container_name: docker_test_fe
    ports:
      - "5173:5173"
```

`docker-compose.yaml` 文件的工作流程如下：

1. **定义服务**  
文件中定义了两个服务：be（后端）和 fe（前端）。
2. **构建镜像**  
    - be 服务会在 be 目录下查找 Dockerfile 并构建镜像。
    - fe 服务会在 fe 目录下查找 Dockerfile 并构建镜像。
3. **创建容器**  
    - be 服务容器名为 `docker_test_be`，端口映射为 `8080:3000`（本机8080→容器3000）。
    - fe 服务容器名为 `docker_test_fe`，端口映射为 `5173:5173`。
4. **网络管理**  
Docker Compose 会自动为这两个服务创建一个专用网络，容器之间可以通过服务名互相访问。
5. **启动服务**  
根目录下运行 `docker compose up --build` 时，Compose 会自动完成上述所有步骤，并启动两个服务（--build 参数表示强制重新构建镜像）。
6. **统一管理**  
可以用 `docker compose up` 启动，用 `docker compose down` 停止并清理所有相关容器和网络。

