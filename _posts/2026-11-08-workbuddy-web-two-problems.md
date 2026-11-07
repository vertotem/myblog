---
layout: post
title: Workbuddy 网页版长期使用发现的两个问题及解决办法（持续更新）
date: 2026-11-08
author: 梦貘
categories: 技术
tags: [技术, AI]
comments: true
---

## 前言：这篇是持续更新的

Workbuddy 网页版我用了很久，不是偶尔试一下，是长期在用。长期用下来，发现了两个问题，都是那种“平时好好的，用久了突然就卡住、发不出去消息”的问题。

这两个问题都是我自己长期用的时候遇到的，下面这篇文章就是把它们整理出来：每个问题长什么样、为什么会这样、怎么用一段 F12 就能粘贴执行的代码把它修好。

先说清楚三件事：

1. **这篇会持续更新。** 每个问题下面都写了发现时间和当前状态，官方如果修了，我会在更新记录里补上修复时间和版本，你就不用再跑下面这些代码了。
2. **下面每段代码，都是 F12 粘贴、回车、直接执行就能修好的。** 不用你装东西，不用你进终端，不用你改配置。
3. **先对症状，再跑代码。** 两个问题的症状不一样，代码也不一样，别看哪个顺眼就跑哪个，跑错了没用，还可能把本来没坏的东西给动了。

## 更新记录

| 日期 | 内容 | 状态 |
| --- | --- | --- |
| 2026-11-08 | 初版：问题一、问题二 | 两个问题都未修复 |
|  | 官方修复后，在这里补一行：修复日期、修复版本、是否还需要跑代码 |  |

## 先说前提：网页版支持 E2B，所以控制台能直接修沙箱

这两段代码能成立，是因为 Workbuddy 网页版支持 E2B。

说人话就是：你打开的那个会话页，后面连着一个云端沙箱，沙箱里跑着一个叫 envd 的守护进程，专门管文件和进程。浏览器控制台拿到会话的端点和 token 之后，就能直接跟 envd 说话，不用再经过网页后端。

所以下面每段代码，干的都是同一件事：

1. 从当前会话页的 URL 里拿会话 id；
2. 用当前登录态去拿沙箱端点和 token；
3. 通过 envd 的 `process.Process/Start` 跑一段 bash，把问题修好，再把结果打印回控制台。

用法也是一样的，三个步骤：

1. 打开**出问题的那个会话页**，不是随便哪个会话页；
2. 按 `F12`，点 Console；
3. 把下面对应问题的整段代码粘贴进去，回车，等它把日志打完，再按它说的刷新页面。

安全的话我也先说在前面：**这两段代码只能在你自己的会话页里用，别在来路不明的页面贴，也别把 token 发给别人。** 代码本身只改下面说的那两个地方，不碰你的工作区文件、不碰会话记录。问题一的代码会先备份队列文件，问题二的代码只删旧的 trace 日志目录，删之前也会先打印出来给你看。

## 问题一：会话永久卡在加载中，消息发出去也不执行

- 发现时间：2026-10-24 10:12 UTC 左右，此后持续 8 小时以上不恢复
- 状态：未修复

### 症状，先对一下是不是这个

如果你遇到的是下面这样，那大概率就是这个问题：

1. 打开这个会话，永久转圈，聊天区不渲染；
2. 点“停止”没有任何反应，也没有请求发出去；
3. 新消息可以发出去，但一直停在 pending，不执行；
4. 刷新页面、切换会话、重新登录，都没用；
5. 同一个账号，其他会话都正常，只有这一个会话卡住。

第 5 条很关键，如果所有会话都卡住，那不是这个问题，别跑下面这段代码。

### 为什么会这样，我用人话讲一遍

根因就一句话：**任务队列的 `running` 租约没被释放。**

上一轮任务中途异常退出了，没有写回完成事件，队列就一直以为“有人正在执行”。新消息只能排在它后面，永远等不到执行。

但 agent 其实是空闲的：CPU 0%、没有对外连接、日志停在 `parked waiter`。所以 `running: true` 是陈旧状态，不是真的在执行。

还有两个地方会把人绕晕：

- 服务端有个 `sessionStatus` 字段，卡在 `CREATING` 8 小时不变，但另外两个接口同一个会话又说是 `completed`、`IDLE`，三个地方互相矛盾。前端如果拿 `CREATING` 当渲染门禁，就会无限转圈。
- 点“停止”走的 `session/cancel` 会返回 202，看起来像成功了，但实际上什么都没终止，`running` 还是 true。这是个假阳性。

证据就藏在一个文件里：`/root/proxy/data/queues/<会话 id>.queue.json`，里面 `running` 那个对象，还是上一轮任务留下的，没有被清除。

### F12 修复代码：清掉陈旧租约，再重启 proxy

下面这段代码，粘贴到出问题那个会话页的控制台，回车就能跑。它干了三件事：先备份队列文件，再把里面的 `running` 改成空，最后把 proxy 主进程杀掉，等 supervisord 把它拉起来，积压的消息就会被派发。

```js
(async () => {
  const m = location.pathname.match(/\/conversation\/(\d+)/);
  if (!m) { console.error('请在会话页打开，URL 要含 /conversation/<数字>'); return; }
  const cid = m[1];

  const sess = await fetch(`/console/as/conversations/${cid}/session`, {
    credentials: 'include',
  }).then(r => r.json());
  const BASE = sess.data.e2bDataEndpoint || sess.data.sandboxDataLink;
  const TOK = sess.data.token;
  const headers = {
    'Content-Type': 'application/json',
    'Connect-Protocol-Version': '1',
    'X-Access-Token': TOK,
  };

  // 跑一段 bash，返回它的输出。envd 的 Process.Start 是流式的，
  // 每帧是 1 字节 flags + 4 字节大端长度 + JSON，data.stdout 是 base64。
  async function exec(cmd) {
    const payload = JSON.stringify({ command: 'bash', args: ['-lc', cmd], env: {} });
    const buf = new Uint8Array(5 + payload.length);
    buf[0] = 0;
    new DataView(buf.buffer).setUint32(1, payload.length, false);
    new TextEncoder().encodeInto(payload, buf.subarray(5));
    const res = await fetch(`${BASE}/process.Process/Start`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/connect+json' },
      body: buf,
    });
    const reader = res.body.getReader();
    let bytes = new Uint8Array(0);
    let out = '';
    while (true) {
      const { done, value } = await reader.read();
      if (value) {
        const merged = new Uint8Array(bytes.length + value.length);
        merged.set(bytes); merged.set(value, bytes.length); bytes = merged;
      }
      // 按帧解析：flags(1) + 长度(4) + JSON
      let off = 0;
      while (bytes.length - off >= 5) {
        const flags = bytes[off];
        const len = new DataView(bytes.buffer, bytes.byteOffset + off + 1, 4).getUint32(0, false);
        if (bytes.length - off - 5 < len) break;
        const json = JSON.parse(new TextDecoder().decode(bytes.subarray(off + 5, off + 5 + len)));
        const data = json.event && json.event.data;
        if (data && data.stdout) out += atob(data.stdout);
        if (data && data.stderr) out += atob(data.stderr);
        off += 5 + len;
        if (flags === 2) { console.log(out); return out; }
      }
      bytes = bytes.slice(off);
      if (done) break;
    }
    console.log(out);
    return out;
  }

  const script = `
Q="/root/proxy/data/queues/${cid}.queue.json"
echo "== queue file =="
ls -l "$Q" || echo "queue file not found"
echo "== before =="
python3 -c "import json,sys; d=json.load(open(sys.argv[1])); print('running:', d.get('running'))" "$Q" || echo "read queue failed"
cp "$Q" "$Q.bak.$(date +%s)" && echo "backup done"
python3 -c "import json,sys; p=sys.argv[1]; d=json.load(open(p)); d['running']=None; json.dump(d, open(p,'w'), indent=2)" "$Q"
echo "== after =="
python3 -c "import json,sys; d=json.load(open(sys.argv[1])); print('running:', d.get('running'))" "$Q"
echo "== proxy pid =="
PROXY_PID=$(pgrep -f '[s]andbox-proxy' | head -n 1)
echo "proxy pid: \${PROXY_PID:-not-found}"
if [ -n "$PROXY_PID" ]; then setsid nohup bash -c "sleep 1; kill -9 $PROXY_PID" >/dev/null 2>&1 < /dev/null & echo "scheduled kill -9 $PROXY_PID in 1s"; else echo "no proxy process found, skip kill"; fi
echo "DONE: wait 10s, then refresh the page"
`;
  await exec(script);
  console.log('修复代码已执行。等 10 秒，刷新这个会话页，看积压消息有没有开始执行。');
})();
```

跑完之后是这样的：等 10 秒，刷新这个会话页，supervisord 会把新的 proxy 拉起来，读到干净的队列，之前积压的消息就会开始执行，聊天区也能正常渲染了。

如果跑完还是不行，先看控制台打出来的日志：`running` 改完是不是 `None`，`proxy pid` 有没有找到。如果 `running` 还是上一轮那个对象，说明队列文件没改对；如果 `proxy pid` 是 `not-found`，说明 proxy 进程名跟我这边的环境不一样，把日志里 `ps` 出来的进程名发给我，我再帮你对。

### 希望官方怎么修

这个问题，光靠用户自救是不够的，我希望官方这样修，优先级最高的是这一条：

**`running` 租约要加超时回收。** 比如 5 分钟没有心跳，就自动释放。这一条能覆盖绝大多数同类卡死。

另外还有：`session/cancel` 要真正终止执行体，不能只记账不执行；三个接口的 `sessionStatus` 要对齐，完成事件一定要写回；前端加载门禁要能降级，状态异常但运行时可达的时候，至少允许读历史、复制内容，而不是无限 loading。

## 问题二：trace 日志堆积，配额耗尽，会话发不出去消息

- 发现时间：累积 2026-10-31 → 2026-11-07，约 7 天触顶
- 状态：未修复

### 症状，先对一下是不是这个

如果你遇到的是下面这样，那大概率就是这个问题：

1. 会话消息完全发不出去，刷新页面也没用；
2. 报错是 `ENOENT: no such file or directory, mkdir '/root/.codebuddy/traces/1343'`，那个数字是进程号，每次可能不一样；
3. 后端进程没有重启，`/v2/chat/busy` 持续 404。

注意第 2 条里的报错很容易误导人：它说的是“没有这个文件或目录”，但真实原因不是父目录不存在，而是**磁盘配额耗尽了**。在沙箱里直接跑 `mkdir`，原话是 `Disk quota exceeded`，到了上层就被包装成了 `ENOENT`。

### 为什么会这样，我用人话讲一遍

根因是：`~/.codebuddy/traces/<pid>` 这个目录，只增不减。

每启动一个 agent 进程，就新建一个按进程号命名的子目录；每处理一次请求，就往里面写一个 `.jsonl` 文件。没有任何按“进程是否已退出”或者“总量上限”回收的机制。

更麻烦的是，清理链路有 4 层独立的缺陷，任意一层修好都不足以根治：

1. 沙箱镜像里设置了 `CODEBUDDY_DISABLE_SESSION_HISTORY_CLEANUP=1`，整个清理服务被跳过，连手动跑清理也会被同一个开关拦下来；
2. 即使清理服务在跑，定时清理也只在“存在过期会话”的时候才顺带扫描 traces，没有过期会话的时候根本不扫；
3. 即使扫描了，清理函数只认 `.json`，而实际写入的是 `.jsonl`，一个文件都删不掉，目录也永远不为空；
4. 即使后缀修对了，默认保留期是 30 天，而实测沙箱约 7 天、数百个目录就触顶了。trace 只是诊断日志，30 天相对配额来说明显过长。

所以长期复用的沙箱，用到第 7 天左右，就会因为 trace 堆积把配额耗尽，新进程连自己的 trace 目录都建不出来，会话就彻底发不出去消息了。

### F12 修复代码：只删 1 天前的旧 trace 目录

下面这段代码，粘贴到出问题那个会话页的控制台，回车就能跑。它只删 `~/.codebuddy/traces` 下面、1 天前的历史 pid 子目录，不碰会话记录、配置和工作区文件。删之前先打印数量，删完再验证一次 `mkdir` 能不能成功。

```js
(async () => {
  const m = location.pathname.match(/\/conversation\/(\d+)/);
  if (!m) { console.error('请在会话页打开，URL 要含 /conversation/<数字>'); return; }
  const cid = m[1];

  const sess = await fetch(`/console/as/conversations/${cid}/session`, {
    credentials: 'include',
  }).then(r => r.json());
  const BASE = sess.data.e2bDataEndpoint || sess.data.sandboxDataLink;
  const TOK = sess.data.token;
  const headers = {
    'Content-Type': 'application/json',
    'Connect-Protocol-Version': '1',
    'X-Access-Token': TOK,
  };

  async function exec(cmd) {
    const payload = JSON.stringify({ command: 'bash', args: ['-lc', cmd], env: {} });
    const buf = new Uint8Array(5 + payload.length);
    buf[0] = 0;
    new DataView(buf.buffer).setUint32(1, payload.length, false);
    new TextEncoder().encodeInto(payload, buf.subarray(5));
    const res = await fetch(`${BASE}/process.Process/Start`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/connect+json' },
      body: buf,
    });
    const reader = res.body.getReader();
    let bytes = new Uint8Array(0);
    let out = '';
    while (true) {
      const { done, value } = await reader.read();
      if (value) {
        const merged = new Uint8Array(bytes.length + value.length);
        merged.set(bytes); merged.set(value, bytes.length); bytes = merged;
      }
      let off = 0;
      while (bytes.length - off >= 5) {
        const flags = bytes[off];
        const len = new DataView(bytes.buffer, bytes.byteOffset + off + 1, 4).getUint32(0, false);
        if (bytes.length - off - 5 < len) break;
        const json = JSON.parse(new TextDecoder().decode(bytes.subarray(off + 5, off + 5 + len)));
        const data = json.event && json.event.data;
        if (data && data.stdout) out += atob(data.stdout);
        if (data && data.stderr) out += atob(data.stderr);
        off += 5 + len;
        if (flags === 2) { console.log(out); return out; }
      }
      bytes = bytes.slice(off);
      if (done) break;
    }
    console.log(out);
    return out;
  }

  const script = `
echo "== before =="
ls -1 ~/.codebuddy/traces | wc -l
find ~/.codebuddy/traces -maxdepth 2 -name '*.jsonl' | wc -l
env | grep CODEBUDDY_DISABLE_SESSION_HISTORY_CLEANUP || echo "cleanup env: not set"
echo "== delete pid dirs older than 1 day =="
find ~/.codebuddy/traces -mindepth 1 -maxdepth 1 -type d -mtime +1 -print -exec rm -rf {} +
echo "== after =="
ls -1 ~/.codebuddy/traces | wc -l
mkdir -p ~/.codebuddy/traces/test-quota-check && echo "mkdir OK: quota freed" && rmdir ~/.codebuddy/traces/test-quota-check
echo "DONE: try sending a message now"
`;
  await exec(script);
  console.log('修复代码已执行。删完之后直接在这个会话里发一条消息试试，能发出去就是修好了。');
})();
```

跑完之后，直接在这个会话里发一条消息试试，能发出去就是修好了。

但要提醒一句：**这个问题约一周后会复发。** 因为产生 trace 的机制没变，删完之后它还会继续长。所以这段代码不是一劳永逸的，是定期清理的办法，感觉会话又开始发不出去的时候，再跑一次，先对一下是不是上面那几个症状。

如果你想自查，不用等到发不出去才发现，也可以先跑这几行看看数量：

```bash
ls -1 ~/.codebuddy/traces | wc -l
find ~/.codebuddy/traces -maxdepth 2 -name '*.jsonl' | wc -l
env | grep CODEBUDDY_DISABLE_SESSION_HISTORY_CLEANUP
```

### 希望官方怎么修

我希望官方这样修，按优先级，最重要的三条是：

1. 修正清理函数，把 `.jsonl` 也纳入进来；
2. 沙箱镜像里的 `CODEBUDDY_DISABLE_SESSION_HISTORY_CLEANUP=1` 要重新评估，trace 日志清理不应该和 session history 共用一个总开关；
3. 定时清理每次都要无条件扫 traces，不要绑在“有过期会话”上。

再往下是：进程已退出的 pid 目录要回收、保留期从 30 天降到 3~7 天、trace 目录创建失败不应该阻塞整个消息链路、保留原始错误码不要用 `ENOENT` 掩盖 `EDQUOT`。

## 结尾：两个问题的共性

这两个问题看着不一样，其实共性很明显：

- 都是长期复用沙箱才会遇到，一次性会话基本遇不到；
- 都是“状态 / 日志没回收”，一个是任务队列的租约没回收，一个是 trace 日志没回收；
- 都是普通用户在网页上没有任何自救手段，必须进沙箱才能修，所以我才写了上面这两段 F12 代码。

官方修之前，先用上面这两段代码自救；官方修了，我会在上面更新记录里补上。到时候你再看这篇，就知道哪段代码已经不用跑了。
