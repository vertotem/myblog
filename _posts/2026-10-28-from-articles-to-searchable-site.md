---
layout: post
title: 笔记 | 把一堆时政文章变成能搜的网站：思路与关键实现
date: 2026-10-28
author: 梦貘
categories: 笔记
tags: [笔记, AI]
comments: true
---

> **编者按（AI 参与说明）**：这篇笔记由 AI 协助整理，记录的是我自己搭的一条流水线。凡是 AI 经手发布的文章都会带 `AI` 标签，但都经过我本人授权。

## 前言

我手里攒了一批时政类的文章（来自好几个来源），原始状态就是一堆纯文本——想找某件事、想按话题翻一翻都很费劲。于是我搭了一条流水线：从网上把文章抓下来，经过几步自然语言处理，最后落成一个能搜、能翻、能按主题分类的网站。

这篇文章是**分享**，不是教程拼装包——我不会给你塞一个能直接跑的 zip。重点放在两件事上：**这条流水线每一步是"为什么"这么设计的（思路）**，以及**真正卡住人的地方是怎么用代码解掉的（关键实现）**。把思路和关键代码看懂，你换自己的数据、换自己的栈，照样能复刻。

## 先认识几个词（看代码前扫盲）

| 名词 | 大白话 |
|---|---|
| 分词 | 中文词之间没空格，电脑不知道"词"的边界。分词就是把它切成「黑龙江 / 省 / 大力 / 发展 / 数字 / 龙江」这样的词。 |
| 实体 | 文章里的人名、地名、机构名等专有名词，比如「李强」「齐齐哈尔市」「国务院」。 |
| TF-IDF | 给词打"重要性分数"：在一篇里常见、但在所有文章里少见的词，分数高 → 最能代表这篇。 |
| 主题模型（LDA） | 让电脑自己从全部文章里"归纳"出若干主题，不用你提前定义分类。 |
| SQLite | "文件型数据库"：整个库就是一个 `.db` 文件，不用装服务器，复制就能用。 |

## 整体思路

整套流程 7 步，逻辑是一条直线：

```
抓取文章 → 分词标实体 → 抽关键词 → 归纳主题 → 合并 → 入库去重 → 清洗 + 做网站
```

每一步都在解决一个具体痛点，下面逐段说。

---

### 阶段 1：内容获取（从网上抓取）

**思路**：没有原材料就没有后面的一切。这一步目标很单纯——把散落在各处的文章，收拢成一份规整的表格 `articles.csv`，每行一篇，含 `url`、标题、正文、来源。

**关键实现**：本质就是写个爬虫按来源把文章下载下来。爬虫怎么写最省事？直接问 AI："帮我写个 Python 爬虫，把某某来源的文章抓成 `articles.csv`，字段要 url、标题、正文、来源"，它就能给你一个能跑的版本。下面是个示意骨架，真正的选择器（`select_one` 那几行）因地而异，让 AI 按你的目标网站补：

```python
import csv, requests
from bs4 import BeautifulSoup

rows = []
for url in source_urls:
    soup = BeautifulSoup(requests.get(url, timeout=10).text, "html.parser")
    rows.append({
        "url": url,
        "title": soup.select_one("h1").get_text(strip=True),
        "text": soup.select_one(".article").get_text("\n", strip=True),
        "source": "某来源",
    })

with open("articles.csv", "w", newline="", encoding="utf-8") as f:
    csv.DictWriter(f, fieldnames=["url", "title", "text", "source"]).writerows(rows)
```

---

### 阶段 2：分词与实体（HanLP）

**思路**：电脑是"按字符"看中文的，它不知道「黑龙江」是个地名、「李强」是个人名。如果不先分词、不先标实体，后面所有分析都建立在"错的词"上，结果必然一团糟。所以这一步是**整条流水线的地基**——把人类语言翻译成机器能处理的"词"和"专有名词"。

**关键实现**：用 HanLP 的多任务模型，一次拿到分词、词性、实体；逐篇处理并写成 JSONL（一行一条结构化记录）。脚本支持断点续传——中途停了再跑会跳过已完成的，只算剩下的，文章多时很实用。

```python
import os, json, hanlp
os.environ["HANLP_HOME"] = "./hanlp_models"   # 模型首次运行会自动下载

HanLP = hanlp.load(
    hanlp.pretrained.mtl.CLOSE_TOK_POS_NER_SRL_DEP_SDP_CON_ELECTRA_SMALL_ZH,
    tasks=['tok', 'pos', 'ner'])

texts = ["省委领导赴齐齐哈尔市泰来县调研防汛抗旱与备春耕工作。",
         "黑龙江省将大力发展数字龙江，深化对俄经贸合作。"]

with open("heilongjiang_nlp_data.jsonl", "w", encoding="utf-8") as f:
    for i, text in enumerate(texts):
        doc = HanLP(text)
        rec = {
            "id": i + 1,
            "original_text": text,
            "tokens": doc['tok/fine'],      # 分词列表
            "pos_tags": doc['pos/ctb'],     # 词性列表（NN/NR/NT/NS…）
            "ner_entities": doc['ner/msra'] # 命名实体：地名/机构名/人名…
        }
        f.write(json.dumps(rec, ensure_ascii=False) + "\n")
```

---

### 阶段 3：关键词抽取（TF-IDF）

**思路**：分词后每篇都是一长串词，我们需要知道**哪些词最能代表这篇**——也就是自动给它打标签，方便以后按标签搜、按标签聚。这里有个关键决策：**只保留名词**。因为承载"话题"的是名词（"国务院""亚冬会""防汛"），动词形容词（"大力""进行"）基本是噪音。再配三个参数收口：

- `max_df=0.85`：在 85% 以上文章都出现的"万金油"词（"工作""情况"）对区分文章没用，滤掉；
- `min_df=2`：只出现 1 次的词多半是错别字或生僻词，滤掉；
- `max_features=10000`：只留最具代表性的 1 万个核心词，控规模、降噪音。

**关键实现**：先做词性过滤，再跑 TF-IDF，最后给每篇取分数最高的前 5 个词当"灵魂标签"。矩阵另存一份给下一步的主题建模用。

```python
import json, numpy as np
from scipy import sparse
from sklearn.feature_extraction.text import TfidfVectorizer

corpus, original_texts = [], []
with open("heilongjiang_nlp_data.jsonl", encoding="utf-8") as f:
    for line in f:
        rec = json.loads(line)
        original_texts.append(rec["original_text"])
        # 核心：只保留名词（词性以 N 开头），动词/形容词/标点全丢
        valid = [w for w, p in zip(rec["tokens"], rec["pos_tags"]) if p.startswith('N')]
        corpus.append(" ".join(valid))

vectorizer = TfidfVectorizer(max_df=0.85, min_df=2, max_features=10000)
tfidf_matrix = vectorizer.fit_transform(corpus)
feature_names = np.array(vectorizer.get_feature_names_out())

sparse.save_npz("tfidf_matrix.npz", tfidf_matrix)  # 给阶段 4 的 LDA 用

# 每篇取 TF-IDF 分数最高的前 5 个词作为标签
with open("heilongjiang_tagged_database.jsonl", "w", encoding="utf-8") as f:
    for i in range(tfidf_matrix.shape[0]):
        scores = tfidf_matrix[i].toarray()[0]
        top = [feature_names[j] for j in scores.argsort()[-5:][::-1] if scores[j] > 0]
        f.write(json.dumps({"id": i+1, "text": original_texts[i], "tags": top},
                           ensure_ascii=False) + "\n")
```

---

### 阶段 4：主题建模（LDA）

**思路**：阶段 3 只是给**每篇**打标签，但还没把"相似文章"归到一起。比如几百篇都提到"民生""保障""就业"，它们其实属于同一个话题，可 TF-IDF 自己不会把它们拢成一个分类。LDA 的作用就是**自动发现这些隐含主题**——你不用提前想好"该分几个类、每个类叫什么"，电脑按词的共同出现规律自己归纳。网站左边那个"按主题浏览"的分类栏，素材就来自这里。

**关键实现**：直接拿上一步的 TF-IDF 矩阵跑 LDA，每篇归到概率最高的主题；同时导出一份"主题清单"（每个主题权重最高的若干词，作为主题名候选）。

```python
import json, numpy as np, pandas as pd
from scipy import sparse
from sklearn.decomposition import LatentDirichletAllocation

tfidf_matrix = sparse.load_npz("tfidf_matrix.npz")
feature_names = np.array(json.load(open("tfidf_feature_names.json", encoding="utf-8")))

# Alpha/Beta 调小 → 每篇文章主题更单一、每个主题词更集中
lda = LatentDirichletAllocation(
    n_components=50, doc_topic_prior=0.01, topic_word_prior=0.01,
    max_iter=30, learning_method='online', random_state=42, n_jobs=-1)
doc_topic_dist = lda.fit_transform(tfidf_matrix)

# 主题清单：每个主题取权重最高的 15 个词
topic_results = []
for idx, comp in enumerate(lda.components_):
    top_words = [feature_names[i] for i in comp.argsort()[:-16:-1]]
    topic_results.append({"主题编号": idx, "核心关键词": " / ".join(top_words)})
pd.DataFrame(topic_results).to_csv("lda_50_topics_summary.csv", index=False, encoding="utf-8-sig")

# 文章 → 主题 映射：每篇归到概率最高的主题
with open("final_articles_with_topics.jsonl", "w", encoding="utf-8") as f:
    for i, art in enumerate(articles_data):
        art["topic_id"] = int(doc_topic_dist[i].argmax())
        f.write(json.dumps(art, ensure_ascii=False) + "\n")
```

---

### 阶段 5：合并

**思路**：前面几步各算各的，数据散在多处。合并成一张"全字段大表"后，下一步建库一步到位，不用反复查多份文件。

**关键实现**：按行把"带标签库"和"主题映射"拼起来，给每篇文章补上 `topic_id`。这里有个容易翻车的点：**两份文件的行数、顺序必须严格对齐**。所以代码用了 `zip_longest` + 提前结束即报错，而不是默默错位——行数对不上立刻停，比事后发现数据串了强。

```python
from itertools import zip_longest
import json

with open(BASE) as fb, open(TOPIC) as ft, open(OUT, "w", encoding="utf-8") as fo:
    for idx, (bl, tl) in enumerate(zip_longest(fb, ft, fillvalue=None), 1):
        if bl is None or tl is None:
            raise SystemExit(f"行数不匹配，第 {idx} 行一方提前结束")  # 不静默错位
        base = json.loads(bl)
        base["topic_id"] = json.loads(tl).get("topic_id")  # 只追加主题字段
        fo.write(json.dumps(base, ensure_ascii=False) + "\n")
```

---

### 阶段 6：入库 SQLite

**思路**：网站要能**快速查**（按主题筛选、按关键词搜、翻页），纯文本做不到，需要数据库。为什么选 SQLite？它是"文件型数据库"——整个库就是一个 `.db` 文件，不用装数据库服务器，把文件连同网页一起复制就能部署，对个人项目最省心。

**关键实现（去重）**：爬虫抓到的文章常有重复（同一篇被多来源转载、或重复抓取）。如果同一个意思存好几份，搜索结果会灌水、分类也会虚胖。所以入库时做了**三重去重**，命中任意一条就只留第一篇：

1. `url` 相同；
2. 正文 `md5` 相同 → 完全相同；
3. 标题相同，且正文前 200 字相似度 `> 0.85` → 视为同质重复。

```python
conn = sqlite3.connect("merged_articles.db")
conn.execute("DROP TABLE IF EXISTS articles")
conn.execute("""CREATE TABLE articles (
    url TEXT PRIMARY KEY, id INTEGER, title TEXT, text TEXT,
    source TEXT, tags TEXT, topic_name TEXT)""")
conn.execute("CREATE INDEX IF NOT EXISTS idx_topic_name ON articles(topic_name)")

seen_urls, seen_md5, title_prefixes = set(), set(), {}

for rec in iter_jsonl(BASE):
    url = rec.get("url", "")
    if url in seen_urls: continue            # ① url 重复
    seen_urls.add(url)
    text = rec.get("text", "")
    md5 = hashlib.md5(text.encode()).hexdigest()
    if md5 in seen_md5: continue             # ② 正文完全相同
    title, prefix = rec.get("title", ""), text[:200]
    if title and prefix:
        for p in title_prefixes.get(title, []):
            if difflib.SequenceMatcher(None, prefix, p).ratio() >= 0.85:  # ③ 前200字相似
                break
        else:
            title_prefixes.setdefault(title, []).append(prefix)
        else:
            continue
    seen_md5.add(md5)
    # topic_id → 主题名称（经 summary.csv 映射），直接存名字不存数字编号
    topic_name = topic_to_group.get(url_to_topic.get(url, -1), "")
    conn.execute(
        "INSERT OR REPLACE INTO articles (url,id,title,text,source,tags,topic_name) VALUES (?,?,?,?,?,?,?)",
        (url, rec.get("id"), rec.get("title"), text, rec.get("source"),
         json.dumps(rec.get("tags", []), ensure_ascii=False), topic_name))
conn.commit()
```

---

### 阶段 7：清洗 + 网站

**思路（清洗）**：LDA 自动归纳出的主题名常有近义重复，比如「民生服务」和「民生福祉」其实是一回事。人工归并一下，分类栏才干净好看。

**关键实现**：一条 SQL 就把近义主题名统一掉，比写 Python 循环清爽得多：

```python
cur.execute("DELETE FROM articles WHERE topic_name = '删掉'")
cur.execute("UPDATE articles SET topic_name='民生福祉' WHERE topic_name IN ('民生服务','民生福祉')")
cur.execute("UPDATE articles SET topic_name='生态环境' WHERE topic_name IN ('林业生态','生态环境')")
cur.execute("UPDATE articles SET topic_name='中央精神' WHERE topic_name IN ('省委精神','中央精神')")
cur.execute("UPDATE articles SET topic_name='经济指数' WHERE topic_name IN ('经济科技','经济指数')")
conn.commit()
```

**思路（网站）**：前面六步都是"把数据准备好"，最后一步才让它**被人用得上**。后端 `api.php`（PHP + SQLite3，数据库不直接暴露给前端）提供主题、标签、来源、文章列表等接口；前端 `index.html` 是响应式单页，左侧主题分类栏、顶部搜索面板、标签云、文章卡片，点开是带 Markdown 渲染和高亮的详情弹窗。本地用 `php -S` 起个服务就能看。

**关键实现（最值得说的一点）**：搜索和标签筛选都支持 `AND` / `OR` / `NOT` 与括号的组合表达式，比如 `(哈尔滨 AND 亚冬会) OR (大庆 AND NOT 油田)`。实现上分三步——先把表达式切成 token，再递归下降解析成**语法树（AST）**，最后把语法树翻译成 SQL。标签存在 SQLite 里是 JSON 数组，所以"含某标签"用的是 `json_each` 展开后的 `EXISTS` 子查询：

```php
// 标签表达式 → SQL：支持 (A AND B) OR (C AND NOT D)
function buildTagExprCondition($expr, &$params) {
    $tokens = tokenizeTagExpr($expr);     // 切成 ( ) AND OR NOT 词
    $ast    = parseTagExpr($tokens);      // 递归下降 → 语法树
    return astToSql($ast, $params);       // 语法树 → SQL
}

function astToSql($ast, &$params) {
    if ($ast['type'] === 'TAG') {
        $params[] = $ast['value'];
        // tags 在库里是 JSON 数组，用 json_each 展开后判断存在性
        return "EXISTS (SELECT 1 FROM json_each(a.tags) WHERE json_each.value = ?)";
    }
    if ($ast['type'] === 'NOT') return "NOT (" . astToSql($ast['child'], $params) . ")";
    if ($ast['type'] === 'AND') return "(" . astToSql($ast['left']) . " AND " . astToSql($ast['right']) . ")";
    if ($ast['type'] === 'OR')  return "(" . astToSql($ast['left']) . " OR "  . astToSql($ast['right']) . ")";
}
```

全文搜索（标题+正文 `LIKE`）复用同一套 tokenizer / parser，只是把叶子节点从"含标签"换成"包含关键词"——思路完全一样，所以一处写对、两处受益。

---

## 小结：这条流水线的思路主线

把"一堆文本"变成"一个能用的网站"，核心思路是一条直线，**每一步都在替下一步铺路**：

1. **让机器读懂词**（分词 + 实体）——这是地基；
2. **给每篇找代表词**（TF-IDF，只留名词）——自动打标签；
3. **把相似文章归成主题**（LDA）——给网站左侧分类栏供素材；
4. **存进能查的库**（SQLite，三重去重）——让查询快、结果不灌水；
5. **套上能用的界面**（PHP + HTML）——让数据被人用得上。

真正卡人的地方也就那几个：行数对齐不能静默错位、去重要三重兜底、布尔搜索表达式要自己写个 mini 解析器。这些在上面的关键实现里都给了可直接参考的代码。工具可以换——分词换 jieba、主题换 BERTopic、前端换任意框架——只要保证"带 `url` / `tags` / `topic_name` 的 `articles` 表"这个约定不变，前后端就能接上。思路通了，换什么都行。
