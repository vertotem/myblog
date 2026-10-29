/*
 * 代码块自动折叠
 * - 超过 MAX_VISIBLE_LINES 行的代码块默认折叠
 * - 右上角显示「展开 ▾ / 收起 ▴」按钮
 * - 纯前端实现，兼容 GitHub Pages（无需任何 Jekyll 插件）
 *
 * 兼容 Jekyll + Rouge 的常见代码块结构：
 *   div.highlighter-rouge > div.highlight > pre.highlight > code
 *   figure.highlight > pre.highlight > code
 */
(function () {
  'use strict';

  // 超过该行长数的代码块才折叠（正好 3 行不折叠）
  var MAX_VISIBLE_LINES = 3;

  // 返回需要被整体包裹/折叠的最外层代码块容器
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

  function fold(block, pre) {
    var wrapper = document.createElement('div');
    wrapper.className = 'code-fold is-collapsed';

    block.parentNode.insertBefore(wrapper, block);
    wrapper.appendChild(block);

    var cs = window.getComputedStyle(pre);
    var fontSize = parseFloat(cs.fontSize) || 14;
    var lineHeight = parseFloat(cs.lineHeight) || fontSize * 1.5;
    var padTop = parseFloat(cs.paddingTop) || 0;
    var padBottom = parseFloat(cs.paddingBottom) || 0;
    var borderTop = parseFloat(cs.borderTopWidth) || 0;
    var borderBottom = parseFloat(cs.borderBottomWidth) || 0;

    // 折叠时只露出约 3 行代码 + 上下内边距与边框
    var collapsedHeight = Math.round(
      lineHeight * MAX_VISIBLE_LINES + padTop + padBottom + borderTop + borderBottom
    );
    wrapper.style.maxHeight = collapsedHeight + 'px';

    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'code-fold__toggle';
    btn.textContent = '展开 ▾';
    btn.setAttribute('aria-expanded', 'false');
    wrapper.appendChild(btn);

    btn.addEventListener('click', function () {
      var collapsed = wrapper.classList.toggle('is-collapsed');
      if (collapsed) {
        wrapper.style.maxHeight = collapsedHeight + 'px';
        btn.textContent = '展开 ▾';
        btn.setAttribute('aria-expanded', 'false');
      } else {
        wrapper.style.maxHeight = 'none';
        btn.textContent = '收起 ▴';
        btn.setAttribute('aria-expanded', 'true');
      }
    });
  }

  function init() {
    var pres = document.querySelectorAll(
      'div.highlighter-rouge pre, figure.highlight pre, pre.highlight'
    );
    Array.prototype.forEach.call(pres, function (pre) {
      var code = pre.querySelector('code') || pre;
      if (countLines(code) > MAX_VISIBLE_LINES) {
        fold(getBlock(pre), pre);
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
