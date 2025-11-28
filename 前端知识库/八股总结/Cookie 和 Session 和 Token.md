我们谈到 `Cookie`，`Session` 和 `Token` 时，其实基本上和维持客户端状态和鉴权有关，拿一个登录的场景举例：

如果我们不采取任何方案，每次用户登录，都需要重复地将用户名和密码发送给服务器进行鉴权。这么做有两个风险：

1. 通过 HTTP 明文传输密码和用户名，容易造成泄露等安全问题。
2. 重复地将用户名和密码发送给服务器验证，增加了服务器的负担。
所以我们常会采用 Cookie，Session 和 Token 来进行客户端状态的保存与鉴权方法的优化，避免客户端反复输入用户名和密码进行登录的场景。这三个方法也各有好坏，下面我们详细分析一下：

# Cookie
Cookie 最初被设计出来是为了解决**如何记住用户状态**的问题（例如，用户是否登录）。可通过 `Expires` 或 `Max-Age` 属性设置一个明确的过期时间。Cookie 最核心的特征是**自动在浏览器请求中发送**。为了保证安全性，可设置访问限制：

+ `HttpOnly`：无法通过 JavaScript 的 `document.cookie` API 访问，能有效防止XSS攻击窃取Cookie。
+ `Secure`：只能在 HTTPS 协议下被发送到服务器。
+ `Samesite`：限制第三方网站对该 cookie 的发送行为

浏览器发送 HTTP 请求，服务器会通过`Set-Cookie`请求头进行 Cookie 设置，Cookie 中有`Name`和`Value`两个重要属性，这两个属性都是直接设置数据的，不会进行任何加密！将 Cookie 发送给浏览器后，浏览器会将 Cookie 保存起来，以后的每一个请求都会自动携带上这个 Cookie（但是可以通过 Samesite 属性控制）。

![](https://cdn.nlark.com/yuque/0/2025/png/53866714/1756225136437-bc25f2be-913e-4c19-9484-0484484af2ef.png)

# Session
顾名思义：Session 代表浏览器和服务器的“一次对话”。Session 的生命周期主要由服务器控制。它可以通过代码中 `cookie.maxAge` 的属性来设置 Session ID 这个 Cookie 在浏览器端的过期时间。服务器接收到以后，会生成一个`SessionID`，以键值对的方式来存储整个 Session 对象（比如包含用户信息的一些载荷），通过`Cookie`将这个 ID 发送给浏览器，根据浏览器**每个请求都会自动发送 Cookie 到服务器**的特点，此后的每一次请求，浏览器都会自动携带上 Cookie，直到** Cookie 的有效期失效。**一般浏览器就会自行删除这个 Cookie，这个时候，用户就得重新输入用户名和密码了！

在实际开发中，Cookie 和 Session 常常是配合一起使用的，这里我们来看看代码：

```javascript
import express from "express";
import session from "express-session";

const app = express();

// 配置 session 中间件
app.use(
  session({
    secret: "example-session-secret", // 用于加密 session id 的密钥
    resave: false, // 是否每次请求都重新保存 session
    saveUninitialized: false, // 是否自动保存未初始化的 session
    cookie: {
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 天后 Cookie 过期
      httpOnly: true, // 仅允许服务端访问 cookie
    },
  })
);

// 登录接口，设置 session
app.post("/login", (req, res) => {
  // 假设登录校验通过
  req.session.userId = "example-id";
  res.send("登录成功，Session 已设置");
});

// 需要登录的接口
app.get("/profile", (req, res) => {
  if (req.session.userId) {
    res.send(`欢迎，用户 ${req.session.userId}`);
  } else {
    res.status(401).send("未登录");
  }
});

// 退出登录，销毁 session
app.post("/logout", (req, res) => {
  req.session.destroy(() => {
    res.send("已退出登录");
  });
});
```

**Session 存在的问题：**Session 可以说是**一种服务器端保存状态的解决方法（通过保存 SesstionID）**，而当 SessionID 过多时，服务器就会面临**大量存储 SessionID 的问题，**如果分散 SessionID 到多台服务器，又会面临**服务器之间的通信问题。**总之，Session 仍然不是一种优雅的解决方案。

# Token
Token 最常用的实现方式是`JSON Web Token`。与**存储在服务器的 Session 不同**，**Token 的存储发生在浏览器端，即通过 Cookie 或者 Storage 的形式进行存储。**若存储在 Storage 中，前端代码就可以在每次发生请求时取出 Token 并设置在`Authorization`请求头中，比如在 Axios 中的 Request Interceptor 中：

```typescript
instance.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const { token } = localStorage.getItem("token");
    config.headers = config.headers ?? {};
    config.headers["Authorization"] = `Bearer ${token}`;
    return config;
  },
  (error: AxiosError) => Promise.reject(error)
);
```

此后后端就可以拿到 Token 并进行验证了！来看看后端签发和验证 Token 的有关代码：

```javascript
import jwt from "jsonwebtoken";
import express from "express";

const app = express();

// 登录接口，签发 Token
app.post("/login", (req, res) => {
  // ... 验证用户名密码 ...
  const token = jwt.sign({ userId: user.id }, JWT_SECRET_KEY, { expiresIn: '7d' });
  // 将 token 发送给客户端。可以选择在响应体或 Cookie 中发送。
  res.json({ message: "登录成功", token });
});

// 一个需要认证的接口，验证 Token
app.get("/protected-route", (req, res) => {
  // 通常从请求头的 Authorization 字段获取 token
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // 格式：Bearer <token>

  if (!token) {
    return res.sendStatus(401);
  }

  jwt.verify(token, JWT_SECRET_KEY, (err, decodedPayload) => {
    if (err) {
      return res.sendStatus(403); // Token 无效或过期
    }
    // 验证通过，decodedPayload 就是当时签发的 payload (如 { userId: '...' })
    req.userId = decodedPayload.userId;
    res.send("你有权访问这个资源!");
  });
});
```

其实 Token 的解决方案也不是十全十美。存储在浏览器 Storage 的 Token 会面临 XSS 攻击的风险（直接读取`window.localStorage`中的 Token 然后注入恶意脚本）。相比之下，`httpOnly Cookie`存储的 Token，JavaScript 无法直接访问，可以降低 XSS 风险。