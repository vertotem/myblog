---
layout: post
title: 文档 | 黄色高亮一键变填空：Word 宏 + WPS JS 版
date: 2026-11-01
author: 梦貘
categories: 文档
tags: [文档, AI]
comments: true
---

## 前言：先说个反常识，Word 也能编程

很多人用 Word 就是打字、调格式，觉得它就是个打字机。

其实不是。Word 里面藏着一套编程接口：文档、段落、字符、字体，这些东西在程序眼里都是一个个对象，你可以写一段小程序，让它替你去改格式、去遍历全文。

这段小程序，就叫宏。

宏一点都不玄，说白了就是：你平时要手动点几百次鼠标才能干完的活，写成几十行代码，让电脑一秒钟替你干完，而且不会漏、不会手抖。

今天这篇，就是给老师用的一个最实在的例子：做填空题。

## 痛点：填空题做起来，真的很磨人

我以前做填空题，都是这么干的：

先出一份带答案的教师版，再复制一份，把答案一个一个删掉，改成下划线。

听起来简单，做起来全是坑：

- 答案有长有短，下划线要打几个，全凭手感，打多了打少了，卷面就很难看；
- 一张卷子几十道填空，删着删着就容易漏一个，或者多删一个字；
- 教师版和学生版分开维护，改一道题，要改两个地方，改着改着两个版本就对不上了；
- 最烦的是，你明明只想把答案“藏起来”，结果还得重新排版，题号、括号、标点全都得再对一遍。

所以我后来换了个思路：**只维护一份教师版，答案用黄色高亮标出来，跑一下宏，学生版就自动出来了。**

## 思路：黄色高亮，就是给宏留的记号

流程就四步：

1. 正常出题，答案不要删，直接用黄色高亮标出来。这份就是教师版，留着备课、留着改卷用。
2. **先另存一份，叫学生版。** 这一步千万别省，宏是直接改文档的，你要在副本上跑，别把教师版给改没了。
3. 在学生版上跑一下宏。
4. 检查一遍，打印。

宏干的事也很好理解：它把所有黄色高亮的地方，变成“白字 + 黑色下划线”。

白字打印出来看不见，下划线看得见，而且下划线的长度，正好就是答案的长度。学生正好在横线上写答案，老师也不用再数格子、打下划线了。

举个例子，教师版是这样的：

> 第一次世界大战爆发于 1914 年。

你把“1914”标成黄色高亮，跑完宏，学生版打印出来就是：

> 第一次世界大战爆发于 ______ 年。

横线的长度，就是“1914”四个字的长度，不多不少。

## VBA 版：给 Microsoft Word 用，代码完整提供

先说怎么用，不用先看懂代码：

1. 在学生版文档里，按 `Alt + F11`，打开 VBA 编辑器；
2. 点“插入 - 模块”，把下面这段代码完整粘贴进去；
3. 按 `F5` 运行，或者点上面的运行按钮；
4. 回到文档里检查一遍，没问题就保存。

注意：宏跑完之后，格式就已经改好了，宏本身不用一直留着。如果你想把宏也保存在文件里，就另存为 `.docm` 格式；如果只是跑一次就完事，正常保存成 `.docx` 也行，格式不会丢。

代码如下，完整版，直接复制就能用：

```vba
Sub ReplaceYellowHighlightWithWhiteUnderline()
    Dim doc As Document
    Dim rng As Range
    Dim charRng As Range
    Dim startPos As Long
    Dim endPos As Long
    Dim i As Long
    Dim totalChars As Long
    Dim hlIndex As Variant
    Dim prevHl As Variant

    Set doc = ActiveDocument
    Application.ScreenUpdating = False

    totalChars = doc.Characters.Count

    For i = totalChars To 1 Step -1
        Set charRng = doc.Characters(i)

        On Error Resume Next
        hlIndex = charRng.HighlightColorIndex
        On Error GoTo 0

        If Not IsEmpty(hlIndex) Then
            If hlIndex = wdYellow Then
                endPos = i
                startPos = i

                Do While startPos > 1
                    On Error Resume Next
                    prevHl = doc.Characters(startPos - 1).HighlightColorIndex
                    On Error GoTo 0

                    If Not IsEmpty(prevHl) Then
                        If prevHl = wdYellow Then
                            startPos = startPos - 1
                        Else
                            Exit Do
                        End If
                    Else
                        Exit Do
                    End If
                Loop

                Set rng = doc.Range(Start:=doc.Characters(startPos).Start, _
                                    End:=doc.Characters(endPos).End)

                ' 1) 去掉高亮
                rng.HighlightColorIndex = wdNoHighlight

                ' 2) 先设下划线颜色(黑)，再设下划线类型
                rng.Font.UnderlineColor = RGB(0, 0, 0)
                rng.Font.Underline = wdUnderlineSingle

                ' 3) 最后设字体白色
                rng.Font.Color = wdColorWhite

                i = startPos
            End If
        End If
    Next i

    Application.ScreenUpdating = True
End Sub
```

### 这段代码到底在干什么，我用人话讲一遍

你不用每个词都看懂，知道这三个关键点就够了：

**第一，它是倒着找的。** 从文档最后一个字往前找，碰到黄色就停下来。这样改格式的时候，不会把后面的位置给搅乱，算是写宏的一个老习惯。

**第二，它是按“一段黄色”来处理的，不是按一个字。** 比如“1914”是四个字都标黄了，它会先往前找，把这四个字合并成一个范围，再一起改。这样就不会出现四个字被拆成四段、下划线断开的情况。

**第三，改格式的顺序不能乱，就是代码里注释的那三步：**

1. 先去掉黄色高亮；
2. 先把下划线颜色设成黑色，再设下划线类型是单线；
3. 最后才把字体设成白色。

为什么最后才设白色？因为下划线的颜色默认是跟着字体颜色走的，你要是先把字设白了，下划线可能也跟着变白，那就看不见横线了。所以先把下划线钉成黑色，再把字变白，这个顺序别自己改。

## JS 版：给 WPS 用，代码也是完整版

很多人现在用的是 WPS，WPS 里没有 VBA 那套，它用的是 JS 宏，语言换成了 JavaScript，但思路一模一样：找黄色，合并成一段，改成白字黑下划线。

怎么用：

1. 在学生版文档里，点“开发工具 - JS 宏”，打开宏编辑器，新建一个 JS 宏；
2. 把下面这段代码完整粘贴进去；
3. 点运行；
4. 回到文档里检查一遍，没问题就保存。

注意两点：JS 宏主要在 Windows 版的 WPS Writer 里比较全，Mac、Linux、网页版支不支持，要以你自己那个版本为准；还有，WPS 里那些 `wdYellow` 之类的常量不一定自带，所以下面这段代码开头就把常量都自己定义好了，你不用再去找。

代码如下：

```js
// WPS JS 宏：黄色高亮一键变填空（白字 + 黑下划线）
// 常量先自己定义好，免得不同版本找不到
const wdYellow = 7;          // 标准黄色高亮
const wdNoHighlight = 0;     // 无高亮
const wdUnderlineSingle = 1; // 单下划线
const wdColorWhite = 16777215; // 白色
const wdColorBlack = 0;      // 黑色

function ReplaceYellowHighlightWithWhiteUnderline() {
  const doc = Application.ActiveDocument;
  Application.ScreenUpdating = false;

  const totalChars = doc.Characters.Count;

  // 倒着遍历，和 VBA 版是一个思路
  for (let i = totalChars; i >= 1; i--) {
    const charRng = doc.Characters.Item(i);
    let hlIndex;
    try {
      hlIndex = charRng.HighlightColorIndex;
    } catch (e) {
      hlIndex = undefined;
    }

    if (hlIndex === wdYellow) {
      let endPos = i;
      let startPos = i;

      // 往前找，把连续的黄色合并成一段
      while (startPos > 1) {
        let prevHl;
        try {
          prevHl = doc.Characters.Item(startPos - 1).HighlightColorIndex;
        } catch (e) {
          prevHl = undefined;
        }
        if (prevHl === wdYellow) {
          startPos--;
        } else {
          break;
        }
      }

      const rng = doc.Range(
        doc.Characters.Item(startPos).Start,
        doc.Characters.Item(endPos).End
      );

      // 1) 去掉高亮
      rng.HighlightColorIndex = wdNoHighlight;

      // 2) 先设下划线颜色（黑），再设下划线类型
      rng.Font.UnderlineColor = wdColorBlack;
      rng.Font.Underline = wdUnderlineSingle;

      // 3) 最后设字体白色
      rng.Font.Color = wdColorWhite;

      i = startPos;
    }
  }

  Application.ScreenUpdating = true;
}
```

JS 版和 VBA 版，逻辑是一一对应的：倒着找、合并黄色段、三步改格式、顺序不能乱。你在 Word 里用 VBA 版，在 WPS 里用 JS 版，效果是一样的。

## 先试一小段，别上来就跑整张卷子

不管你用哪个版本，我都建议你先这么试：

1. 先备份教师版，再在副本上跑；
2. 第一次跑，先找一小段话试，比如就两三个填空，跑完看效果对不对；
3. 对了，再跑整张卷子。

跑错了也别慌，宏跑完之后，马上按 `Ctrl + Z` 还能撤销。只要你教师版还在，学生版随时可以重新生成，这就是“只维护一份教师版”的好处。

## 常见问题，我先替你问了

**问：我标的黄色，怎么跑完还是黄色？**

答：先看你标的是不是标准黄色。Word 里高亮颜色有很多种浅黄、自定义黄，宏只认标准黄色那一种。你在高亮颜色里，选那个最普通的黄色就行，别自己调一个 RGB 黄色，那个宏是认不出来的。

**问：下划线怎么看不见，或者是白色的？**

答：大概率是顺序被改了，或者你手动又改了一遍字体颜色。按上面代码的顺序来：先下划线黑，再字体白，别反过来。

**问：跑完之后，答案是不是就彻底没了？**

答：没有，答案还在，只是变成白字了，打印看不见而已。万一你要恢复，`Ctrl + A` 全选，把字体颜色改回黑色、去掉下划线，答案就又出来了。

这一点也要反过来提醒一句：**正式考试的卷子，别直接把学生版电子稿发给学生。** 因为学生全选改个颜色，答案就全出来了。正式发卷，还是打印版最稳妥；电子稿就留着平时练习、内部用。

**问：我不会编程，能用吗？**

答：能。你不用学会编程，你只需要会三件事：复制、粘贴、点运行。宏就是把你重复几十次的手工活，交给电脑去干。你把黄色标好，剩下的交给宏。

## 结尾

总结一下，整个流程就一句话：

**教师版答案标黄，另存一份学生版，跑一下宏，黄色就变成白字黑下划线，填空题就做好了。**

Word 版用 VBA，WPS 版用 JS，代码上面都完整给了，你直接复制就能用。

你不用先学会编程再来做题，先把这一招用起来，省下来的时间，才是真的。
