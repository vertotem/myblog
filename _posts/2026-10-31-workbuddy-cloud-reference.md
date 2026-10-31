---
layout: post
title: Workbuddy 云端玩法参考：它比你想象的能玩得多
date: 2026-10-31
author: 梦貘
categories: 技术
tags: [技术, AI]
comments: true
---

## 前言：很多人只用了它的一小半

Workbuddy 现在很多人都在用，写代码、聊天都挺方便，hy3 也免费，门槛是真的低。

但我发现一个问题：很多人把它只当成一个聊天框、一个代码助手，用完就关了。其实它云端给你的不只是一次对话，相当于腾讯顺手送了你一台能跑东西的服务器：有文件系统、有进程、有网络、有能对外发布的口子。

这篇就是把我试过的云端玩法整理成一个参考：你不用全玩，挑一个你用得上的就行。代码我只给完整示例片段，不附文件，照着片段搭一个最小能跑的版本，剩下的你自己改。

先说一句最重要的话，免得你从头手敲到尾：**下面这些思路，你都可以直接丢给 Workbuddy，让它帮你完成。** 你把“我想在云端搭一个网页终端 / 个人网盘 / DSH / 酒馆”说清楚，它会在云端沙箱里帮你装、帮你跑、帮你调试。代码片段是给你看懂原理、兜底排障用的，不是让你一个字一个字敲的。

而**发布为应用，这个只有 Workbuddy 能干，也是我推荐的做法**：服务在沙箱里跑通之后，点发布，就能直接在网页上访问，还可以直接部署到微信小程序里，很方便。不用你自己去买服务器、配域名、配反代。

## 一、网页终端：把沙箱当成一台远程主机

最直接的一个玩法，是在浏览器里开一个终端。

思路不复杂：浏览器里跑 xterm.js，后端用 WebSocket 接一个真正的交互式 bash。沙箱里没有图形界面，node-pty 编译也容易翻车，所以 pty 这层用 Python 标准库来做，不用额外装东西。

一个最小能跑的版本，大概是这样三件套。

先是 pty 桥，`pty_bridge.py`：

```python
import os, pty, sys, select

# 打开一对 pty，fork 出 bash，让它以为自己连着真终端
pid, fd = pty.fork()
if pid == 0:
    os.execvp("bash", ["bash", "-l"])
else:
    # 父进程：stdin -> pty，pty -> stdout，二进制直通
    while True:
        r, _, _ = select.select([sys.stdin.buffer, fd], [], [])
        if sys.stdin.buffer in r:
            data = os.read(0, 4096)
            if not data:
                break
            os.write(fd, data)
        if fd in r:
            try:
                data = os.read(fd, 4096)
            except OSError:
                break
            if not data:
                break
            sys.stdout.buffer.write(data)
            sys.stdout.buffer.flush()
```

然后是 Node 后端，`server.js`，只依赖 express 和 ws：

```js
const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const { spawn } = require("child_process");
const path = require("path");

const app = express();
app.use(express.static(path.join(__dirname, "public")));
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

wss.on("connection", (ws) => {
  // 每个 WebSocket 连接，起一个独立的 pty 进程
  const pty = spawn("python3", [path.join(__dirname, "pty_bridge.py")], {
    stdio: ["pipe", "pipe", "pipe"],
  });
  pty.stdout.on("data", (d) => ws.readyState === 1 && ws.send(d));
  ws.on("message", (d) => pty.stdin.write(d));
  ws.on("close", () => pty.kill());
  pty.on("exit", () => ws.readyState === 1 && ws.close());
});

server.listen(3000, () => console.log("webssh on 3000"));
```

前端 `public/index.html`，核心就这几行：

```html
<!doctype html>
<html><head>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/xterm@5.3.0/css/xterm.css">
  <script src="https://cdn.jsdelivr.net/npm/xterm@5.3.0/lib/xterm.js"></script>
</head><body>
  <div id="term"></div>
  <script>
    const term = new Terminal({ cursorBlink: true });
    term.open(document.getElementById("term"));
    const ws = new WebSocket(`ws://${location.host}`);
    ws.binaryType = "arraybuffer";
    ws.onmessage = (e) => term.write(new Uint8Array(e.data));
    term.onData((d) => ws.readyState === 1 && ws.send(new TextEncoder().encode(d)));
  </script>
</body></html>
```

跑起来之后，终端能用，vim、htop 这种交互程序也能用。发布的时候注意端口要对齐，发布平台记录的端口和你实际监听的端口不一致，就会出现“刚部署能打开，过一会儿 504”。

## 二、个人网盘：文件就在文件树里，不是什么黑盒

第二个玩法，是把云端当成一个单用户网盘。

这个我喜欢它轻：Node + Express 就够了，不用数据库，不用对象存储。鉴权就靠一个 UUID，拿到 UUID 就能全权读写，所以这个 UUID 千万别公开、别写进公开文章里。

一个最小能跑的版本，`server.js`：

```js
const express = require("express");
const fs = require("fs");
const path = require("path");
const multer = require("multer");

const DATA = path.join(__dirname, "data");
const UUID = process.env.PAN_UUID || "换成你自己的随机 UUID";
fs.mkdirSync(DATA, { recursive: true });

const app = express();
app.use(express.static(path.join(__dirname, "public")));

// 鉴权：所有 /api 都要带对 UUID
app.use("/api", (req, res, next) => {
  if (req.headers["x-auth-uuid"] !== UUID) return res.status(401).json({ ok: false });
  next();
});

app.get("/api/ls", (req, res) => {
  const dir = path.join(DATA, req.query.dir || "");
  const list = fs.readdirSync(dir, { withFileTypes: true }).map((e) => ({
    name: e.name,
    dir: e.isDirectory(),
    size: e.isDirectory() ? 0 : fs.statSync(path.join(dir, e.name)).size,
  }));
  res.json({ ok: true, list });
});

app.get("/api/download", (req, res) => {
  res.download(path.join(DATA, req.query.path || ""));
});

const upload = multer({ dest: path.join(DATA, ".tmp") });
app.post("/api/upload", upload.single("file"), (req, res) => {
  const dest = path.join(DATA, req.query.path || req.file.originalname);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.renameSync(req.file.path, dest);
  res.json({ ok: true });
});

app.listen(3000, () => console.log("onepan on 3000"));
```

数据目录里的 `data/` 就是真实的文件树，目录名就是文件夹名。备份的时候直接拷这个目录就行，不用导什么数据库。

## 三、DSH：先说它是什么，再说怎么跑

### DSH 是什么

DSH 是 DeepSeek Harness 的缩写，简单说就是 DeepSeek 出的一个 Agent 编程工具，跟 Claude Code、Codex 是一个赛道的东西：能在终端里跑，也能跑一个 Web 界面，让 Agent 直接在项目里读代码、改代码、跑命令、做多步任务。

它跟普通聊天框的区别是，它不是只给你一段回答，而是真的在沙箱里动手：建工作区、开会话、记住项目结构、一步步把任务做完。所以把它放进 Workbuddy 云端，特别合适：云端本来就有文件系统和进程，DSH 正好在上面跑。

还有一点要明说：**DSH 的底线比 Workbuddy 本体低很多。** Workbuddy 本体里很多不让碰、动不动就拒绝的话题，到了 DSH 这里就能谈、就能做，比如逆向、网安这些。同样一个问题，你在 Workbuddy 本体里问会被挡，在 DSH 里往往能直接往下做，这也是很多人专门把它搬到云端跑的原因之一。当然，底线低不等于没有底线，你拿它做自己的代码分析、做授权范围内的安全研究是一回事，拿去碰别人的系统是另一回事，这条线还是要自己守住。

### 怎么跑：配你自己的 API

DSH 本身不带免费模型，用的时候配你自己的 API 就行，比如在启动前设置环境变量，或者在 Web 界面的设置里填你自己的 key：

```bash
# Node 版本有硬要求，太老的 Node 装不上，尽量用较新的 22
export PATH=/root/.nvm/versions/node/v22.23.4/bin:$PATH
npm install -g @deepseek-ai/dsh

# 配你自己的 API，不要把 key 写进公开文章里
export DEEPSEEK_API_KEY="你的 key"
export DSH_HOME=/root/.dsh

# 先跑一次初始化，再启动 Web 版
dsh --profile web --help
dsh --profile headless --help
dsh web
```

跑通之后，你可以在浏览器里直接用 DSH，也可以用无图形环境的办法创建工作区和会话，拿到会话 id 之后再去对话。这条路的好处是，云端跑着的 Agent 不用你本地一直开着电脑。

### 跑不通，先试 ghfast

GitHub 在国内访问本来就不方便，沙箱里拉源码、装插件经常直接 403 或者静默失败。跑不通的时候，别先怀疑是 DSH 坏了，先试 ghfast 加速：

```bash
# 拉源码走 ghfast 镜像前缀
git clone https://ghfast.top/https://github.com/deepseek-ai/deepseek-harness

# git 协议也被重写到 ghfast，免得 pnpm / 插件安装时走 ssh 失败
git config --global --add url."https://ghfast.top/https://github.com/".insteadOf "git@github.com:"
git config --global --add url."https://ghfast.top/https://github.com/".insteadOf "ssh://git@github.com/"
```

插件安装也是同理：先 git clone 到本地，再从本地路径装，比直接在线装稳得多。

### 那两个插件是干啥的

DSH 好用，但用久了有两个痛点，刚好对应两个插件：

**1. dsh-purge：清洗提示词、沙箱、审批**

痛点是：会话越跑越长，系统提示词越堆越厚，沙箱里临时文件越来越多，审批弹窗也越来越多，最后要么上下文爆了，要么跑得越来越慢，要么每一步都要你点确认。

dsh-purge 就是干清洗的：把多余的提示词、沙箱垃圾、重复审批清理掉，让长会话能继续跑下去。装完打补丁、重启 DSH 才能生效，回滚也有对应的命令，不用怕改坏了回不来。

示例思路：

```bash
git clone https://ghfast.top/https://github.com/kingcharleslzy-ai/dsh-purge /root/dsh-purge
cd /root/dsh-purge && npm install --omit=dev
DSH_PERMISSION_MODE=danger-full-access dsh plugin --profile web add /root/dsh-purge
# 打补丁、看状态、重启 DSH 后生效
node /root/dsh-purge/bin/dsh-purge.js --status
node /root/dsh-purge/bin/dsh-purge.js --apply
```

**2. meow-memory：跨会话记忆**

痛点是：DSH 每个新会话都是失忆的，项目背景、你的偏好、上次做到哪了，都得重新讲一遍。讲少了它跑偏，讲多了又占上下文。

meow-memory 是给 DSH 加一层记忆的插件，底层是 SQLite 存多层记忆，提供记忆的写入、搜索、读取、更新等工具。新会话开始时，它会注入一段“记忆导引”，让 Agent 先想起这个项目之前的事，再开始干活。

示例思路：

```bash
# 先把 git 协议重写到 ghfast，再装，不然容易 ssh 失败
git config --global --add url."https://ghfast.top/https://github.com/".insteadOf "git@github.com:"
dsh plugin --profile web add github:Phant0Meow/dsh-meow-memory
# 重启 DSH Web 版，新会话出现“记忆导引”注入，就是跑起来了
```

这两个插件装完，都要重启 DSH 才能生效，发布的时候也别忘了端口对齐和看门狗保活，死了能自动拉起来（看门狗具体怎么做，见第五节）。

## 四、酒馆：先说它是什么，再说实话

### 酒馆是干啥的

SillyTavern，国内一般叫酒馆，是一个开源的聊天前端，专门用来跑角色扮演、大模型对话的。它本身不是模型，而是一个“壳”：角色卡、世界书、聊天记录、分支、预设，这些都在酒馆里管，模型要你自己另外接。

所以它的玩法是：酒馆负责界面和角色扮演的体验，模型负责出文字。你在酒馆里配好你自己的 API，比如一个 OpenAI 兼容的接口地址和模型名，就能开始聊。

示例配置思路：

```json
{
  "api": "openai-compatible",
  "base_url": "你自己的 API 地址",
  "model": "你自己的模型名"
}
```

安装本身不难，完整流程就是拉源码、装依赖、改配置、启动：

```bash
git clone https://ghfast.top/https://github.com/SillyTavern/SillyTavern.git
cd SillyTavern && npm install
node server.js --port 8010 --listen --disableCsrf
```

注意两点：端口要写死，和配置文件里的端口一致，不要用变量端口；还有酒馆默认的白名单只放行本机，发布出来访问会被拦，得把白名单关掉，改用酒馆自己的账户登录来兜底。

### 实话：只是能跑，体验不好

这节我得先把丑话说前面：**酒馆在云端只是能跑，体验不好，装了插件就巨卡。**

云端沙箱的资源本来就有限，酒馆本身又是个重前端，插件一多，页面响应、消息流式输出都会明显变慢。你要是只想简单聊聊角色卡、试试世界书，那能跑；你要是想装一堆插件、当成主力聊天工具长期用，大概率会被卡劝退。

所以我对酒馆的建议是：当成一个“能跑的参考玩法”就行，别对它在云端的流畅度抱太高期望。模型那头也一样，配你自己的 API，别走别的旁门左道。另外，酒馆比 DSH 更要配看门狗，不然你第二天打开，很可能就是一个已经挂了的页面（做法见第五节）。

## 五、看门狗：沙箱会死，DSH 和酒馆都要有人看着

前面 DSH 和酒馆那两节，我只提了“看门狗保活”这个词，没展开讲，这节补上。因为这点很关键：**云端沙箱是会死的，你今天跑起来的服务，明天不一定还在。**

### 沙箱为什么会死

先把预期摆正：云端沙箱不是你买的一台 VPS，不会永远开着。它是一次性的执行环境，会话结束、长时间闲置、内存爆了、平台回收，进程都可能被清掉。你在终端里用 `nohup`、`setsid` 手动拉起来的进程，尤其容易死——会话一回收，进程树就跟着没了。

所以 DSH 和酒馆这种“你希望随时打开就能用”的服务，不能只靠“启动一次就完事”，得有人在旁边看着，死了就拉起来。这个“看着的人”，就是看门狗。

### 看门狗是什么

看门狗不是什么高深的东西，就是一个很小的、一直在循环的脚本，每隔 10 秒左右检查一轮：

- 进程还在不在？
- 端口通不通、页面能不能打开？

只查进程是不够的，因为有一种更常见的死法是“假死”：进程还在，但页面已经卡住了、接口已经不回了。所以看门狗要查健康，不只是查进程，`curl` 一下本地端口，能返回东西才算活着。

查到死了，就杀掉残留进程，重新按原来的启动命令拉起来，顺手记一条日志。查到活着，就什么都不做，继续等下一轮。

### 怎么用：一个通用模板

下面是一个完整示例，你把前面几个变量换成自己的，就能直接用。DSH 和酒馆都适用，只是端口和启动命令不一样：

```bash
#!/bin/bash
# watchdog.sh：通用看门狗，每 10 秒检查一轮
APP_NAME="myapp"                 # 随便起个名字，只用来写日志
APP_DIR="/opt/myapp"             # 服务所在目录
PORT=8010                        # 服务监听的端口
START_CMD="node server.js --port 8010 --listen"  # 原来的启动命令，原样写
LOG_FILE="/root/watchdog.log"    # 日志文件，死了、重启了都记在这里

# 防重复：已经有一个看门狗在跑，就不要再起一个
exec 9>/tmp/watchdog.lock
flock -n 9 || exit 0

restart_count=0
last_reset=$(date +%s)

while true; do
  # 健康检查：端口能 curl 通，才算活着
  if ! curl -fs "http://127.0.0.1:${PORT}/" >/dev/null 2>&1; then
    now=$(date +%s)
    # 一小时内重启超过 5 次，就先停下来，别无限循环重启
    if [ $((now - last_reset)) -gt 3600 ]; then
      restart_count=0
      last_reset=$now
    fi
    if [ "$restart_count" -ge 5 ]; then
      echo "$(date '+%F %T') [${APP_NAME}] 重启太频繁，先停下来，请手动检查" >> "$LOG_FILE"
      sleep 60
      continue
    fi

    echo "$(date '+%F %T') [${APP_NAME}] 检测到服务已死，正在重启" >> "$LOG_FILE"
    # 先清掉残留进程，避免旧进程占着端口、新进程起不来
    pkill -f "$START_CMD" 2>/dev/null || true
    sleep 1
    cd "$APP_DIR" || exit 1
    setsid nohup bash -c "$START_CMD" >> "$LOG_FILE" 2>&1 < /dev/null &
    restart_count=$((restart_count + 1))
  fi
  sleep 10
done
```

启动它本身，也要用 `setsid`，别让它挂在你当前这个终端会话上：

```bash
setsid nohup bash watchdog.sh >/dev/null 2>&1 < /dev/null &
```

DSH 和酒馆，换变量就是这样：

```bash
# DSH：端口换成 DSH Web 的端口，启动命令换成 dsh web
PORT=3000
START_CMD="dsh web"

# 酒馆：端口和启动命令写死，和配置文件里的端口一致
PORT=8010
START_CMD="node server.js --port 8010 --listen --disableCsrf"
```

### 推荐的做法：三层，别只靠一层

我推荐的做法是三层，缺一层都容易在半夜掉链子：

**第一层，发布平台接管，这是主力。** 服务跑通之后，走 Workbuddy 的发布为应用，把启动命令注册进平台。平台本身就是最大的看门狗，服务死了它会拉起来，沙箱冷启动它也会按启动命令重新拉。这是前面说的“只有它能干、也是推荐做法”的原因。

**第二层，看门狗脚本兜底。** 发布平台之外，再挂一个上面这种 10 秒一轮的看门狗，专门对付“进程还在但假死”“端口被旧进程占了”这种平台不一定能立刻发现的情况。DSH 那种“页面永远卡在正在启动”的问题，很多时候就是旧进程没清干净，看门狗每轮清一次残留，比手动 `pkill` 稳得多。

**第三层，看门狗自己也要有人看着。** 看门狗如果只是沙箱里的一个后台进程，沙箱一回收它自己也死了。所以再加一个更小的 supervisor，每 10 秒确认看门狗还在不在，不在就重启它，形成“supervisor → 看门狗 → 服务”这样一条自愈链。沙箱休眠恢复之后，你新开一个 shell，这条链就能重新全套复活。

还有两点容易忽略：

- **数据要落在磁盘上，别只放内存里。** DSH 的工作区、会话、配置，酒馆的聊天记录、角色卡，都要确认是写在持久目录里的，这样服务重启之后，数据还在，只是服务重启，不是重装。
- **日志要留着，别重启了就不知道为什么死。** 看门狗每次重启都记一条时间、原因，服务自己的日志也别丢。排障的时候，先看日志里“死了几次、什么时候死的”，比上来就重装快得多。

一句话总结：**沙箱会死是常态，不是 bug。** 你要做的不是祈祷它不死，而是让它死了能自己活过来。发布平台是第一层，看门狗是第二层，看门狗的 supervisor 是第三层，三层都配上，DSH 和酒馆才能算“随时能打开”。

## 六、控制台文件管理器：不用发布，直接进沙箱

上面几个玩法，都是“把服务发布出来”。还有一种更直接的：不用发布任何东西，直接在浏览器控制台里跟沙箱说话。

打开一个 Workbuddy 会话页，F12 打开控制台，粘贴下面这个完整示例，就能列目录、下载、执行命令：

```js
(async () => {
  // 1. 从当前会话页 URL 里拿会话 id
  const cid = location.pathname.match(/\/conversation\/(\d+)/)[1];

  // 2. 用当前登录态拿沙箱端点和 token
  const sess = await fetch(`/console/as/conversations/${cid}/session`, {
    credentials: "include",
  }).then((r) => r.json());
  const BASE = sess.data.e2bDataEndpoint || sess.data.sandboxDataLink;
  const TOK = sess.data.token;
  const HOME = sess.data.homeDir || "/root";

  const headers = {
    "Content-Type": "application/json",
    "Connect-Protocol-Version": "1",
    "X-Access-Token": TOK,
  };

  // 3. 列目录
  async function ls(dir) {
    const r = await fetch(`${BASE}/filesystem.Filesystem/ListDir`, {
      method: "POST",
      headers,
      body: JSON.stringify({ path: dir || HOME }),
    });
    console.log(await r.json());
  }

  // 4. 执行命令：Connect 协议的分帧是 1 字节 flags + 4 字节大端长度 + JSON
  async function exec(cmd) {
    const payload = JSON.stringify({
      command: "bash",
      args: ["-lc", cmd],
      env: {},
    });
    const buf = new Uint8Array(5 + payload.length);
    buf[0] = 0;
    new DataView(buf.buffer).setUint32(1, payload.length, false);
    new TextEncoder().encodeInto(payload, buf.subarray(5));
    const r = await fetch(`${BASE}/process.Process/Start`, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/connect+json" },
      body: buf,
    });
    console.log("exec started, status:", r.status);
  }

  // 5. 下载：大文件记得用 identity，不要让浏览器自动处理编码
  async function download(remotePath) {
    const r = await fetch(`${BASE}/files?path=${encodeURIComponent(remotePath)}`, {
      headers: { "X-Access-Token": TOK, "Accept-Encoding": "identity" },
    });
    const blob = await r.blob();
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = remotePath.split("/").pop();
    a.click();
  }

  window.__CLOUD = { ls, exec, download, BASE, HOME };
  console.log("ready: __CLOUD.ls(), __CLOUD.exec('ls -la'), __CLOUD.download('/root/a.txt')");
})();
```

这段话要说清楚：**这个 token 拿到手，就等于拿到了这个沙箱的全部文件和命令执行权限。** 所以只能在你自己的会话页里用，别在来路不明的页面贴，别把 token 发给别人，用完就把页面关掉。

## 七、为什么能这么玩：云端沙箱本身就是一台微虚拟机

上面这些玩法能成立，不是运气好，是因为云端沙箱的底层本来就是一台隔离的微虚拟机。这一节我展开讲一点，因为看懂这一层，你才能自己开发出新的玩法，而不是只会照抄上面几个。

### 先说 Firecracker：亚马逊的那套东西

Firecracker 是亚马逊 AWS 在 2018 年开源的一个虚拟机监控器（VMM），最早就是给 Lambda、Fargate 这种无服务器 workload 用的。它用 Rust 写，跑在 KVM 上面，特点是：只给每个沙箱一个最小的 Linux 内核和刚好够用的设备模拟，不搞一整套传统虚拟机的设备。

所以它比传统虚拟机轻得多，又比普通容器隔离得狠：每个沙箱有自己的内核，逃逸得先逃出 hypervisor，而不是只逃出一个共享内核。官方说法是，启动在 125 毫秒左右，单个实例的内存开销只有几 MiB。

亚马逊的文档，我把几个最有用的入口放在这里，你照着读就能自己往下挖：

- AWS 官方博客，Firecracker 开源介绍：https://aws.amazon.com/blogs/opensource/firecracker-open-source-secure-fast-microvm-serverless/
- Firecracker 官方入门，Getting Started：https://jonathanwoollett-light.github.io/firecracker/book/book/getting-started.html
- Firecracker API 的 Swagger 定义：https://raw.githubusercontent.com/firecracker-microvm/firecracker/main/src/firecracker/swagger/firecracker.yaml
- E2B 的文档入口：https://e2b.dev/docs/sdk-reference/js-sdk/v1.0.6/filesystem

### Firecracker 是怎么被控制的

Firecracker 本身不带内核，也不带根文件系统，它只是一个 VMM 进程。你要先给它一个未压缩的 Linux 内核镜像（vmlinux）和一个 ext4 根文件系统镜像（rootfs），再通过一个 Unix Socket 上的 REST API 去配置它、启动它。

一个完整的操作流程，示例就是这样：

```bash
# 1. 启动 Firecracker，监听 API Socket
./firecracker --api-sock /tmp/firecracker.socket &

# 2. 配内核
curl --unix-socket /tmp/firecracker.socket -i -X PUT 'http://localhost/boot-source' \
  -H 'Content-Type: application/json' \
  -d '{"kernel_image_path": "./vmlinux", "boot_args": "console=ttyS0 reboot=k panic=1 pci=off"}'

# 3. 配根文件系统
curl --unix-socket /tmp/firecracker.socket -i -X PUT 'http://localhost/drives/rootfs' \
  -H 'Content-Type: application/json' \
  -d '{"drive_id": "rootfs", "path_on_host": "./rootfs.ext4", "is_root_device": true, "is_read_only": false}'

# 4. 配 CPU 和内存
curl --unix-socket /tmp/firecracker.socket -i -X PUT 'http://localhost/machine-config' \
  -H 'Content-Type: application/json' \
  -d '{"vcpu_count": 1, "mem_size_mib": 128}'

# 5. 启动
curl --unix-socket /tmp/firecracker.socket -i -X PUT 'http://localhost/actions' \
  -H 'Content-Type: application/json' \
  -d '{"action_type": "InstanceStart"}'
```

它只模拟很少的设备：virtio-net（网络）、virtio-blk（块设备）、vsock（宿主和虚拟机之间的通道）、entropy，再加一个串口控制台和一个用来停机的键盘控制器。没有 PCI、没有 ACPI、没有 USB，设备面越小，攻击面就越小。

快照也是它的一大卖点：你可以把一个跑起来的微虚拟机暂停、存成快照，下次直接从快照恢复，不用重新走一遍启动流程。这就是为什么很多沙箱平台能做到“毫秒级启动”：它们不是每次都从零启动，而是在恢复一个已经准备好的快照。

### 再说 envd：沙箱里的“管家”

每个 E2B 沙箱里都跑着一个叫 envd 的守护进程。它就是上面那段控制台代码真正对话的对象，也是你开发新玩法时最值得看的一层：

- 文件系统：`Filesystem` 服务，`ListDir`、`Stat`、`MakeDir`、`Move`、`Remove`，还有 `WatchDir` 可以监听目录变化；
- 进程：`Process` 服务，`Start`、标准输入输出流、终端管理；
- 文件传输：大文件走 HTTP REST 流式传输，小的控制消息走 ConnectRPC；
- 其他 REST 端点：`/health`、`/metrics`、`/init`、`/freeze`，可以用来做健康检查、初始化、暂停沙箱。

这就是为什么那段控制台代码能用浏览器直接操作沙箱：会话接口先通过登录态，把沙箱端点和 token 交给你，浏览器拿到这两样，就能直接对 envd 发请求，不用再经过业务后端。

用一张图来想就是：

```
浏览器 / 发布出来的应用
  → 沙箱里的 envd
  → envd 再去操作文件系统 / 启动进程
  → 底层是 Firecracker 微虚拟机在隔离
```

### 看懂这一层，你能自己开发什么

看懂 Firecracker + envd，你就不只会照抄上面几个玩法了，你可以自己想新的：

- 代码执行器：用 `Process.Start` 跑任意命令，用 `Filesystem` 读写文件，就是一个在线代码运行器；
- 文件同步工具：用 `WatchDir` 监听目录变化，变化了就同步、备份、触发下一步；
- 自定义终端：用 PTY 那套接口，自己做一个比 WebSSH 更贴合你需求的终端；
- 定制沙箱模板：把你常用的依赖、工具、配置文件打进一个模板里，下次启动就是开箱即用的环境，不用每次都重装；
- 定时任务 / 常驻服务：沙箱里跑一个服务，再通过 Workbuddy 发布出来，就是一个长期可用的小应用。

思路都是一样的：**沙箱给你的是文件、进程、终端这三个基本能力，上面那几个玩法只是这三个能力的组合方式不同。** 你换一种组合，就是一个新的玩法。

## 八、还有一种玩法，只提一嘴，不建议玩

还有一种玩法，我只提一嘴，不建议你玩：有人把 Workbuddy 的免费模型反代出来，拿到别的地方去用。

现在这条路风控很严，腾讯上游会检查提示词，查到了轻则限流，重则封号。我自己就是因为这个被封过，所以这篇不写它的具体做法，也不建议你去试。

免费的东西，能在它自己的云端里玩，就已经够多了，没必要为了把它搬出去，把号搭进去。

## 结尾

总结一下，Workbuddy 云端不只是聊天和写代码：

- 想有个随时能进的终端，就搭 WebSSH；
- 想存点文件、随取随用，就搭个人网盘；
- 想跑 Agent，就把 DSH 发布出来，配你自己的 API；
- 想玩角色扮演，就把酒馆跑起来，但别对体验抱太高期望；
- DSH 和酒馆都要配看门狗，沙箱会死是常态，死了能自己活过来才算随时能用；
- 临时要翻沙箱、救数据，就用控制台那段代码直接进；
- 想自己开发新玩法，就去看 Firecracker 和 envd 的文档，从文件、进程、终端这三个基本能力往外组合。

挑一个你现在用得上的，先丢给 Workbuddy 让它帮你跑通一个，再慢慢加。云端玩法比想象的多，关键不是它能不能跑，而是你有没有把它当成一台服务器来用。
