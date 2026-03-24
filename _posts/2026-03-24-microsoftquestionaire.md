---
comments: 'true'
author: 梦貘
date: '2026-03-24 10:12 +0800'
layout: post
title: 油猴|微软问卷文本提取助手
categories: 技术
tags: 技术
---

## 前言

最近有提取别人的微软问卷的文本的需求，于是写了这样一个油猴插件。放在这里以备用

依旧是Gemini老师写的QAQ

## 正文

````javascript
// ==UserScript==
// @name         Microsoft Forms 自动填写与爬虫 (终极完整版 v1.9)
// @namespace    http://tampermonkey.net/
// @version      1.9
// @description  支持封面、章节无输入元素抓取、全题型兼容（含数字型评分自动满分）
// @author       Gemini
// @match        *://forms.office.com/*
// @match        *://forms.cloud.microsoft/*
// @match        *://*.forms.office.com/*
// @match        *://*.forms.cloud.microsoft/*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    // 工具函数：延时
    const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

    // 触发 React 的输入事件
    function setNativeValue(element, value) {
        if (element.tagName === 'TEXTAREA') {
            const nativeTextAreaValueSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value").set;
            nativeTextAreaValueSetter.call(element, value);
        } else {
            const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
            nativeInputValueSetter.call(element, value);
        }
        element.dispatchEvent(new Event('input', { bubbles: true }));
        element.dispatchEvent(new Event('change', { bubbles: true }));
    }

    // 提取封面/欢迎页文本
    function extractIntroPage(startBtn) {
        let container = startBtn.parentElement.parentElement;
        if (!container) return "";

        let lines = container.innerText.split('\n').map(s => s.trim()).filter(s => s.length > 0);

        // 连续去重
        let uniqueLines = [];
        lines.forEach(line => {
            if (uniqueLines[uniqueLines.length - 1] !== line) {
                uniqueLines.push(line);
            }
        });

        uniqueLines = uniqueLines.filter(line => !['Start now', '立即开始', '开始', '开始答题'].includes(line));

        let md = "";
        if (uniqueLines.length > 0) {
            md += `# ${uniqueLines[0]}\n\n`;
            for (let i = 1; i < uniqueLines.length; i++) {
                md += `> ${uniqueLines[i]}\n\n`;
            }
        }
        md += `---\n\n`;
        return md;
    }

    // 填写表单核心逻辑
    function fillForm() {
        let hasChanges = false;

        // 1. 文本输入
        const textInputs = document.querySelectorAll('textarea, input[data-automation-id="textInput"]');
        textInputs.forEach(input => {
            if (input.value !== '123') {
                setNativeValue(input, '123');
                hasChanges = true;
            }
        });

        // 2. 单选与评分
        const radioGroups = document.querySelectorAll('[role="radiogroup"]');
        radioGroups.forEach(group => {
            // 兼容所有的模拟 radio（星形span、数字div等），排除掉真正的 input
            const customRadios = group.querySelectorAll('[role="radio"]:not(input)');
            if (customRadios.length > 0) {
                const isChecked = group.querySelector('[role="radio"][aria-checked="true"]:not(input)');
                if (!isChecked) {
                    const maxRatingItem = customRadios[customRadios.length - 1]; // 永远点最后一个（最大值）
                    if (maxRatingItem) {
                        maxRatingItem.click();
                        hasChanges = true;
                    }
                }
                return;
            }

            // 真正的 input 单选
            const standardRadios = group.querySelectorAll('input[type="radio"]');
            if (standardRadios.length > 0) {
                const isChecked = group.querySelector('input[type="radio"]:checked') ||
                                  group.querySelector('input[type="radio"][aria-checked="true"]');
                if (!isChecked) {
                    if (standardRadios[0]) {
                        standardRadios[0].click();
                        hasChanges = true;
                    }
                }
            }
        });

        // 3. 多选
        const checkboxGroups = document.querySelectorAll('[role="group"]');
        checkboxGroups.forEach(group => {
            const checkboxes = group.querySelectorAll('input[type="checkbox"]');
            if (checkboxes.length > 0) {
                const isChecked = group.querySelector('input[type="checkbox"]:checked') ||
                                  group.querySelector('input[type="checkbox"][aria-checked="true"]');
                if (!isChecked) {
                    if (checkboxes[0]) {
                        checkboxes[0].click();
                        hasChanges = true;
                    }
                }
            }
        });

        return hasChanges;
    }

    // 爬取当前页面的信息并进行 Markdown 排版
    function scrapeCurrentPage() {
        let md = "";

        const titleEl = document.querySelector('[data-automation-id="formTitle"]');
        if (titleEl) md += `# ${titleEl.innerText.trim()}\n\n`;

        const subTitleEl = document.querySelector('[data-automation-id="formSubTitle"]');
        if (subTitleEl) md += `> ${subTitleEl.innerText.trim()}\n\n`;

        const elements = document.querySelectorAll('[data-automation-id="questionItem"], [data-automation-id="sectionTitle"]');

        let fallbackIndex = 1;

        if (elements.length > 0) {
            elements.forEach((node) => {

                // 1. 纯展示/章节/指令块
                if (node.getAttribute('data-automation-id') === 'sectionTitle') {
                    const sectionContainer = node.closest('[id^="QuestionId_"]') || node.parentElement.parentElement;
                    md += `## 📑 ${node.innerText.trim()}\n\n`;

                    if (sectionContainer) {
                        const subTitleEl = sectionContainer.querySelector('[data-automation-id="sectionSubTitle"]');
                        if (subTitleEl) {
                            md += `> ${subTitleEl.innerText.trim()}\n\n`;
                        }

                        const imgEl = sectionContainer.querySelector('img');
                        if (imgEl && imgEl.src) {
                            md += `![章节说明配图](${imgEl.src})\n\n`;
                        }
                    }
                    return;
                }

                // 2. 交互答题块
                const q = node;
                const titleNode = q.querySelector('[data-automation-id="questionTitle"]');
                if (!titleNode) return;

                // 修复：有些题型的序号不在 titleNode 里，直接去整个题目大框 q 里找
                const ordinalEl = q.querySelector('[data-automation-id="questionOrdinal"]');
                const contentEl = titleNode.querySelector('.text-format-content');
                const requiredEl = q.querySelector('[data-automation-id="requiredStar"]');
                const isMultipleChoice = q.querySelector('input[type="checkbox"]') !== null;

                let qTitle = "";
                if (ordinalEl) qTitle += ordinalEl.innerText.trim() + " ";
                if (contentEl) qTitle += contentEl.innerText.trim();

                if (isMultipleChoice) qTitle += " **(多选)**";
                if (requiredEl && requiredEl.getAttribute('aria-hidden') === 'false') {
                    qTitle += " **(必答)**";
                }

                md += `### ${qTitle || `问题 ${fallbackIndex}`}\n\n`;
                fallbackIndex++;

                const qImg = q.querySelector('img');
                if (qImg && qImg.src) {
                    md += `![题目配图](${qImg.src})\n\n`;
                }

                const choiceItems = q.querySelectorAll('[data-automation-id="choiceItem"]');
                // 修复：兼容 span 和 div 等各种模拟的数字/图形评分选项
                const customRadios = q.querySelectorAll('[role="radio"][aria-posinset]:not(input)');
                const textInput = q.querySelector('textarea, input[data-automation-id="textInput"]');

                if (choiceItems.length > 0) {
                    choiceItems.forEach(choice => {
                        const choiceTextContent = choice.querySelector('.text-format-content');
                        const choiceText = choiceTextContent ? choiceTextContent.innerText.trim() : choice.innerText.trim();
                        md += `- [ ] ${choiceText}\n`;
                    });
                    const otherInput = q.querySelector('input[aria-label="Other answer"], input[aria-label="其他答案"]');
                    if (otherInput) md += `- [ ] 其他: __________________\n`;
                }
                else if (customRadios.length > 0) {
                    const maxItem = customRadios[customRadios.length - 1];
                    const maxScore = maxItem.getAttribute('aria-setsize') || customRadios.length;

                    const ariaLabel = maxItem.getAttribute('aria-label') || '';
                    let iconType = "分 (Number)"; // 默认改为分
                    if (ariaLabel.includes('Heart')) iconType = "心 (Heart)";
                    else if (ariaLabel.includes('Star')) iconType = "星 (Star)";

                    md += `> [评分题: 1 - ${maxScore} ${iconType}]\n`;
                }
                else if (textInput) {
                    const isMultiLine = textInput.tagName.toLowerCase() === 'textarea';
                    md += isMultiLine ? `> [多行文本输入]\n` : `> [单行文本输入]\n`;
                }

                md += `\n`;
            });
        }

        return md + "---\n\n";
    }

    // 导出并下载 Markdown 文件
    function downloadMarkdown(content) {
        const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Microsoft_Forms_爬取结果_${Date.now()}.md`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    // 主控流程
    async function startCrawler() {
        console.log("=== 开始执行自动填写与爬取脚本 ===");
        let fullMarkdown = "";

        while (true) {
            let state = 'loading';
            let startBtn = null;
            let qList = null;

            let waitTime = 0;
            while(waitTime < 10000) {
                startBtn = Array.from(document.querySelectorAll('button')).find(btn =>
                    btn.innerText.includes('Start now') ||
                    btn.innerText.includes('立即开始') ||
                    btn.innerText.includes('开始答题') ||
                    btn.innerText === '开始'
                );
                qList = document.querySelector('#question-list');

                if (startBtn) {
                    state = 'intro';
                    break;
                } else if (qList) {
                    state = 'questions';
                    break;
                }

                await sleep(500);
                waitTime += 500;
            }

            if (state === 'intro') {
                console.log("检测到封面/欢迎页，正在抓取文本并点击开始...");
                fullMarkdown += extractIntroPage(startBtn);
                startBtn.click();
                await sleep(2000);
                continue;
            }
            else if (state === 'questions') {
                console.log("检测到问卷正文页，开始处理...");
                let waitStableCount = 0;
                while (true) {
                    const changed = fillForm();
                    if (changed) {
                        await sleep(1500);
                        waitStableCount = 0;
                    } else {
                        waitStableCount++;
                        if (waitStableCount > 1) break;
                        await sleep(1000);
                    }
                }

                fullMarkdown += scrapeCurrentPage();

                const submitBtn = document.querySelector('[data-automation-id="submitButton"]');
                if (submitBtn) {
                    console.log("检测到提交按钮，停止爬取并生成 Markdown...");
                    downloadMarkdown(fullMarkdown);
                    alert("爬取完成！文件已自动下载。");
                    break;
                }

                const nextBtn = Array.from(document.querySelectorAll('button')).find(btn =>
                    btn.innerText.includes('Next') ||
                    btn.innerText.includes('下一步') ||
                    btn.getAttribute('aria-label') === 'Next'
                );

                if (nextBtn) {
                    console.log("点击下一页...");
                    nextBtn.click();
                    await sleep(2000);
                } else {
                    console.log("未检测到下一页或提交按钮。");
                    downloadMarkdown(fullMarkdown);
                    break;
                }
            }
            else {
                alert("未能检测到有效的问卷元素或封面，爬取停止。");
                if (fullMarkdown) downloadMarkdown(fullMarkdown);
                break;
            }
        }
    }

    // ================= 创建悬浮按钮 =================
    function createUI() {
        if (document.getElementById('my-crawler-btn')) return;

        const btn = document.createElement('button');
        btn.id = 'my-crawler-btn';
        btn.innerText = '▶ 开始爬取';

        Object.assign(btn.style, {
            position: 'fixed',
            bottom: '30px',
            right: '30px',
            zIndex: '999999',
            padding: '12px 24px',
            backgroundColor: '#0078D4',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            fontSize: '16px',
            fontWeight: 'bold',
            boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
            cursor: 'pointer',
            transition: 'all 0.3s'
        });

        btn.onmouseover = () => btn.style.backgroundColor = '#005a9e';
        btn.onmouseout = () => btn.style.backgroundColor = '#0078D4';

        btn.addEventListener('click', async () => {
            btn.innerText = '⚙️ 爬取中...';
            btn.style.backgroundColor = '#666';
            btn.style.cursor = 'not-allowed';
            btn.disabled = true;

            await startCrawler();

            btn.innerText = '✅ 爬取完成';
            btn.style.backgroundColor = '#107c41';
        });

        document.body.appendChild(btn);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => setTimeout(createUI, 1000));
    } else {
        setTimeout(createUI, 1000);
    }

})();
````
