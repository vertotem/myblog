---
comments: 'true'
author: 梦貘
date: '2026-02-04 21:36 +0800'
layout: post
title: 超格教育网课字幕助手
categories: 技术
tags: 技术
---
## 前言

As you can see...这篇文章是AI写的。好吧其实是我Vibe了个油猴脚本，让超格教育的网课可以直接查看字幕，以及按字幕跳转。这种小代码最容易丢了，所以就放在这儿了，顺便写下用法。

## 超格教育网课字幕助手：让网课更好学的油猴插件

如果你经常在超格教育上看网课，但总觉得听得懂、记不住，或者想快速回看老师讲到某一句话，那么这个油猴插件——**「超格教育网课字幕助手」**，会非常适合你。它可以自动抓取课程视频里的 `.vtt` 字幕文件，在网页右侧展示一个**可点击跳转的字幕列表**，同时还能切换「文档模式」、调整字体大小、复制全文字幕，让你像看讲义一样学习网课。

本文面向完全没有折腾经验的新手，会从安装油猴环境开始，一步步讲清楚：**它能做什么、如何安装、怎么使用、遇到问题怎么办**，不涉及源码细节，你只需要按步骤操作即可。

---

## 这个插件能做什么？

- **自动抓取字幕文件**
  - 在超格教育课程页面检测视频对应的 `.vtt` 字幕文件；
  - 成功抓取后，自动解析出每一句字幕以及对应的时间点。

- **在视频右侧展示「字幕侧边栏」**
  - 页面右侧会出现一个**悬浮字幕面板**，默认为列表模式；
  - 显示当前视频所有字幕，每行对应一个时间点；
  - 样式比较现代，背景半透明，有阴影和圆角，不会太丑也不会挡住视频。

- **点击字幕即可跳转到对应时间**
  - 你可以像看目录一样浏览字幕；
  - **点击任意一句字幕，播放器会跳转到对应时间并自动播放**；
  - 适合快速复习某一段内容，或者回看刚刚没听清的地方。

- **自动跟随当前播放进度高亮字幕**
  - 视频播放时，插件会监听时间进度；
  - 当前所在句子会自动高亮显示，并滚动到中间位置，方便你跟着看；
  - 相当于一个「同步字幕阅读器」。

- **两种阅读模式：列表模式 / 文档模式**
  - **列表模式**：每行一条字幕，适合跟随视频边看边点；
  - **文档模式**：所有字幕会以类似「连续文本」的形式排版，更像一篇文档；
  - 顶部有「文档模式 / 列表模式」按钮，可以来回切换；
  - 文档模式下会额外显示「复制全文」按钮。

- **复制全文字幕，方便整理笔记**
  - 在文档模式下，点击「复制全文」；
  - 所有字幕会被拼接成一段文字，自动写入剪贴板；
  - 你可以直接粘贴到 Word、Notion、印象笔记等工具里进行整理。

- **调整字体大小，适配不同屏幕**
  - 顶部有 `A-` 和 `A+` 两个按钮；
  - 可以在一个合理区间内缩小或放大字幕字体；
  - 适配笔记本、小屏显示器或 2K/4K 大屏。

- **拖动位置 & 调整宽度**
  - 整个字幕面板支持鼠标拖动：
    - 用鼠标按住字幕面板上方的标题栏（显示「字幕助手」的那一条）拖动；
    - 可以把面板移到不挡住视频或重要内容的位置。
  - 面板左侧有一条可拖动的窄条：
    - 鼠标移上去会变成左右拖拽的光标；
    - 按住拖动，可调整字幕面板的宽度。

- **支持收起 / 展开**
  - 顶部有「收起 / 展开」按钮；
  - 不看字幕时可以临时收起，只保留一小条标题栏，不影响观看；
  - 需要时再点一下展开即可。

---

## 使用前准备：安装油猴环境

要使用这个脚本，你需要先在浏览器里安装一个「油猴」扩展（也叫 Userscript 管理器）。以下以最常见的几个浏览器举例：

- **Chrome / Edge 浏览器**
  - 打开浏览器扩展商店，搜索 **Tampermonkey**；
  - 点击安装扩展；
  - 安装完成后，浏览器工具栏会出现一个像黑色方块的小图标（Tampermonkey 标志）。

- **Firefox 浏览器**
  - 在附加组件（Add-ons）中搜索并安装 **Tampermonkey** 或 **Violentmonkey**；
  - 安装完成后，也会在工具栏看到对应图标。

只要你完成了这一步，就已经具备运行任意油猴脚本的基础环境了。

---

## 如何安装「超格教育网课字幕助手」脚本？

假设你已经把这个脚本文件 `chaoge-subtitle.user.js` 下载到本地，接下来分两种常见方式。

### 方式一：通过脚本链接（推荐）

如果你有一个指向该脚本的在线链接（例如你自己放在 Gist、静态服务器等）：

1. 在浏览器中访问这个 `.user.js` 链接；
2. Tampermonkey 会自动拦截，并弹出一个安装界面；
3. 确认脚本名称是「超格教育网课字幕助手」，匹配网址为 `*.chaogejiaoyu.com`；
4. 点击「安装」按钮即可。

### 方式二：在 Tampermonkey 中手动导入本地脚本

1. 点击浏览器工具栏中的 **Tampermonkey 图标**；
2. 选择「**仪表板（Dashboard）**」进入管理页面；
3. 点击「**实用工具（Utilities）**」；
4. 找到「从文件导入」或类似选项；
5. 选择你本地的 `chaoge-subtitle.user.js` 文件导入；
6. 导入成功后，在「已安装脚本」列表里确认它处于 **启用（Enabled）** 状态。

无论你用哪一种方式，最终只要在 Tampermonkey 的列表里看到了「超格教育网课字幕助手」，并且是启用状态，就说明安装成功。

---

## 在超格教育上实际怎么用？

安装好脚本并启用后，接下来就非常简单：

1. 打开或刷新任意一个 **超格教育网课播放页面**；
2. 等待页面和视频加载完毕（脚本会在视频元素就绪后自动运行）；
3. 页面右侧应出现一个带「字幕助手」标题的悬浮面板；
4. 如果视频本身有 `.vtt` 字幕文件：
   - 几秒钟后，面板中会填充出完整字幕列表；
   - 播放视频时，会自动高亮当前进度对应的那一句字幕；
   - 点击任意一行字幕，视频会跳到那一句开始播放。

如果你没有看到面板，或字幕列表始终为空白，可以参考后面的「常见问题」部分进行排查。

---

## 字幕面板各个按钮怎么用？

字幕面板顶部是一个「控制区」，主要有这些元素：

- **「字幕助手」标题**
  - 显示在最左侧；
  - 也是你拖动面板的抓手：用鼠标按住标题区域往任意方向拖，即可移动面板位置。

- **`A-` / `A+` 字体大小调整**
  - `A-`：减小字体，适合屏幕较小或想查看更多内容时使用；
  - `A+`：放大字体，适合坐得远一点或视力不太好时使用；
  - 字号在一个合理范围内变化，不会变得特别夸张。

- **「文档模式 / 列表模式」切换按钮**
  - 默认是「文档模式」按钮（表示当前处于列表模式，点击后切到文档模式）；
  - 切到文档模式后，该按钮会变成「列表模式」；
  - **列表模式**：每行一条字幕，更适合跟视频一起看；
  - **文档模式**：多条字幕连成文段，适合通读全文、复制和做笔记。

- **「复制全文」按钮（仅在文档模式下出现）**
  - 点击后，会把所有字幕拼成一段文字自动复制到剪贴板；
  - 按钮会暂时显示「已复制!」，表示操作成功；
  - 然后就可以在任何文本编辑器里 `Ctrl + V` 粘贴出来了。

- **「收起 / 展开」按钮**
  - 默认显示为「收起」；
  - 点击后，字幕面板会缩成一条窄条，只保留标题栏；
  - 再次点击（此时按钮显示为「展开」），即可恢复正常高度；
  - 用于暂时不看字幕，又不想完全关闭脚本的场景。

此外：

- 面板左侧有一条不可见的拖拽区域，鼠标移过去会出现左右双向箭头；
- 按住并左右拖动，即可调整面板宽度，让它既不挡住视频，又方便阅读。

---

## 常见问题 & 排查思路

**1. 视频页面打开后，没有出现字幕面板？**

- 确认浏览器右上角的油猴扩展（Tampermonkey）是**启用状态**；
- 在 Tampermonkey 仪表板中，检查「超格教育网课字幕助手」是否为**启用**；
- 确认当前网址确实是 `chaogejiaoyu.com` 域名下的课程播放页面；
- 刷新页面再试一次（有时首次加载较慢）。

**2. 面板出来了，但字幕列表是空白的？**

- 有可能当前课程视频本身就**没有内置 `.vtt` 字幕文件**；
- 或者网站的字幕存放方式发生了变化，脚本暂时无法识别；
- 这种情况可以按 F12 打开控制台，看看是否有「未找到字幕文件地址」类似的日志（给开发者排查用）。

**3. 点击字幕没有跳转？**

- 先确认视频本身是可以正常播放、进度条可以拖动；
- 如果你装了其他会控制视频播放的扩展，可能有冲突，可以尝试暂时禁用其他脚本或扩展；
- 刷新页面后再试一次。

**4. 面板挡住了重要内容怎么办？**

- 按住顶部「字幕助手」标题区域，拖动到你想要的位置；
- 或者拖动左侧边缘改变宽度；
- 实在不需要时，点一次「收起」。

---

## 适合哪些人使用？

这个油猴插件非常适合：

- **经常在超格教育上看长课的同学**
  - 想快速定位到「某个知识点讲到哪一段」；
  - 复习时不想从头拖进度条。

- **喜欢边看边做笔记的人**
  - 通过文档模式 + 复制全文，可以把字幕直接当成原始讲稿来整理；
  - 再结合自己理解，做成高质量复习资料。

- **听力或专注度一般的同学**
  - 有字幕列表辅助，可以在精神不集中的时候回顾刚刚的内容；
  - 也便于慢速精读、标记重点。

---

## 总结

**「超格教育网课字幕助手」** 是一个针对超格教育平台定制的油猴脚本，它的核心价值就是：**把视频里的字幕提取出来，变成一个可点击、可阅读、可复制的「学习辅助手册」**。  

对新手来说，唯一略微复杂的步骤就是先安装油猴扩展，但只要完成一次，之后不管是这个脚本还是其他实用脚本，都可以一键安装、一键启用。  

如果你在使用过程中遇到问题，可以先按文中的「常见问题 & 排查思路」自查一遍；若依然无法解决，再把具体现象（如是否出现面板、控制台报什么错、当前课程链接等）整理好反馈给脚本作者，会更容易被准确定位和修复。

## 代码

代码如下，直接复制然后在油猴里新增脚本即可。

```js
// ==UserScript==
// @name         超格教育网课字幕助手
// @namespace    https://chaogejiaoyu.com/
// @version      1.0.0
// @description  抓取 .vtt 字幕并在视频侧边显示可跳转的字幕列表
// @match        *://*.chaogejiaoyu.com/*
// @grant        GM_xmlhttpRequest
// @run-at       document-end
// @allFrames    true
// ==/UserScript==

(() => {
  const log = (...args) => console.log('[字幕助手]', ...args);

  if (window.top === window && !document.getElementById('playbackVideo')) {
    // 主框架先退出，等待在 iframe 中运行
    return;
  }

  let inited = false;
  let fontSize = 14;
  const waitInterval = setInterval(() => {
    const video = document.getElementById('playbackVideo');
    if (!video) return;
    if (inited) return;
    inited = true;
    clearInterval(waitInterval);
    init(video).catch(err => log('初始化失败', err));
  }, 800);

  async function init(video) {
    log('检测到视频元素，开始初始化');
    const vttUrl = findVttUrl(video);
    if (!vttUrl) {
      log('未找到字幕文件地址');
      return;
    }

    const vttText = await fetchVtt(vttUrl);
    if (!vttText) {
      log('字幕拉取失败');
      return;
    }

    const cues = parseVtt(vttText);
    if (!cues.length) {
      log('未解析到有效字幕');
      return;
    }

    const ui = buildSidebar();
    renderList(ui, cues, video, ui.state.mode);
    bindAutoHighlight(video, ui.list, cues);
    enableResize(ui.container);
  }

  function findVttUrl(video) {
    const datasetUrl = video.dataset.vcaptionsTargetVideo || video.getAttribute('data-vcaptions-target-video');
    if (datasetUrl && datasetUrl.includes('.vtt')) return datasetUrl;

    const track = video.querySelector('track[src*=".vtt"]');
    if (track) return track.getAttribute('src');

    const possible = document.querySelector('[src*=".vtt"], a[href*=".vtt"]');
    if (possible) return possible.getAttribute('src') || possible.getAttribute('href');

    return null;
  }

  async function fetchVtt(url) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(res.statusText);
      return await res.text();
    } catch (err) {
      log('fetch 失败，尝试 GM_xmlhttpRequest', err);
      return new Promise(resolve => {
        GM_xmlhttpRequest({
          method: 'GET',
          url,
          onload: resp => resolve(resp.responseText),
          onerror: () => resolve(null),
        });
      });
    }
  }

  function parseVtt(text) {
    const lines = text.split(/\r?\n/);
    const timeRegex = /(\d{2}:\d{2}:\d{2}\.\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2}\.\d{3})/;
    const toSeconds = t => {
      const [h, m, s] = t.split(':');
      return parseInt(h, 10) * 3600 + parseInt(m, 10) * 60 + parseFloat(s);
    };

    const cues = [];
    for (let i = 0; i < lines.length; i++) {
      const match = lines[i].match(timeRegex);
      if (!match) continue;
      const start = toSeconds(match[1]);
      const textLines = [];
      i++;
      while (i < lines.length && lines[i].trim() !== '') {
        textLines.push(lines[i]);
        i++;
      }
      const raw = textLines.join(' ');
      const clean = sanitizeText(raw);
      cues.push({ time: start, text: clean });
    }
    return cues;
  }

  const sanitizeText = str => (str || '').replace(/<\/?c[^>]*>/gi, '').trim();

  function buildSidebar() {
    const container = document.createElement('div');
    container.id = 'chaoge-caption-sidebar';
    Object.assign(container.style, {
      position: 'fixed',
      right: '10px',
      top: '12%',
      width: '280px',
      height: '70%',
      background: 'rgba(255,255,255,0.9)',
      backdropFilter: 'blur(6px)',
      border: '1px solid rgba(255,255,255,0.6)',
      borderRadius: '16px',
      boxShadow: '0 12px 28px rgba(0,0,0,0.12)',
      overflow: 'hidden',
      zIndex: '2147483647',
      fontSize: '14px',
      color: '#1f1f1f',
      boxSizing: 'border-box',
      display: 'flex',
      flexDirection: 'column',
    });

    const header = document.createElement('div');
    Object.assign(header.style, {
      minHeight: '46px',
      display: 'flex',
      alignItems: 'center',
      flexWrap: 'wrap',
      gap: '6px',
      padding: '8px 10px',
      background: 'linear-gradient(135deg, #f7f7f9, #eef1f5)',
      borderBottom: '1px solid rgba(0,0,0,0.05)',
      cursor: 'grab',
      userSelect: 'none',
      boxSizing: 'border-box',
    });

    const title = document.createElement('div');
    title.textContent = '字幕助手';
    Object.assign(title.style, {
      fontWeight: '600',
      fontSize: '13px',
      color: '#111',
      flex: '0 0 auto',
    });

    const btnArea = document.createElement('div');
    Object.assign(btnArea.style, {
      display: 'flex',
      alignItems: 'center',
      gap: '6px',
      flex: '1 1 auto',
      justifyContent: 'flex-end',
    });

    const pillBtn = (text) => {
      const b = document.createElement('button');
      b.textContent = text;
      Object.assign(b.style, {
        border: '1px solid #d0d7de',
        background: '#fff',
        color: '#111',
        padding: '4px 8px',
        borderRadius: '8px',
        cursor: 'pointer',
        fontSize: '11px',
        whiteSpace: 'nowrap',
        transition: 'all 0.15s ease',
      });
      b.addEventListener('mouseenter', () => (b.style.background = '#f2f4f7'));
      b.addEventListener('mouseleave', () => (b.style.background = '#fff'));
      return b;
    };

    const toggle = pillBtn('收起');
    toggle.addEventListener('click', () => {
      const hidden = container.dataset.hidden === '1';
      container.dataset.hidden = hidden ? '0' : '1';
      container.style.height = hidden ? container.dataset.prevHeight || '70%' : '48px';
      container.style.overflow = hidden ? 'hidden' : 'hidden';
      list.style.display = hidden ? 'block' : 'none';
      toggle.textContent = hidden ? '收起' : '展开';
    });

    const modeBtn = pillBtn('文档模式');

    const fontDec = pillBtn('A-');
    fontDec.style.padding = '4px 7px';
    fontDec.style.minWidth = '26px';
    fontDec.addEventListener('click', () => {
      if (fontSize > 10) {
        fontSize--;
        container.style.fontSize = `${fontSize}px`;
        renderList({ list, state }, cuesCache, currentVideo, state.mode);
      }
    });

    const fontInc = pillBtn('A+');
    fontInc.style.padding = '4px 7px';
    fontInc.style.minWidth = '26px';
    fontInc.addEventListener('click', () => {
      if (fontSize < 24) {
        fontSize++;
        container.style.fontSize = `${fontSize}px`;
        renderList({ list, state }, cuesCache, currentVideo, state.mode);
      }
    });

    const copyBtn = pillBtn('复制全文');
    copyBtn.style.display = 'none';
    copyBtn.addEventListener('click', () => {
      const allText = cuesCache.map(c => c.text).join(' ');
      navigator.clipboard.writeText(allText).then(() => {
        const origText = copyBtn.textContent;
        copyBtn.textContent = '已复制!';
        setTimeout(() => (copyBtn.textContent = origText), 1500);
      });
    });

    const dragHint = document.createElement('span');
    dragHint.textContent = '⇅';
    Object.assign(dragHint.style, {
      fontSize: '14px',
      color: '#6b7280',
      flex: '0 0 auto',
    });

    btnArea.appendChild(fontDec);
    btnArea.appendChild(fontInc);
    btnArea.appendChild(modeBtn);
    btnArea.appendChild(copyBtn);
    btnArea.appendChild(toggle);
    btnArea.appendChild(dragHint);
    header.appendChild(title);
    header.appendChild(btnArea);

    const list = document.createElement('div');
    list.id = 'chaoge-caption-list';
    Object.assign(list.style, {
      flex: '1',
      minHeight: '0',
      overflowY: 'auto',
      padding: '10px 10px 14px',
      boxSizing: 'border-box',
      background: 'rgba(255,255,255,0.75)',
    });

    container.appendChild(header);
    container.appendChild(list);
    document.body.appendChild(container);
    container.dataset.prevHeight = '70%';

    const state = { mode: 'list' }; // 'list' | 'doc'

    modeBtn.addEventListener('click', () => {
      state.mode = state.mode === 'list' ? 'doc' : 'list';
      modeBtn.textContent = state.mode === 'list' ? '文档模式' : '列表模式';
      copyBtn.style.display = state.mode === 'doc' ? 'inline-block' : 'none';
      renderList({ list, state }, cuesCache, currentVideo, state.mode);
    });

    enableDrag(container, header);
    return { container, list, state, modeBtn, copyBtn };
  }

  let cuesCache = [];
  let currentVideo = null;

  function renderList(ui, cues, video, mode = 'list') {
    cuesCache = cues;
    currentVideo = video;
    const listEl = ui.list;
    listEl.innerHTML = '';
    listEl.style.whiteSpace = 'normal';
    listEl.style.overflowX = 'hidden';
    const frag = document.createDocumentFragment();

    const baseRowStyle = {
      cursor: 'pointer',
      transition: 'all 0.15s ease',
    };

    cues.forEach((item, idx) => {
      const row = document.createElement(mode === 'doc' ? 'span' : 'div');
      row.className = 'caption-row';
      row.dataset.time = item.time;
      row.dataset.idx = String(idx);
      row.textContent = item.text || '[空行]';
      const baseBg = mode === 'list' ? 'transparent' : 'transparent';
      row.dataset.baseBg = baseBg;

      if (mode === 'list') {
        Object.assign(row.style, {
          ...baseRowStyle,
          padding: '6px 8px',
          marginBottom: '2px',
          border: 'none',
          background: baseBg,
          borderRadius: '0',
        });
      } else {
        Object.assign(row.style, {
          ...baseRowStyle,
          display: 'inline',
          padding: '0',
          marginRight: '6px',
          marginBottom: '4px',
          border: 'none',
          background: baseBg,
          lineHeight: '1.6',
        });
      }

      row.addEventListener('mouseenter', () => (row.style.background = '#f7f9fb'));
      row.addEventListener('mouseleave', () => (row.style.background = row.classList.contains('active') ? '#e6f7ff' : baseBg));
      row.addEventListener('click', () => {
        video.currentTime = item.time;
        video.play();
      });
      frag.appendChild(row);
    });
    listEl.appendChild(frag);
  }

  function bindAutoHighlight(video, listEl, cues) {
    const getRows = () => Array.from(listEl.querySelectorAll('.caption-row'));
    if (!getRows().length) return;

    const setActive = idx => {
      const rows = getRows();
      rows.forEach((r, i) => {
        const baseBg = r.dataset.baseBg || 'transparent';
        if (i === idx) {
          r.classList.add('active');
          r.style.background = '#e6f7ff';
          r.scrollIntoView({ block: 'center', behavior: 'smooth' });
        } else {
          r.classList.remove('active');
          r.style.background = baseBg;
        }
      });
    };

    video.addEventListener('timeupdate', () => {
      const t = video.currentTime;
      let lo = 0;
      let hi = cues.length - 1;
      let best = 0;
      while (lo <= hi) {
        const mid = Math.floor((lo + hi) / 2);
        if (cues[mid].time <= t) {
          best = mid;
          lo = mid + 1;
        } else {
          hi = mid - 1;
        }
      }
      setActive(best);
    });
  }

  function enableDrag(box, handle) {
    let dragging = false;
    let offsetX = 0;
    let offsetY = 0;

    const onMouseDown = e => {
      dragging = true;
      box.style.right = 'auto';
      const rect = box.getBoundingClientRect();
      offsetX = e.clientX - rect.left;
      offsetY = e.clientY - rect.top;
      handle.style.cursor = 'grabbing';
      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    };

    const onMouseMove = e => {
      if (!dragging) return;
      box.style.left = `${Math.max(6, e.clientX - offsetX)}px`;
      box.style.top = `${Math.max(6, e.clientY - offsetY)}px`;
    };

    const onMouseUp = () => {
      dragging = false;
      handle.style.cursor = 'grab';
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };

    handle.addEventListener('mousedown', onMouseDown);
  }

  function enableResize(box) {
    const resizeHandle = document.createElement('div');
    Object.assign(resizeHandle.style, {
      position: 'absolute',
      left: '0',
      top: '0',
      bottom: '0',
      width: '6px',
      cursor: 'ew-resize',
      background: 'transparent',
      transition: 'background 0.15s',
    });
    resizeHandle.title = '拖拽调整大小';
    box.appendChild(resizeHandle);

    let resizing = false;
    let startX = 0;
    let startWidth = 0;

    const onMouseDown = (e) => {
      resizing = true;
      startX = e.clientX;
      startWidth = box.offsetWidth;
      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
      e.preventDefault();
    };

    const onMouseMove = (e) => {
      if (!resizing) return;
      const diff = startX - e.clientX;
      const newWidth = Math.max(200, Math.min(800, startWidth + diff));
      box.style.width = `${newWidth}px`;
    };

    const onMouseUp = () => {
      resizing = false;
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };

    resizeHandle.addEventListener('mouseenter', () => {
      resizeHandle.style.background = 'rgba(59, 130, 246, 0.3)';
    });
    resizeHandle.addEventListener('mouseleave', () => {
      if (!resizing) resizeHandle.style.background = 'transparent';
    });
    resizeHandle.addEventListener('mousedown', onMouseDown);
  }
})();

```

