/*
 * 代码块：复制 + 折叠
 * - 所有代码块右上角都有「复制」按钮，点击复制整段代码到剪贴板
 * - 超过 MAX_VISIBLE_LINES 行的代码块默认折叠
 * - 展开按钮在代码块下面居中（半透明底色 + 向下箭头），展开后变成「收起 ▲」
 * - 纯前端实现，兼容 GitHub Pages（无需任何 Jekyll 插件）
 *
 * 兼容 Jekyll + Rouge 的常见代码块结构：
 *   div.highlighter-rouge > div.highlight > pre.highlight > code
 *   figure.highlight > pre.highlight > code
 *   pre.highlight > code
 *   pre > code（无 highlight 包裹的普通代码块）
 */
(function () {
  'use strict';

  // 超过该行长数的代码块才折叠（正好 3 行不折叠）
  var MAX_VISIBLE_LINES = 3;

  // 返回需要被整体包裹的最外层代码块容器
  function getBlock(pre) {
    return (
      pre.closest('div.highlighter-rouge') ||
      pre.closest('figure.highlight') ||
      pre.closest('div.highlight') ||
      pre
    );
  }

  // 计算代码行数：Rouge 常在末尾补一个换行，去掉后再按 \n 计行，避免误判
  function countLines(codeEl) {
    var text = codeEl.textContent.replace(/\n+$/, '');
    if (text.length === 0) return 0;
    return text.split('\n').length;
  }

  function copyText(text, btn) {
    function onSuccess() {
      btn.textContent = '已复制';
      btn.classList.add('is-copied');
      if (btn._copyTimer) clearTimeout(btn._copyTimer);
      btn._copyTimer = setTimeout(function () {
        btn.textContent = '复制';
        btn.classList.remove('is-copied');
      }, 2000);
    }

    function fallbackCopy() {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.top = '0';
      ta.style.left = '0';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      try {
        document.execCommand('copy');
        onSuccess();
      } catch (e) {
        btn.textContent = '复制失败';
      }
      document.body.removeChild(ta);
    }

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(onSuccess, fallbackCopy);
    } else {
      fallbackCopy();
    }
  }

  function addCopyButton(wrapper, codeEl) {
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'code-copy';
    btn.textContent = '复制';
    btn.setAttribute('aria-label', '复制代码');
    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      copyText(codeEl.textContent, btn);
    });
    wrapper.appendChild(btn);
  }

  function fold(wrapper, pre) {
    wrapper.classList.add('code-fold', 'is-collapsed');

    var cs = window.getComputedStyle(pre);
    var fontSize = parseFloat(cs.fontSize) || 14;
    var lineHeight = parseFloat(cs.lineHeight) || fontSize * 1.5;
    var padTop = parseFloat(cs.paddingTop) || 0;
    var padBottom = parseFloat(cs.paddingBottom) || 0;
    var borderTop = parseFloat(cs.borderTopWidth) || 0;
    var borderBottom = parseFloat(cs.borderBottomWidth) || 0;

    // 折叠时只露出约 3 行代码 + 上下内边距与边框
    // 展开按钮是下面居中的绝对定位，不占 wrapper 高度，所以高度仍按代码算
    var collapsedHeight = Math.round(
      lineHeight * MAX_VISIBLE_LINES + padTop + padBottom + borderTop + borderBottom
    );
    wrapper.style.maxHeight = collapsedHeight + 'px';

    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'code-fold__toggle';
    btn.textContent = '展开 ▼';
    btn.setAttribute('aria-expanded', 'false');
    wrapper.appendChild(btn);

    btn.addEventListener('click', function () {
      var collapsed = wrapper.classList.toggle('is-collapsed');
      if (collapsed) {
        wrapper.style.maxHeight = collapsedHeight + 'px';
        btn.textContent = '展开 ▼';
        btn.setAttribute('aria-expanded', 'false');
      } else {
        wrapper.style.maxHeight = 'none';
        btn.textContent = '收起 ▲';
        btn.setAttribute('aria-expanded', 'true');
      }
    });
  }

  function init() {
    var pres = document.querySelectorAll(
      '.entry pre, article pre, #main pre, .container pre'
    );
    // 去重：同一个 pre 可能同时命中多个选择器
    var seen = [];
    Array.prototype.forEach.call(pres, function (pre) {
      if (seen.indexOf(pre) !== -1) return;
      seen.push(pre);
      // 已处理过、或在评论区里的代码块跳过
      if (pre.closest('.code-block') || pre.closest('.gt-container')) return;
      var code = pre.querySelector('code') || pre;
      if (countLines(code) === 0) return;

      var block = getBlock(pre);
      var wrapper = document.createElement('div');
      wrapper.className = 'code-block';
      block.parentNode.insertBefore(wrapper, block);
      wrapper.appendChild(block);

      // 右上角复制按钮：所有代码块都有，不论是否折叠
      addCopyButton(wrapper, code);

      // 超过 3 行才折叠，展开按钮在下面居中
      if (countLines(code) > MAX_VISIBLE_LINES) {
        fold(wrapper, pre);
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
