---
layout: post
title: Windows 上装 Claude Code，再接自己的 API：从零开始的完整流程
date: 2026-11-12
author: 梦貘
categories: 技术
tags: [技术, AI]
comments: true
---


## 前言：这篇是给完全没装过的人写的

Claude Code 是 Anthropic 出的一个终端里的 AI 编程工具。装好之后，在命令行里跟它说话，它能读你的代码、改文件、跑命令、管 Git。

我自己是在 Windows 10 上装的，用的不是官方账号，是自己的第三方 API。整条路我踩了一遍，写下来就是这篇：从零开始，装 Claude Code，配上自己的 API，跑起来。命令我都完整贴出来了，照着敲就行。先说一句：这东西是命令行，很多人觉得不方便，但临时干点小活儿，它是最快的；要是办公干大活儿、又觉得终端不熟，那还是用 DeepSeek Harness 好了。

先把三件事说清楚，免得你一上来就走偏：

- **Claude Code 本身是免费的软件，收费的是模型调用。** 走官方账号要付费订阅；走第三方 API，就按那家的价钱扣费，不用登官方账号。
- **关键就看你的 API 是哪种格式。** 支持 Anthropic 格式的，直接改一个配置文件就行；只支持 OpenAI 格式的，不能直连，中间要加一层“翻译”，后面会讲。
- **这篇只讲 Windows 10。** 我用的就是 Windows 10，命令都是 PowerShell 里的。

## 一、开始之前：你需要准备什么

- 一台 Windows 10 的电脑，版本 1809 以上就行，64 位。现在的 Windows 10 基本都满足。
- 一个第三方 API 的账号和 Key。还没有的话，先去注册一家，建个 Key 备用。具体哪家，下面会讲。
- 会打开 PowerShell 就行。不会也没关系：按 `Win + X`，选“Windows PowerShell”，或者在开始菜单搜 PowerShell，点开就是。

顺带装一个 Git for Windows，不是必须的，但装了之后 Claude Code 跑命令会更顺。没装也能用，它会退回用 PowerShell。

## 二、装 Claude Code：就一行命令

打开 PowerShell，粘贴下面这行，敲回车：

```powershell
irm https://claude.ai/install.ps1 | iex
```

这是官方的安装命令，不用管理员权限。装完关掉这个 PowerShell 窗口，重新开一个，再跑：

```powershell
claude --version
```

能打出版本号，就说明装好了。

如果上面那行死活下不下来，换 winget 装：

```powershell
winget install Anthropic.ClaudeCode
```

装完一样要重新开一个 PowerShell 窗口，再跑 `claude --version` 验证。

还有一种办法是用 npm 装，适合电脑上已经有 Node.js 的人。注意要 Node.js 22 以上，国内下载慢的话加个镜像：

```powershell
npm install -g @anthropic-ai/claude-code --registry=https://registry.npmmirror.com
```

我推荐第一种官方安装，因为它装完会在后台自己更新。winget 装的不会自己更新，得隔段时间手动跑一次：

```powershell
winget upgrade Anthropic.ClaudeCode
```

## 三、先想清楚：你的 API 是哪种格式

这一步最重要，决定了你后面走哪条路。

Claude Code 只会说 Anthropic 那套协议，地址是 `/v1/messages`。你的 API 如果也是这套，直接配就行；如果只给 OpenAI 那套（`/v1/chat/completions`），直接配是配不上的。

先看一眼你的服务商给你的地址，分两种情况：

| 你的 API 是哪种 | 怎么判断 | 后面走哪条路 |
| --- | --- | --- |
| Anthropic 兼容 | 地址里有 `/anthropic`，或者文档里写着“支持 Claude Code / Anthropic Messages” | 直接改配置文件，看第四节 |
| 只有 OpenAI 格式 | 地址是 `/v1/chat/completions`，文档里只字不提 Anthropic | 不能直连，看第七节，加一层转换 |

国内大厂官方的几个，DeepSeek、Kimi、智谱 GLM，都有 Anthropic 兼容接口。很多中转站、聚合平台也是两套协议都提供，只不过默认给的是 OpenAI 地址，你去它的文档里翻一翻，可能另有一个 Anthropic 兼容地址。有的话直接用那个，链路最简单。

## 四、直接配：改一个配置文件就行

如果你的 API 是 Anthropic 兼容的，这是最方便的路子，五分钟能跑起来。

### 1. 先备份配置文件

配置文件在这个位置：

```
%USERPROFILE%\.claude\settings.json
```

也就是 `C:\Users\你的用户名\.claude\settings.json`。如果这个文件已经存在，先备份一下，别整个覆盖掉。PowerShell 里跑：

```powershell
Copy-Item "$env:USERPROFILE\.claude\settings.json" "$env:USERPROFILE\.claude\settings.json.bak"
```

如果提示文件不存在，那说明你还没生成过，不用管，继续往下走。

### 2. 把配置写进去

用记事本打开 `settings.json`，没有就新建一个，把下面这段 `env` 合并进去。已有内容的话，只加 `env` 这一块，别把原来的删了。

以 Kimi 为例：

```json
{
  "env": {
    "ANTHROPIC_BASE_URL": "https://api.moonshot.cn/anthropic",
    "ANTHROPIC_AUTH_TOKEN": "你的API Key",
    "ANTHROPIC_MODEL": "kimi-k3[1m]",
    "ANTHROPIC_DEFAULT_OPUS_MODEL": "kimi-k3[1m]",
    "ANTHROPIC_DEFAULT_SONNET_MODEL": "kimi-k3[1m]",
    "ANTHROPIC_DEFAULT_HAIKU_MODEL": "kimi-k2.7-code"
  }
}
```

换一家的话，只换地址和模型名，格式一模一样。

DeepSeek：

```json
{
  "env": {
    "ANTHROPIC_BASE_URL": "https://api.deepseek.com/anthropic",
    "ANTHROPIC_AUTH_TOKEN": "你的API Key",
    "ANTHROPIC_MODEL": "deepseek-flash[1m]",
    "ANTHROPIC_DEFAULT_OPUS_MODEL": "deepseek-flash[1m]",
    "ANTHROPIC_DEFAULT_SONNET_MODEL": "deepseek-flash[1m]",
    "ANTHROPIC_DEFAULT_HAIKU_MODEL": "deepseek-flash"
  }
}
```

智谱 GLM：

```json
{
  "env": {
    "ANTHROPIC_BASE_URL": "https://open.bigmodel.cn/api/anthropic",
    "ANTHROPIC_AUTH_TOKEN": "你的API Key",
    "ANTHROPIC_MODEL": "glm-5.2[1m]",
    "ANTHROPIC_DEFAULT_OPUS_MODEL": "glm-5.2[1m]",
    "ANTHROPIC_DEFAULT_SONNET_MODEL": "glm-5.2[1m]",
    "ANTHROPIC_DEFAULT_HAIKU_MODEL": "glm-4.7"
  }
}
```

模型名这东西，服务商会更新，照着抄之前先去它家控制台看一眼模型列表，一字不差地抄，差一个字母都调不通。

中转站、聚合平台也一样：地址换成它给你的 Anthropic 兼容地址，Key 换成它给你的 Key，模型换成它列表里的模型 ID。

### 3. 三个最容易踩的坑

- **`ANTHROPIC_BASE_URL` 末尾不要加 `/v1`。** 写到 `/anthropic` 就停，后面不要再加东西。
- **`ANTHROPIC_AUTH_TOKEN` 和 `ANTHROPIC_API_KEY` 只留一个。** 两个同时存在会冲突，留 `ANTHROPIC_AUTH_TOKEN` 就行。
- **小模型那档也要改。** `ANTHROPIC_DEFAULT_HAIKU_MODEL` 是给后台小任务用的，你不改的话，它会去调一个你服务商那里根本没有的模型，然后莫名其妙地报错。

还有一句：`settings.json` 里的 Key 是明文的，别传到 Git 上，别发给别人。

## 五、验证：光能启动不算通

改完配置，关掉 PowerShell 重新开一个，进到你的项目目录，跑：

```powershell
claude
```

进去之后先跑：

```
/status
```

看一眼 Base URL 和模型是不是你配的那家、对的那个模型。再发一句“只回复 OK”，看它能不能正常回你。

最后一步别省：去服务商后台看调用日志，确认真的扣费调用了，才算通。光能启动、光能进界面，都不算通。

## 六、想省事：用 CC Switch 图形界面切换

手动改配置文件，每次换一家服务商都要重新改，麻烦。CC Switch 就是干这个的：一个桌面小工具，帮你管多家供应商，点一下就能切换，不用再改文件。

先提醒一句，叫 cc-switch 的有两个东西，别下错：你要的是 **farion1231 那个桌面版**，不是 Huaer02 那个插件版。下面说的都是桌面版。

### 1. 安装 CC Switch

Windows 10 上最省事的是 winget，一行命令：

```powershell
winget install --id=farion1231.CC-Switch -e
```

不想用 winget 的话，去 Releases 页下载：

```
https://github.com/farion1231/cc-switch/releases
```

下最新版的 `CC-Switch-v{版本号}-Windows.msi`，双击安装就行。不想安装的话，下 `CC-Switch-v{版本号}-Windows-Portable.zip` 绿色版，解压后运行里面的 `cc-switch.exe`。ARM 版 Windows 要下带 `arm64` 的那个包。

装完从开始菜单启动。第一次打开之前，建议先备份一下 `%USERPROFILE%\.claude\settings.json`，CC Switch 首次启动会把你现有配置自动导入成一个叫 `default` 的供应商，备份是以防万一。备份命令跟前面一样：

```powershell
Copy-Item "$env:USERPROFILE\.claude\settings.json" "$env:USERPROFILE\.claude\settings.json.bak"
```

### 2. 在 CC Switch 里加上你的供应商

1. 左边栏选 **Claude Code**，点右上角的 **+** 添加供应商。
2. 里面有 90 多个预设，找找有没有你的服务商；没有就选自定义，填三项：接口地址、API Key、模型。高级选项里上游协议选 **Anthropic Messages**，就是给 Claude Code 用的。
3. 点供应商卡片上的**启用**，然后**重新打开**终端里的 Claude Code 就生效了。
4. 以后想换供应商不用再改配置文件：主界面点一下启用就行，或者右键点系统托盘里的 CC Switch 图标，在菜单里直接点供应商名字切换。

项目地址：

```
https://github.com/farion1231/cc-switch
```

## 七、只有 OpenAI 格式怎么办：中间加一层“翻译”

如果你的中转站只有 OpenAI 格式，上面第四节、第六节的办法都行不通。Claude Code 只会说 Anthropic 格式，中转站只听得懂 OpenAI 格式，两个人语言不通。

办法是在本机中间加一层“翻译”：让 Claude Code 还是按 Anthropic 格式发给本机，本机转成 OpenAI 格式再发给中转站，回来再翻回去。

这层翻译有两个现成的办法，选一个就行，别两个都装。

### 办法 A：CC Switch 自带的本地路由（推荐新手）

如果你已经装了第六节的 CC Switch，不用再装别的。

在 CC Switch 的设置里找**本地路由**（Routing），打开总开关，再启用 Claude Code。它会在本机起个服务，默认地址是：

```
http://127.0.0.1:15721
```

帮你把 Anthropic 格式转成 OpenAI 格式发给上游。图形界面点两下就行，适合不想敲命令的人。

### 办法 B：装 Claude Code Router（CCR）

喜欢用命令行的，可以装这个。

前置条件：Claude Code 已经装好，再加一个 Node.js 20 以上，装最新的 LTS 最稳。

装 CCR：

```powershell
npm install -g @musistudio/claude-code-router
```

配中转站，两种配法，会用哪种都行：

- **省事的：用网页界面配。** 跑 `ccr ui`，浏览器里打开 Providers → Add Provider，选“Other / custom API endpoint”，填中转站地址和 Key，再选模型，点 Check Connection 测通，最后在 Agent Config 里给 Claude Code 建个 profile 应用上。网关默认跑在 `http://127.0.0.1:3456`。
- **改配置文件：**文件在 `%USERPROFILE%\.claude-code-router\config.json`，把你的中转站加进 Providers 里，大致是这个样子：

```json
{
  "PORT": 3456,
  "Providers": [
    {
      "name": "my-relay",
      "api_base_url": "https://你的中转站地址/v1/chat/completions",
      "api_key": "你的Key",
      "models": ["模型ID1", "模型ID2"]
    }
  ],
  "Router": {
    "default": "my-relay,模型ID1"
  }
}
```

注意这里的 `api_base_url` 要写**完整路径**，带上 `/v1/chat/completions`，跟第四节 Anthropic 地址“末尾不加 `/v1`”正好相反，别搞混。改完配置要跑 `ccr restart` 重启才生效。

启动的时候最容易错：进项目目录后跑的是：

```powershell
ccr code
```

不是 `claude`。直接跑 `claude` 走的是原生配置，根本不经过 CCR，等于白配了。

### 先别急着装，两个提醒

- **先问一句你的中转站。** 很多中转站其实两套协议都提供，只不过默认给的是 OpenAI 地址，它可能另有一个 Anthropic 兼容地址。有的话直接用第四节的办法，不用装 CCR，链路更简单、兼容性也更好。
- **转换不是百分百无损。** 翻译层对普通对话和工具调用一般没问题，但思考过程、图片、PDF 这些高级能力在某些模型上可能打折扣。如果发现工具调用老出错，先去 CCR 的请求日志里看一眼，再考虑换个模型。

## 八、排错：出问题先看这张表

| 现象 | 最可能的原因 | 怎么办 |
| --- | --- | --- |
| `claude` 启动后提示鉴权失败 | Key 写错了，或者 `ANTHROPIC_AUTH_TOKEN` 和 `ANTHROPIC_API_KEY` 两个都在 | 只留 `ANTHROPIC_AUTH_TOKEN`，重新抄一遍 Key |
| 提示找不到模型 | 模型 ID 写错了，或者 Haiku 那档没改 | 去服务商控制台抄一遍模型 ID，一字不差；`ANTHROPIC_DEFAULT_HAIKU_MODEL` 也改成它家有的 |
| `ANTHROPIC_BASE_URL` 报错 | 地址末尾多加了 `/v1` | 删掉末尾的 `/v1`，写到 `/anthropic` 就停 |
| 装了 CCR，跑 `claude` 还是走的老配置 | 启动命令错了 | 用 `ccr code` 启动，不是 `claude` |
| PowerShell 里 `&&` 报错 | 把 CMD 的命令粘到 PowerShell 里了 | PowerShell 用 `irm https://claude.ai/install.ps1 \| iex`；CMD 才用 `curl` 那行 |
| 刚装完 `claude` 命令找不到 | 还是旧的终端窗口 | 关掉重开一个 PowerShell 窗口再试 |

## 九、最后说一句：我推荐你走哪条路

- **你的服务商有 Anthropic 兼容地址：** 直接改 `settings.json`，最简单。换供应商频繁的话，再装个 CC Switch。
- **你的中转站只有 OpenAI 格式：** 装 CC Switch，开它的本地路由，图形界面点两下就行；喜欢命令行的，装 CCR 也行。
- **你还没选服务商：** 先从 DeepSeek、Kimi、GLM 这三家官方的挑一家，按第四节的配置抄过去，先跑通，再慢慢换。

上面这些命令，我 2026 年 11 月刚核对过，都是当下能用的。模型名和地址这种东西，服务商说变就变，照着抄之前，先去它家控制台看一眼，别全信文章里的。

## 参考链接

- Claude Code 官方中文文档：安装：https://code.claude.com/docs/zh-CN/setup.md
- Claude Code 国内使用指南（含 DeepSeek、Kimi、GLM 配置和 CC Switch 教程）：https://github.com/TimeMachineLab/claude-code-china-guide
- DeepSeek 官方：接入 Claude Code：https://api-docs.deepseek.com/zh-cn/quick_start/agent_integrations/claude_code.md
- Kimi 官方：Claude Code 中使用 Kimi：https://platform.kimi.com/docs/guide/claude-code-kimi
- CC Switch（farion1231 桌面版）：https://github.com/farion1231/cc-switch
- Claude Code Router：https://github.com/musistudio/claude-code-router
