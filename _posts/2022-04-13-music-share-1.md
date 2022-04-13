---
layout: post
title: 音乐分享|艾索——嘘
date: 2022-04-13
author: 梦貘
categories: 碎碎念
tags: [碎碎念]
comments: true
---

<head>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/aplayer@1.10.1/dist/APlayer.min.css">
<div id="aplayer"></div>
<script src="https://cdn.jsdelivr.net/npm/aplayer@1.10.1/dist/APlayer.min.js"></script>
</head>

今天心情不错，想分享一首歌。

是艾索唱的《罗小黑战记》的片尾曲《嘘》，每次听这个歌，我都会感觉特别温暖，然后就会开心起来。

<del><i>顺便试试在Jekyll里内嵌APlayer的效果</i></del>

<!-- more -->

const ap = new APlayer({
    container: document.getElementById('aplayer'),
    audio: [{
        name: '嘘',
        artist: '艾索',
        url: 'https://drive.b-hu.org/music/xu-aisuo.mp3',
        cover: 'https://y.qq.com/music/photo_new/T002R300x300M000000lKfvl0dHqmB_1.jpg'
    }]
});