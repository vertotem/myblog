---
comments: 'true'
author: 梦貘
date: '2026-03-02 01:34 +0800'
layout: post
title: 笔记|文本人物关系图谱提取
categories: 笔记
tags: 笔记
---
## 前言

聊作记录，供未来的自己参考

## 第一步：

OneNote导出日记到docx

## 第二步：

转换为完整的md文档

convert_onenote.py
```python
import os
import re
import uuid
import shutil
import subprocess
from pathlib import Path

# --- 配置区 ---
DOCX_FILE = "【你的docx文件名】"
OUTPUT_MD = "diary_full.md"
FINAL_IMAGES_DIR = "images"   # 最终存放图片的文件夹
TEMP_MEDIA_DIR = "temp_media" # Pandoc 临时提取目录


def _normalize_path(p: str) -> str:
    """
    统一路径格式，方便做字典键：
    - 去掉前面的 ./ 或 .\\
    - 用 / 作为分隔符
    """
    p = p.strip()
    p = p.replace("\\", "/")
    if p.startswith("./"):
        p = p[2:]
    return p


def run_conversion():
    # 自动选择要转换的 docx 文件：
    # - 如果当前目录下只有一个 .docx 文件，则优先使用那个文件；
    # - 否则回退到上面的 DOCX_FILE 常量。
    cwd = Path(__file__).resolve().parent
    docx_candidates = sorted(cwd.glob("*.docx"))

    if len(docx_candidates) == 1:
        docx_file = docx_candidates[0].name
    else:
        docx_file = DOCX_FILE

    if not (cwd / docx_file).exists():
        print(f"错误：未找到要转换的 DOCX 文件：{docx_file}")
        if len(docx_candidates) > 1:
            print("当前目录下存在多个 docx 文件，请修改脚本中的 DOCX_FILE 或整理多余文件：")
            for p in docx_candidates:
                print(f" - {p.name}")
        return

    # 1. 创建必要文件夹
    if not os.path.exists(FINAL_IMAGES_DIR):
        os.makedirs(FINAL_IMAGES_DIR)

    print(f"正在转换 {docx_file}...")

    # 2. 执行 Pandoc 转换
    # --extract-media 会在 temp_media/media 下生成 image1.png 等
    try:
        subprocess.run(
            [
                "pandoc",
                docx_file,
                "-f",
                "docx",
                "-t",
                "gfm",  # 使用 GitHub 风格 Markdown，兼容性好
                "--extract-media=" + TEMP_MEDIA_DIR,
                "--wrap=none",
                "-o",
                OUTPUT_MD,
            ],
            check=True,
        )
    except subprocess.CalledProcessError as e:
        print(f"Pandoc 运行失败: {e}")
        return

    # 3. 读取生成的 Markdown 并处理图片路径
    if not os.path.exists(OUTPUT_MD):
        print("错误：未找到生成的 Markdown 文件")
        return

    with open(OUTPUT_MD, "r", encoding="utf-8") as f:
        content = f.read()

    # ---- 3.1 收集 Pandoc 生成的图片路径（Markdown 和 HTML 两种写法）----
    # Markdown 形式: ![alt](temp_media/media/image1.png){...}
    md_img_pattern = re.compile(
        r"!\[(?P<alt>[^\]]*)]\((?P<path>[^)]+)\)"
    )
    # HTML 形式: <img src="temp_media/media/image1.png" alt="...">
    html_img_pattern = re.compile(
        r'<img\s+[^>]*?src="(?P<path>[^"]+)"(?P<attrs>[^>]*)>'
    )

    path_map = {}  # 规范化路径 -> (原文件名, 新文件名)

    # 从 Markdown 图片里收集
    for m in md_img_pattern.finditer(content):
        raw_path = m.group("path")
        norm_path = _normalize_path(raw_path)
        if not norm_path.startswith(f"{TEMP_MEDIA_DIR}/"):
            continue
        filename = os.path.basename(norm_path)
        if norm_path not in path_map:
            ext = os.path.splitext(filename)[1]
            new_name = f"{uuid.uuid4()}{ext}"
            path_map[norm_path] = (filename, new_name)

    # 从 HTML 图片里收集
    for m in html_img_pattern.finditer(content):
        raw_path = m.group("path")
        norm_path = _normalize_path(raw_path)
        if not norm_path.startswith(f"{TEMP_MEDIA_DIR}/"):
            continue
        filename = os.path.basename(norm_path)
        if norm_path not in path_map:
            ext = os.path.splitext(filename)[1]
            new_name = f"{uuid.uuid4()}{ext}"
            path_map[norm_path] = (filename, new_name)

    print(f"找到 {len(path_map)} 张图片，正在复制到 {FINAL_IMAGES_DIR} ...")

    # ---- 3.2 移动并重命名实际图片文件 ----
    for norm_path, (filename, new_name) in path_map.items():
        old_file_path = os.path.join(TEMP_MEDIA_DIR, "media", filename)
        new_file_path = os.path.join(FINAL_IMAGES_DIR, new_name)

        if os.path.exists(old_file_path):
            shutil.move(old_file_path, new_file_path)

    # 规范化后的路径 -> 新的 Markdown 路径（images/xxxx.png）
    norm_to_md_path = {
        norm_path: f"{FINAL_IMAGES_DIR}/{new_name}"
        for norm_path, (_, new_name) in path_map.items()
    }

    # ---- 3.3 把 Markdown 里引用 temp_media 的图片，路径改成 images/UUID.xxx ----
    def _replace_md_img(m: re.Match) -> str:
        alt = m.group("alt")
        raw_path = m.group("path")
        norm_path = _normalize_path(raw_path)
        new_rel_path = norm_to_md_path.get(norm_path)
        if not new_rel_path:
            return m.group(0)
        return f"![{alt}]({new_rel_path})"

    content = md_img_pattern.sub(_replace_md_img, content)

    # ---- 3.4 把 HTML <img> 标签也转成 Markdown 形式 ----
    # 例如：<img src="temp_media/media/image1.png" alt="xxx" ...>
    # 变成：![xxx](images/UUID.png)
    def _replace_html_img(m: re.Match) -> str:
        raw_path = m.group("path")
        norm_path = _normalize_path(raw_path)
        new_rel_path = norm_to_md_path.get(norm_path)
        if not new_rel_path:
            return m.group(0)

        # 尝试取 alt 文本
        attrs = m.group("attrs") or ""
        alt_match = re.search(r'alt="([^"]*)"', attrs)
        alt_text = alt_match.group(1) if alt_match else ""
        return f"![{alt_text}]({new_rel_path})"

    content = html_img_pattern.sub(_replace_html_img, content)

    # 4. 写回修改后的 Markdown
    with open(OUTPUT_MD, "w", encoding="utf-8") as f:
        f.write(content)

    # 5. 清理临时文件夹
    if os.path.exists(TEMP_MEDIA_DIR):
        shutil.rmtree(TEMP_MEDIA_DIR)

    print(f"--- 转换完成 ---")
    print(f"文件：{OUTPUT_MD}")
    print(f"图片库：{FINAL_IMAGES_DIR}")


if __name__ == "__main__":
    run_conversion()
```

## 第三步：

调用API识别、提取人名

extract_names.py
```python
import argparse
import json
import logging
import os
import re
from datetime import datetime
from pathlib import Path
import time
from typing import Any

import requests


# ===== 配置区域：根据自己的情况修改 =====

# OpenAI 兼容接口的基础地址，例如：
# - 官方： https://api.openai.com/v1
# - 第三方：自行填写对应的 base_url
BASE_URL = "【BaseURL】"

# API Key：默认从环境变量 OPENAI_API_KEY 读取，也可以直接在此处填写
API_KEY = os.getenv("OPENAI_API_KEY") or "【API Key】"

# 使用的模型名称，例如 "gpt-4.1-mini"、"gpt-4o-mini" 等
MODEL = "【模型名称】"

# 采样温度
TEMPERATURE = 0.0

# 最大生成 token 数（可按自己的模型限制调整）
MAX_TOKENS = 10240

# 日记所在的目录（相对于本脚本所在目录）
DAYS_DIR = "days"

# 结果 / 日志 / 重试日志
RESULT_PATH = "result.json"
LOG_PATH = "log.log"
RETRY_LOG_PATH = "retry_log.log"

# 请求超时与重试次数
REQUEST_TIMEOUT = 60
RETRY_TIMES = 3


def setup_logging() -> None:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(message)s",
        handlers=[
            logging.FileHandler(LOG_PATH, encoding="utf-8"),
            logging.StreamHandler(),
        ],
    )


def build_prompt(text: str, file_rel: str) -> tuple[str, str]:
    system = (
        "你是一个帮助标注日记文本中「人物提及」的助手。"
        "人物包括：具体的人名（中文或外文）、昵称、亲属称谓、职务称谓等。"
        "不要把单独的「我」视为人物提及，也不要标注代词「你」「他」「她」等，除非它们是某个固定昵称的一部分。"
        "你的任务是在不改变原文本内容含义的前提下，提取包含人物提及的片段，并在片段中用 $$ 标记人物提及。"
    )

    user = f"""下面是一篇日记的完整内容。请找出文本中所有「人物提及」的每一次出现。

要求：
1. 「人物提及」包括：
   - 具体的人的名字
   - 指代具体人的称呼或昵称
2. 明确不要标注：
   - 单独的「我」
   - 普通代词「你」「他」「她」「他们」等
2. 每一次出现都要单独记录（即使是同一个人，也要按出现次数分别记录）。
3. 对于每一次出现，请截取一小段包含该人物提及的原文片段（建议总长度 30~80 个字符），
   并在片段中用两个美元符号 $$ 将人物提及包裹起来，例如：
   原句：我打了张三，他恨我
   某一次出现的片段可以是："...$$张三$$，他恨我"
4. 片段要求：
   - 每个片段中必须且只能出现一处用 $$ 包裹的人物提及（即一对 $$...$$）。
   - 片段中的其他文字必须保持与原文完全一致，不要增删、替换、重写或改动（包括空格和换行）。
5. 请按照人物在原文中出现的先后顺序返回结果。
6. 如果整篇日记中没有任何人物提及，请返回一个空的 items 数组。
7. 最终输出必须是一个 JSON 对象，结构为：
   {{
     "items": [
       {{
         "marked": "……$$人物提及$$……"
       }},
       ...
     ]
   }}
   - 不要输出任何多余的说明、解释或注释。

文件名：{file_rel}

日记全文如下：
{text}
"""
    return system, user


def call_openai(text: str, file_rel: str) -> list[dict]:
    system_content, user_content = build_prompt(text, file_rel)
    url = BASE_URL.rstrip("/") + "/chat/completions"
    headers = {
        "Authorization": f"Bearer {API_KEY}",
        "Content-Type": "application/json",
    }
    payload = {
        "model": MODEL,
        "messages": [
            {"role": "system", "content": system_content},
            {"role": "user", "content": user_content},
        ],
        "temperature": TEMPERATURE,
        "max_tokens": MAX_TOKENS,
    }

    for attempt in range(1, RETRY_TIMES + 1):
        try:
            resp = requests.post(url, headers=headers, json=payload, timeout=REQUEST_TIMEOUT)
            resp.raise_for_status()
            data = resp.json()

            # 兼容不同返回格式，提取文本内容
            choice = data.get("choices", [{}])[0]
            content = ""
            if "message" in choice and isinstance(choice["message"], dict):
                content = choice["message"].get("content", "") or ""
            elif "text" in choice:
                content = choice.get("text") or ""

            if not isinstance(content, str):
                raise ValueError(f"Unexpected content type: {type(content)}")

            raw_content = content.strip()

            # 去掉可能的 ```json ... ``` 或 ``` ... ``` 代码块包裹
            if raw_content.startswith("```"):
                # 形如 ```json\n{...}\n``` 或 ```\n{...}\n```
                parts = raw_content.split("```")
                # parts[0] == ""，中间部分可能包含语言标记
                if len(parts) >= 3:
                    middle = parts[1]
                    # 去掉语言标记（如 "json\n" 或 "markdown\n"）
                    nl_pos = middle.find("\n")
                    if nl_pos != -1:
                        raw_content = middle[nl_pos + 1 :].strip()
                    else:
                        raw_content = middle.strip()

            # 如果前后有多余文字，尝试从第一个 { 到最后一个 } 截取出 JSON 主体
            if not raw_content.lstrip().startswith("{"):
                start = raw_content.find("{")
                end = raw_content.rfind("}")
                if start != -1 and end != -1 and end > start:
                    raw_content = raw_content[start : end + 1]

            parsed = json.loads(raw_content)

            # 支持两种结构：
            # 1) {"items": [...]}
            # 2) 直接是 [...]
            if isinstance(parsed, dict):
                model_items = parsed.get("items", [])
            else:
                model_items = parsed

            if not isinstance(model_items, list):
                raise ValueError("items is not a list")

            # 从每个片段中解析 $$ 包裹的人名和局部上下文
            raw_items: list[dict] = []
            CONTEXT_WINDOW = 40

            for seg in model_items:
                if isinstance(seg, dict):
                    marked = str(seg.get("marked") or seg.get("text") or "")
                else:
                    marked = str(seg)

                n = len(marked)
                i = 0
                while i < n:
                    start = marked.find("$$", i)
                    if start == -1:
                        break
                    end = marked.find("$$", start + 2)
                    if end == -1:
                        break

                    name = marked[start + 2 : end]
                    if name.strip():
                        before_start = max(0, start - CONTEXT_WINDOW)
                        after_end = min(n, end + 2 + CONTEXT_WINDOW)
                        before_raw = marked[before_start:start]
                        after_raw = marked[end + 2 : after_end]

                        # 去掉上下文中残留的标记符号，增强匹配鲁棒性
                        before_clean = before_raw.replace("$$", "").replace("$", "")
                        after_clean = after_raw.replace("$$", "").replace("$", "")

                        raw_items.append(
                            {
                                "name": name,
                                "before": before_clean,
                                "after": after_clean,
                            }
                        )

                    i = end + 2

            return raw_items
        except Exception as e:  # noqa: BLE001
            # 为了排查问题，打印前一段模型原始输出
            snippet = ""
            try:
                snippet = (raw_content if "raw_content" in locals() else content)[0:400]
            except Exception:  # noqa: BLE001
                snippet = "<unavailable>"
            logging.exception(
                "Error calling API for %s (attempt %d/%d): %s; raw content snippet: %r",
                file_rel,
                attempt,
                RETRY_TIMES,
                e,
                snippet,
            )
            if attempt == RETRY_TIMES:
                raise
            time.sleep(2 * attempt)

    return []


def index_to_line_col(text: str, index: int) -> tuple[int, int]:
    """将文本中的全局下标（0-based）转换为行号和列号。

    行号从 1 开始，列号从 0 开始。
    """
    line = text.count("\n", 0, index) + 1
    last_nl = text.rfind("\n", 0, index)
    col = index if last_nl == -1 else index - last_nl - 1
    return line, col


def locate_mentions(text: str, file_rel: str, raw_items: list[dict]) -> list[dict]:
    """根据模型返回的 before/name/after，在原文中精确定位出现位置。

    匹配策略分两步：
    1. 先尝试用完整的 before + name + after 做精确匹配（尽量复用模型给出的上下文）；
    2. 如果失败，再退化到“软提示”模式：before/after 只使用末尾/开头一小段作为提示，
       在全文里按顺序查找 name，如果提示对不上则继续找下一个；再失败就仅按 name 查找。
    """
    results: list[dict] = []
    search_start = 0

    # 最多使用多少字符作为前后文匹配提示
    HINT_LEN = 20

    for raw in raw_items:
        name = str(raw.get("name", "")).strip()
        before_raw = str(raw.get("before") or "")
        after_raw = str(raw.get("after") or "")

        # 再次确保上下文中没有 $$ 标记，避免影响匹配
        if "$" in before_raw or "$" in after_raw:
            before_raw = before_raw.replace("$$", "").replace("$", "")
            after_raw = after_raw.replace("$$", "").replace("$", "")

        if not name:
            continue

        # ---------- 第一步：尝试用完整 before + name + after 精确匹配 ----------
        pattern = before_raw + name + after_raw
        found_index = -1

        if pattern:
            idx = text.find(pattern, search_start)
            if idx == -1:
                # 如果从当前起点没找到，就从全文再找一遍
                idx = text.find(pattern)

            if idx != -1:
                # pattern 命中时，人物起点是 pattern 中 name 的起始位置
                found_index = idx + len(before_raw)

        # ---------- 第二步：如果精确匹配失败，使用软提示 / 仅按 name 查找 ----------
        if found_index == -1:
            # 只取前后文的一小段作为匹配提示，避免整段不完全一致导致匹配失败
            before_hint = before_raw[-HINT_LEN:]
            after_hint = after_raw[:HINT_LEN]

            idx = search_start

            # 先尝试使用提示信息进行严格匹配
            while True:
                idx = text.find(name, idx)
                if idx == -1:
                    break

                ok = True

                if before_hint:
                    before_in_text = text[max(0, idx - len(before_hint)) : idx]
                    if not before_in_text.endswith(before_hint):
                        ok = False

                if ok and after_hint:
                    after_in_text = text[idx + len(name) : idx + len(name) + len(after_hint)]
                    if not after_in_text.startswith(after_hint):
                        ok = False

                if ok:
                    found_index = idx
                    break

                idx += 1

            # 如果基于前后文依然没找到，就退化为只按 name 顺序查找
            if found_index == -1:
                fallback_idx = text.find(name, search_start)
                if fallback_idx == -1:
                    logging.warning("Cannot locate mention in %s for item %r", file_rel, raw)
                    continue
                found_index = fallback_idx

        global_index = found_index
        line, col = index_to_line_col(text, global_index)

        before_ctx = text[max(0, global_index - 10) : global_index]
        after_ctx = text[global_index + len(name) : global_index + len(name) + 10]

        results.append(
            {
                "file": file_rel.replace("\\", "/"),
                "name": name,
                "index": global_index,
                "line": line,
                "col": col,
                "before": before_ctx,
                "after": after_ctx,
            }
        )

        # 下一次搜索从当前人物提及的结尾之后开始
        search_start = global_index + len(name)

    return results


def load_existing_result(result_path: Path) -> dict[str, Any]:
    """加载已有的 result.json，返回 {meta, items} 结构。"""
    if not result_path.exists():
        return {"meta": {}, "items": []}

    with result_path.open("r", encoding="utf-8") as f:
        data = json.load(f)

    if isinstance(data, dict):
        items = data.get("items", [])
        if not isinstance(items, list):
            items = []
        meta = data.get("meta", {}) or {}
    else:
        items = data if isinstance(data, list) else []
        meta = {}

    return {"meta": meta, "items": items}


def _normalize_rel_from_any_path(raw_path: str, base_dir: Path) -> str | None:
    """将日志行里的路径（绝对或相对）统一转换为相对于 base_dir 的 .md 路径。"""
    p = Path(raw_path)
    if not p.is_absolute():
        full = (base_dir / p).resolve()
    else:
        full = p.resolve()

    if not full.name.endswith(".md"):
        return None

    try:
        rel = full.relative_to(base_dir).as_posix()
    except ValueError:
        # 不在当前目录树下的，直接用文件名
        rel = full.name

    return rel


def parse_retry_files_from_log(log_path: Path, base_dir: Path) -> list[str]:
    """从 log.log 中解析需要重试的文件（包含 ERROR 或 WARNING 的行涉及的 .md 文件）。"""
    if not log_path.exists():
        return []

    content = log_path.read_text(encoding="utf-8", errors="ignore")
    retry_files: set[str] = set()

    # 匹配绝对路径或以 days/ 开头的相对路径
    pattern = re.compile(r"([A-Za-z]:[\\/].*?\.md|days[\\/].*?\.md)")

    for line in content.splitlines():
        if "[ERROR]" not in line and "[WARNING]" not in line:
            continue

        for m in pattern.finditer(line):
            rel = _normalize_rel_from_any_path(m.group(1), base_dir)
            if rel is not None:
                retry_files.add(rel)

    return sorted(retry_files)


def parse_retry_files_from_retry_log(retry_log_path: Path, base_dir: Path) -> list[str]:
    """从 retre_log.log 中解析需要重试的文件（“最近一次” Retry from log 之后 FAILED 的 .md 文件）。"""
    if not retry_log_path.exists():
        return []

    content = retry_log_path.read_text(encoding="utf-8", errors="ignore")
    retry_files: set[str] = set()

    lines = content.splitlines()

    # 只考虑“最近一次 Retry from log.” 之后的 FAILED 记录，避免全量重试
    last_retry_idx = -1
    for idx, line in enumerate(lines):
        if "Retry from log." in line:
            last_retry_idx = idx

    if last_retry_idx != -1:
        iter_lines = lines[last_retry_idx + 1 :]
    else:
        iter_lines = lines

    for line in iter_lines:
        if "FAILED" not in line:
            continue
        # 格式类似：[timestamp] FAILED days/2017-xx-xx.md error=...
        parts = line.split()
        try:
            idx = parts.index("FAILED")
        except ValueError:
            continue
        if idx + 1 >= len(parts):
            continue
        raw_path = parts[idx + 1]
        # 去掉可能的逗号或结尾符号
        raw_path = raw_path.strip().strip(",")
        rel = _normalize_rel_from_any_path(raw_path, base_dir)
        if rel is not None:
            retry_files.add(rel)

    return sorted(retry_files)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Extract name mentions from diary markdown files.")
    group = parser.add_mutually_exclusive_group()
    group.add_argument(
        "--file",
        help="只处理指定的单个文件；可以是绝对路径，也可以是相对于脚本目录或 days 目录的路径。",
    )
    group.add_argument(
        "--retry-failed",
        action="store_true",
        help="根据现有的 log.log 中的 WARNING/ERROR 记录，只重试相关的文件。",
    )
    return parser.parse_args()


def resolve_single_file(base_dir: Path, days_dir: Path, file_arg: str) -> Path | None:
    """根据 --file 参数解析出实际文件路径。"""
    candidate = Path(file_arg)
    if not candidate.is_absolute():
        # 先按相对于脚本所在目录解析
        candidate = base_dir / candidate
        if not candidate.exists():
            # 再尝试相对于 days 目录
            candidate = days_dir / file_arg

    if candidate.exists() and candidate.is_file():
        return candidate

    logging.error("Specified file not found: %s", file_arg)
    return None


def main() -> None:
    args = parse_args()
    setup_logging()

    base_dir = Path(__file__).resolve().parent
    days_dir = base_dir / DAYS_DIR
    result_path = base_dir / RESULT_PATH
    log_path = base_dir / LOG_PATH
    retry_log_path = base_dir / RETRY_LOG_PATH

    logging.info("Start extracting names. days_dir=%s, result=%s", days_dir, result_path)

    if not days_dir.exists():
        logging.error("Days directory not found: %s", days_dir)
        return

    # 确定本次需要处理的文件列表
    files: list[Path] = []
    previous_result: dict[str, Any] | None = None
    previous_items: list[dict] = []

    if args.file:
        # 单文件模式：仅处理指定文件，结果会合并到已有 result.json
        target = resolve_single_file(base_dir, days_dir, args.file)
        if not target:
            return
        files = [target]
        previous_result = load_existing_result(result_path)
        previous_items = list(previous_result["items"])
        logging.info("Single file mode: %s", target)
    elif args.retry_failed:
        # 重试模式：优先从 retre_log.log 中解析 FAILED 文件；
        # 如果没有 FAILED 记录，则回退到从 log.log 中解析含 ERROR/WARNING 的文件。
        retry_rel_paths = parse_retry_files_from_retry_log(retry_log_path, base_dir)
        if not retry_rel_paths:
            retry_rel_paths = parse_retry_files_from_log(log_path, base_dir)

        if not retry_rel_paths:
            logging.info(
                "No FAILED entries in %s and no ERROR/WARNING entries in %s, nothing to retry.",
                retry_log_path,
                log_path,
            )
            return

        files = [base_dir / rel for rel in retry_rel_paths]
        previous_result = load_existing_result(result_path)
        previous_items = list(previous_result["items"])
        logging.info("Retry mode: %d files will be retried based on %s.", len(files), log_path)

        # 记录本次重试计划到 retre_log.log
        try:
            with retry_log_path.open("a", encoding="utf-8") as rf:
                rf.write(
                    f"[{datetime.utcnow().isoformat()}Z] Retry from log. files={retry_rel_paths}\n"
                )
        except Exception:  # noqa: BLE001
            logging.exception("Failed to write retry log %s", retry_log_path)
    else:
        # 全量模式：处理 days 目录下所有 .md 文件，覆盖原有 result.json
        files = sorted(days_dir.glob("*.md"))
        if not files:
            logging.warning("No .md files found in %s", days_dir)
        previous_items = []

    all_items: list[dict] = []
    processed_files: list[str] = []

    for path in files:
        rel = path.relative_to(base_dir).as_posix()
        processed_files.append(rel)
        logging.info("Processing %s", rel)

        try:
            text = path.read_text(encoding="utf-8")
        except Exception as e:  # noqa: BLE001
            logging.exception("Failed to read file %s", rel)
            continue

        try:
            raw_items = call_openai(text, rel)
            located = locate_mentions(text, rel, raw_items)
            logging.info("Found %d mentions in %s", len(located), rel)
            all_items.extend(located)

            # 在重试模式下，将结果附加记录到 retre_log.log，方便还原进度
            if args.retry_failed:
                try:
                    with retry_log_path.open("a", encoding="utf-8") as rf:
                        rf.write(
                            f"[{datetime.utcnow().isoformat()}Z] OK {rel} items={len(located)}\n"
                        )
                except Exception:  # noqa: BLE001
                    logging.exception("Failed to append to retry log %s", retry_log_path)
        except Exception as e:  # noqa: BLE001
            logging.exception("Failed to process file %s", rel)
            if args.retry_failed:
                try:
                    with retry_log_path.open("a", encoding="utf-8") as rf:
                        rf.write(
                            f"[{datetime.utcnow().isoformat()}Z] FAILED {rel} error={e}\n"
                        )
                except Exception:  # noqa: BLE001
                    logging.exception("Failed to append to retry log %s", retry_log_path)
            continue

    # 合并旧结果（单文件模式 / 重试模式）
    if previous_result is not None:
        # 先删除旧结果中这些文件的记录
        processed_set = set(processed_files)
        kept = [item for item in previous_items if item.get("file") not in processed_set]
        all_items = kept + all_items

    result = {
        "meta": {
            "created_at": datetime.utcnow().isoformat() + "Z",
            "base_url": BASE_URL,
            "model": MODEL,
            "temperature": TEMPERATURE,
            "days_dir": DAYS_DIR,
            "mode": (
                "single_file"
                if args.file
                else "retry_failed"
                if args.retry_failed
                else "all"
            ),
        },
        "items": all_items,
    }

    try:
        with result_path.open("w", encoding="utf-8") as f:
            json.dump(result, f, ensure_ascii=False, indent=2)
        logging.info("Saved %d items to %s", len(all_items), result_path)
    except Exception:  # noqa: BLE001
        logging.exception("Failed to write %s", result_path)

if __name__ == "__main__":
    main()
```

用法：

> 正常：`python extract_names.py`
> 重试错误部分：`python extract_names.py --retry-failed`
> 测试单文件：`python extract_names.py --file days/【文件名】`

## 第四步

打开check.html，导入result.json进行检查

check.html
```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <title>日记人名识别检查</title>
</head>
<body>
  <h2>日记人名识别检查（result.json &rarr; result_clean.json）</h2>

  <p>
    1. 点击“选择 result.json 文件”加载识别结果。<br />
    2. 在表格中检查每一条记录，点击“删除”可以去掉识别错误的条目。<br />
    3. 点击“下载 result_clean.json”保存清洗后的结果。<br />
  </p>

  <div>
    <input type="file" id="fileInput" accept=".json" />
    <button id="downloadBtn" disabled>下载 result_clean.json</button>
  </div>

  <p id="summary"></p>

  <table border="1" cellpadding="4" cellspacing="0">
    <thead>
      <tr>
        <th>#</th>
        <th>文件</th>
        <th>行:列</th>
        <th>人名</th>
        <th>前后文（前10 / 人名 / 后10）</th>
        <th>操作</th>
      </tr>
    </thead>
    <tbody id="tableBody"></tbody>
  </table>

  <script>
    let items = [];

    const fileInput = document.getElementById("fileInput");
    const downloadBtn = document.getElementById("downloadBtn");
    const tableBody = document.getElementById("tableBody");
    const summary = document.getElementById("summary");

    fileInput.addEventListener("change", function (event) {
      const file = event.target.files[0];
      if (!file) {
        return;
      }

      const reader = new FileReader();
      reader.onload = function (e) {
        try {
          const text = e.target.result;
          const data = JSON.parse(text);

          // 兼容两种结构：
          // 1) { meta: {...}, items: [...] }
          // 2) 直接是 [...]
          if (Array.isArray(data)) {
            items = data;
          } else if (data && Array.isArray(data.items)) {
            items = data.items;
          } else {
            alert("JSON 格式不符合预期，需要包含 items 数组。");
            return;
          }

          renderTable();
          downloadBtn.disabled = false;
        } catch (err) {
          console.error(err);
          alert("读取或解析 JSON 失败。");
        }
      };
      reader.readAsText(file, "utf-8");
    });

    function renderTable() {
      tableBody.innerHTML = "";

      items.forEach((item, index) => {
        const tr = document.createElement("tr");

        const tdIndex = document.createElement("td");
        tdIndex.textContent = index + 1;
        tr.appendChild(tdIndex);

        const tdFile = document.createElement("td");
        tdFile.textContent = item.file || "";
        tr.appendChild(tdFile);

        const tdPos = document.createElement("td");
        const line = item.line != null ? item.line : "";
        const col = item.col != null ? item.col : "";
        tdPos.textContent = line !== "" || col !== "" ? line + ":" + col : "";
        tr.appendChild(tdPos);

        const tdName = document.createElement("td");
        tdName.textContent = item.name || "";
        tr.appendChild(tdName);

        const tdContext = document.createElement("td");
        const before = item.before || "";
        const after = item.after || "";
        const name = item.name || "";
        tdContext.textContent = before + "【" + name + "】" + after;
        tr.appendChild(tdContext);

        const tdAction = document.createElement("td");
        const btnDelete = document.createElement("button");
        btnDelete.textContent = "删除";
        btnDelete.addEventListener("click", function () {
          if (confirm("确定要删除这一条识别结果吗？")) {
            items.splice(index, 1);
            renderTable();
          }
        });
        tdAction.appendChild(btnDelete);
        tr.appendChild(tdAction);

        tableBody.appendChild(tr);
      });

      summary.textContent = "当前条目数：" + items.length;
    }

    downloadBtn.addEventListener("click", function () {
      // 导出的结构为 { meta: { ... }, items: [...] }
      const output = {
        meta: {
          cleaned_at: new Date().toISOString(),
          count: items.length,
        },
        items: items,
      };

      const blob = new Blob([JSON.stringify(output, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);

      const a = document.createElement("a");
      a.href = url;
      a.download = "result_clean.json";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);

      URL.revokeObjectURL(url);
    });
  </script>
</body>
</html>
```

## 第五步

保存result_cleaned.json到目录

## 第六步

给人名打双链

apply_names.py
```python
import json
import logging
import shutil
from pathlib import Path


# ===== 配置区域：根据自己的情况修改 =====

# 清洗之后的结果文件
RESULT_CLEAN_PATH = "result_clean.json"

# 原始日记所在目录（相对于本脚本所在目录）
DAYS_DIR = "days"

# 输出替换后日记的目录（相对于本脚本所在目录）
OUTPUT_DIR = "days_named"

# 日志文件
LOG_PATH = "log.log"


def setup_logging() -> None:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(message)s",
        handlers=[
            logging.FileHandler(LOG_PATH, encoding="utf-8"),
            logging.StreamHandler(),
        ],
    )


def load_clean_items(path: Path) -> list[dict]:
    if not path.exists():
        raise FileNotFoundError(f"Clean result file not found: {path}")

    with path.open("r", encoding="utf-8") as f:
        data = json.load(f)

    # 兼容两种结构：
    # 1) {"items": [...]}
    # 2) 直接是 [...]
    if isinstance(data, dict) and "items" in data:
        items = data["items"]
    else:
        items = data

    if not isinstance(items, list):
        raise ValueError("Invalid result_clean.json format: items must be a list")

    return items


def group_by_file(items: list[dict]) -> dict[str, list[dict]]:
    """按文件分组，同时保留 index / before / after 等信息。"""
    grouped: dict[str, list[dict]] = {}
    for item in items:
        file_path = item.get("file")
        name = item.get("name")
        index = item.get("index")

        if file_path is None or name is None or index is None:
            continue

        try:
            index_int = int(index)
        except (TypeError, ValueError):
            continue

        grouped.setdefault(file_path, []).append(
            {
                "name": str(name),
                "index": index_int,
                "before": str(item.get("before") or ""),
                "after": str(item.get("after") or ""),
            }
        )

    return grouped


def locate_mention_for_apply(text: str, file_rel: str, item: dict) -> int | None:
    """在替换阶段，根据 name/index/before/after 再次定位人物提及位置。

    目标：只要 extract_names.py 当时能在这个版本的文本里定位成功，
    在文本没有被修改的前提下，这里也应当能找到同一处位置。
    """
    name = item["name"]
    index = int(item["index"])
    before_raw = str(item.get("before") or "")
    after_raw = str(item.get("after") or "")

    name_len = len(name)
    text_len = len(text)

    # 1) 首选：如果索引位置上的文本刚好等于 name，直接使用
    if 0 <= index <= text_len - name_len and text[index : index + name_len] == name:
        return index

    # 2) 退化到与 extract_names 中相同的“软提示 + 顺序查找”逻辑
    HINT_LEN = 20
    before_hint = before_raw[-HINT_LEN:]
    after_hint = after_raw[:HINT_LEN]

    def find_with_hints(start: int, end: int) -> int | None:
        i = start
        while True:
            i = text.find(name, i, end)
            if i == -1:
                return None

            ok = True

            if before_hint:
                before_in_text = text[max(0, i - len(before_hint)) : i]
                if not before_in_text.endswith(before_hint):
                    ok = False

            if ok and after_hint:
                after_in_text = text[i + name_len : i + name_len + len(after_hint)]
                if not after_in_text.startswith(after_hint):
                    ok = False

            if ok:
                return i

            i += 1

    # 2.1 优先在 index 附近搜索（避免多个相同 name 时匹配到别处）
    if 0 <= index < text_len:
        window = 500
        start = max(0, index - window)
        end = min(text_len, index + window)
        pos = find_with_hints(start, end)
        if pos is not None:
            return pos

    # 2.2 全文范围内按“软提示”查找
    pos = find_with_hints(0, text_len)
    if pos is not None:
        return pos

    # 3) 最后兜底：只按 name 查找第一处出现
    any_idx = text.find(name)
    if any_idx != -1:
        logging.warning(
            "Fallback to first occurrence for %r in %s at index %d",
            item,
            file_rel,
            any_idx,
        )
        return any_idx

    # 理论上如果文本未变化，这里不应发生
    logging.error("Name %r not found in %s, cannot replace", name, file_rel)
    return None


def apply_replacements_for_file(
    base_dir: Path,
    file_rel: str,
    replacements: list[dict],
    output_base: Path,
) -> None:
    # 在新目录中的完整副本上进行修改，而不是直接改动原始 days 目录
    src = output_base / Path(file_rel).name

    if not src.exists():
        logging.warning(
            "Copied source file not found in output directory, skip: %s", file_rel
        )
        return

    try:
        text = src.read_text(encoding="utf-8")
    except Exception:  # noqa: BLE001
        logging.exception("Cannot read %s", file_rel)
        return

    # 先为每个条目重新定位在当前文本中的位置
    located: list[tuple[int, str]] = []
    for rep in replacements:
        pos = locate_mention_for_apply(text, file_rel, rep)
        if pos is None:
            continue
        located.append((pos, rep["name"]))

    # 按位置从大到小排序，避免前面的替换影响后面位置
    located.sort(key=lambda x: x[0], reverse=True)

    for idx, name in located:
        text = text[:idx] + f"[[{name}]]" + text[idx + len(name) :]

    # 写回到已经复制好的 days_named 目录（仅保留文件名，不保留原始子目录结构）
    try:
        src.write_text(text, encoding="utf-8")
        logging.info("Wrote %s", src)
    except Exception:  # noqa: BLE001
        logging.exception("Failed to write %s", src)


def copy_all_days_to_output(base_dir: Path, output_base: Path) -> None:
    """先将 days 目录中的所有 .md 文件完整复制到输出目录，再在其上做替换。"""
    days_dir = base_dir / DAYS_DIR
    if not days_dir.exists():
        logging.error("Days directory not found: %s", days_dir)
        return

    output_base.mkdir(parents=True, exist_ok=True)

    for src in days_dir.glob("*.md"):
        dst = output_base / src.name
        try:
            shutil.copy2(src, dst)
            logging.info("Copied %s -> %s", src, dst)
        except Exception:  # noqa: BLE001
            logging.exception("Failed to copy %s to %s", src, dst)


def main() -> None:
    setup_logging()

    base_dir = Path(__file__).resolve().parent
    result_clean_path = base_dir / RESULT_CLEAN_PATH
    output_base = base_dir / OUTPUT_DIR

    # 第一步：先把 days 目录中的所有日记完整复制到输出目录
    logging.info("Copying all diary files from %s to %s", DAYS_DIR, OUTPUT_DIR)
    copy_all_days_to_output(base_dir, output_base)

    logging.info("Loading cleaned results from %s", result_clean_path)

    try:
        items = load_clean_items(result_clean_path)
    except Exception:  # noqa: BLE001
        logging.exception("Failed to load %s", result_clean_path)
        return

    grouped = group_by_file(items)
    logging.info("Loaded %d cleaned items across %d files", len(items), len(grouped))

    for file_rel, replacements in grouped.items():
        logging.info("Applying %d replacements to %s", len(replacements), file_rel)
        apply_replacements_for_file(base_dir, file_rel, replacements, output_base)

    logging.info("All done. Output files are in %s", output_base)


if __name__ == "__main__":
    main()
```

## 第七步

不显示图谱

update_days_named_headers.py
```python
from pathlib import Path
import re


def process_file(path: Path, year: str) -> None:
    """Prepend header and update image paths in a single markdown file."""
    text = path.read_text(encoding="utf-8")

    # Detect if the header is already present (to make the script idempotent).
    lines = text.splitlines(keepends=True)
    has_header = bool(lines) and lines[0].strip() == "exclude-from-graph-view:: true"

    # Update image paths.
    updated = text
    # Standard markdown images: ![alt](images/...)
    updated = updated.replace("](images/", "](../assets/")
    # Obsidian-style embeds: ![[images/...]]
    updated = updated.replace("![[images/", "![[../assets/")

    # Prepend header if missing.
    header = f"exclude-from-graph-view:: true\n" f"tags:: 日记, {year}\n\n- "
    if not has_header:
        updated = header + updated

    if updated != text:
        path.write_text(updated, encoding="utf-8")


def main() -> None:
    base_dir = Path(__file__).resolve().parent
    days_named_dir = base_dir / "days_named"

    md_paths = sorted(days_named_dir.glob("*.md"))
    if not md_paths:
        return

    # 从每日文件名中提取年份（假设类似 2017-07-11.md）
    m = re.match(r"(?P<year>\d{4})", md_paths[0].stem)
    if not m:
        raise ValueError(f"无法从文件名中提取年份: {md_paths[0].name}")
    year = m.group("year")

    # Update each daily note
    for md_path in md_paths:
        process_file(md_path, year)

    # Generate index_<year>.md with one wikilink per line, e.g. [[2017-07-11]]
    index_lines = []
    for md_path in md_paths:
        name_without_ext = md_path.stem  # e.g. "2017-07-11"
        index_lines.append(f"[[{name_without_ext}]]")

    index_content = "\n".join(index_lines) + "\n"
    # Put the index file inside the days_named folder
    (days_named_dir / f"index_{year}.md").write_text(index_content, encoding="utf-8")


if __name__ == "__main__":
    main()
```

## 第八步

md文件导入logseq，images文件放入assets文件夹

## 第九步

在Logseq中使用Ctrl+Shift+I打开控制台，执行以下命令，得到json

```js
(async function exportEnhancedLogseqDB() {
    console.log("正在解析图谱数据，请稍候...");

    // 1. 查询所有页面及其包含的块、以及它们之间的引用关系
    // 我们抓取：页面名、内容、所有的引用(refs)、以及所有的路径属性
    const query = `
        [:find (pull ?e [
            :block/name 
            :block/original-name 
            :block/content 
            :block/uuid
            {:block/refs [:block/name]}
            {:block/_refs [:block/name :block/uuid :block/content]}
            {:block/parent [:block/uuid]}
            {:block/page [:block/name]}
        ])
         :where 
         (or [?e :block/name]           ;; 匹配页面
             [?e :block/content])]      ;; 匹配块
    `;

    const rawData = await window.logseq.api.datascript_query(query);

    if (!rawData || rawData.length === 0) {
        console.error("未能提取到数据。");
        return;
    }

    // 2. 数据清洗与加工
    const processedData = rawData.map(item => {
        const entity = item[0];
        
        // 提取 Linked References (即被哪些块引用了)
        if (entity['_block/refs']) {
            entity['linked_references'] = entity['_block/refs'].map(ref => ({
                from_uuid: ref['block/uuid'],
                content_preview: ref['block/content'],
                from_page: ref['block/page'] ? ref['block/page']['block/name'] : 'unknown'
            }));
            delete entity['_block/refs']; // 清理原始反向引用字段
        }

        // 简化正向引用 (Refs)
        if (entity['block/refs']) {
            entity['outbound_links'] = entity['block/refs'].map(r => r['block/name']);
            delete entity['block/refs'];
        }

        return entity;
    });

    // 3. 导出 JSON
    const blob = new Blob([JSON.stringify(processedData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `logseq_full_graph_${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    console.log("导出完成！包含页面、内容及双向引用关系。");
})();
```

## 第十步

将得到的json重命名为data.json，使用以下html浏览

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <title>Logseq 图谱二次加工可视化</title>
    <script src="https://gw.alipayobjects.com/os/lib/antv/g6/4.8.24/dist/g6.min.js"></script>
    <script src="https://cdn.tailwindcss.com"></script>
    <script src="https://cdn.jsdelivr.net/npm/fuse.js@6.6.2"></script>
    <style>
        #mountNode {
            background: #050816;
            width: 100vw;
            height: 100vh;
        }
        .detail-panel {
            position: fixed;
            right: 0;
            top: 0;
            width: 360px;
            height: 100%;
            background: #020617;
            color: #e5e7eb;
            box-shadow: -2px 0 18px rgba(0,0,0,0.6);
            transform: translateX(100%);
            transition: transform 0.25s ease-out;
            z-index: 10;
            overflow-y: auto;
            border-left: 1px solid rgba(148,163,184,0.3);
        }
        .detail-panel.open {
            transform: translateX(0);
        }
        .detail-panel h2 {
            color: #e5e7eb;
        }
        .detail-panel h3 {
            color: #cbd5f5;
        }
        .detail-panel a {
            color: #60a5fa;
        }
        .detail-panel pre {
            white-space: pre-wrap;
            font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
        }
        .wikilink {
            color: #facc15;
            cursor: pointer;
            text-decoration: underline dotted;
        }
        .wikilink:hover {
            color: #fde68a;
        }
    </style>
</head>
<body class="bg-gray-900">

    <div id="mountNode"></div>

    <!-- 首屏漫游入口：居中的大搜索框 + 随机/全景按钮 -->
    <div id="startOverlay" class="fixed inset-0 z-20 flex items-center justify-center bg-black/70">
        <div class="bg-slate-900/95 border border-slate-700 rounded-xl w-[min(640px,90vw)] p-6 shadow-2xl">
            <h2 class="text-xl font-bold text-slate-100 mb-4">开始探索你的关系图谱</h2>
            <div class="mb-3">
                <input
                    id="startSearchInput"
                    type="text"
                    placeholder="输入名称或别名，搜索一个节点开始漫游…"
                    class="w-full px-4 py-2 rounded-md bg-slate-950 border border-slate-600 text-slate-100 text-sm placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-sky-400 focus:border-sky-400"
                    autocomplete="off"
                />
            </div>
            <ul
                id="startSearchResults"
                class="max-h-60 overflow-y-auto bg-slate-950 border border-slate-700 rounded-md text-xs text-slate-100 shadow-lg hidden mb-3"
            ></ul>
            <div class="flex flex-wrap gap-2 text-[12px] text-slate-200">
                <button id="startRandomBtn" class="px-3 py-1.5 rounded border border-slate-600 bg-slate-900 hover:border-sky-400 hover:text-sky-200">
                    随机选一个节点开始漫游
                </button>
                <button id="startFullBtn" class="px-3 py-1.5 rounded border border-slate-600 bg-slate-900 hover:border-sky-400 hover:text-sky-200">
                    直接查看全景图
                </button>
            </div>
        </div>
    </div>

    <!-- 顶部搜索框 & 漫游模式控制 -->
    <div class="fixed left-4 top-4 z-20 flex flex-col gap-1 max-w-xs">
        <div class="relative">
            <input
                id="searchInput"
                type="text"
                placeholder="搜索名称或别名..."
                class="w-full px-3 py-1.5 rounded-md bg-slate-900/80 border border-slate-600 text-slate-100 text-xs placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-sky-400 focus:border-sky-400"
                autocomplete="off"
            />
        </div>
        <ul
            id="searchResults"
            class="max-h-64 overflow-y-auto bg-slate-900/95 border border-slate-700 rounded-md text-xs text-slate-100 shadow-lg hidden"
        ></ul>
        <div class="flex gap-2 mt-1 text-[11px] text-slate-200">
            <button id="toggleRoam" class="px-2 py-1 rounded border border-slate-600 bg-slate-900/80 hover:border-sky-400 hover:text-sky-200">
                漫游模式：关
            </button>
            <button id="randomRoam" class="px-2 py-1 rounded border border-slate-600 bg-slate-900/80 hover:border-sky-400 hover:text-sky-200">
                随机节点
            </button>
            <button id="resetView" class="px-2 py-1 rounded border border-slate-600 bg-slate-900/80 hover:border-sky-400 hover:text-sky-200">
                复位视图
            </button>
        </div>
    </div>

    <div id="detailPanel" class="detail-panel p-6">
        <button onclick="closePanel()" class="mb-4 text-sm text-sky-400 hover:text-sky-300 transition">
            ← 返回图谱
        </button>
        <h2 id="title" class="text-2xl font-bold mb-1 break-words"></h2>
        <div class="flex items-center justify-between mb-2 text-[11px] text-slate-400">
            <div id="meta" class="flex-1"></div>
            <button id="clearFocus" class="ml-2 px-1.5 py-0.5 rounded border border-slate-600 text-slate-300 hover:text-slate-100 hover:border-slate-300">
                取消聚焦
            </button>
        </div>
        <div class="flex items-center justify-between mb-2 text-[11px] text-slate-400">
            <span>正文</span>
            <button id="enlargeContent" class="px-1.5 py-0.5 rounded border border-slate-600 text-sky-300 hover:text-sky-100 hover:border-sky-400">
                放大阅读
            </button>
        </div>
        <div id="content" class="text-sm text-slate-200 leading-relaxed mb-4 whitespace-pre-wrap"></div>
        <h3 class="font-bold border-t border-slate-700 pt-4 mt-4 text-sm">
            被以下页面引用 (Linked References)
        </h3>
        <ul id="refs" class="list-disc ml-5 mt-2 text-xs text-sky-300 space-y-1"></ul>
        <div id="refDetails" class="mt-3 space-y-2 text-xs text-slate-200"></div>
    </div>

    <!-- 右上角统计信息 -->
    <div id="graphStats" class="fixed right-4 top-4 z-10 text-[11px] text-slate-300 bg-slate-900/80 border border-slate-700 rounded px-3 py-1.5 shadow-lg pointer-events-none">
        节点: - ｜ 孤立节点: - ｜ 边: -
    </div>

    <!-- 正文放大阅读弹层 -->
    <div id="contentModal" class="fixed inset-0 z-30 hidden items-center justify-center bg-black/80">
        <div class="w-[80vw] max-w-5xl max-h-[80vh] bg-slate-900 border border-slate-700 rounded-lg p-4 overflow-y-auto shadow-2xl">
            <div class="flex items-center justify-between mb-3 gap-3">
                <h2 id="modalTitle" class="text-lg font-bold text-slate-100 break-words flex-1"></h2>
                <div class="flex items-center gap-2 text-[11px] text-slate-300">
                    <span class="hidden sm:inline">字号:</span>
                    <button id="fontSmaller" class="px-1.5 py-0.5 border border-slate-600 rounded hover:border-slate-300">A-</button>
                    <button id="fontReset" class="px-1.5 py-0.5 border border-slate-600 rounded hover:border-slate-300">A</button>
                    <button id="fontLarger" class="px-1.5 py-0.5 border border-slate-600 rounded hover:border-slate-300">A+</button>
                    <button id="closeModal" class="ml-2 text-xs text-slate-400 hover:text-slate-100 px-2 py-1 border border-slate-600 rounded">
                        关闭
                    </button>
                </div>
            </div>
            <div id="modalContent" class="text-sm text-slate-200 whitespace-pre-wrap leading-relaxed"></div>
        </div>
    </div>

    <script>
        let globalGraph = null;
        let globalSearchIndex = [];        // 全量索引（不随漫游子图变化）
        let globalFuse = null;             // 全量搜索（不随漫游子图变化）
        let globalNameToId = new Map();    // 规范化名称/别名 -> 节点 id（全量）
        let currentNodeLinkedDetails = []; // 当前侧栏节点的引用详情（按块）
        let globalAdjacency = {};          // id -> Set(邻居)
        let globalCurrentCenterId = null;  // 当前高亮节点 id
        let globalRoamMode = false;        // 当前是否处于漫游模式
        let globalLabelVisibleIds = null;  // 当前需要强制显示标签的节点 id 集合（center + 一层）
        let currentContentHtml = '';       // 当前节点正文的 HTML
        let currentTitleText = '';         // 当前节点标题
        let currentRefPageBlocks = [];     // 当前选中的引用页面下的块列表
        let modalFontScale = 1;            // 放大阅读字号缩放（会从 localStorage 中恢复）
        let roamStarted = false;           // 是否已经从首屏开始了漫游或进入全景
        const isMobile = (typeof window !== 'undefined') && (('ontouchstart' in window) || (navigator.maxTouchPoints > 0));

        const escapeHtml = (str) => String(str || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');

        const renderWikiLinks = (text) => {
            const escaped = escapeHtml(text);
            return escaped.replace(/\[\[([^\]]+?)\]\]/g, (m, p1) => {
                const name = p1.trim();
                if (!name) return m;
                return `<span class="wikilink" data-wikilink="${escapeHtml(name)}">[[${escapeHtml(name)}]]</span>`;
            });
        };

        const normalizeName = (name) => String(name || '').trim().toLowerCase();

        const applyModalFontScale = () => {
            const el = document.getElementById('modalContent');
            if (!el) return;
            const base = 14; // px
            const size = base * modalFontScale;
            const lineHeight = 1.5 + (modalFontScale - 1) * 0.3;
            el.style.fontSize = `${size}px`;
            el.style.lineHeight = `${lineHeight}`;
        };

        // 初始化放大阅读字号（从本地存储恢复）
        (() => {
            try {
                const saved = window.localStorage.getItem('logseq-graph-modal-font-scale');
                if (saved) {
                    const v = parseFloat(saved);
                    if (!Number.isNaN(v) && v > 0.5 && v < 3) {
                        modalFontScale = v;
                    }
                }
            } catch (_) {
                // ignore
            }
        })();

        // 1. 数据转换函数：将 Logseq 导出的 data.json 转换为 G6 所需的 { nodes, edges }
        function transformData(rawData) {
            const nodes = [];
            const edges = [];
            const pagesByName = new Map();   // pageName -> pageObject
            const blocksByUuid = new Map();  // blockUuid -> blockObject（已过滤 exclude-from-graph-view）
            const pageBlocks = new Map();    // pageName -> [blocks]（已过滤 exclude-from-graph-view）

            const aliasToCanonical = new Map(); // aliasName -> canonicalPageName
            const canonicalToAliases = new Map(); // canonicalPageName -> Set(aliases)

            const shouldExcludeBlock = (blk) => {
                if (!blk || typeof blk.content !== 'string') return false;
                return blk.content.includes('exclude-from-graph-view:: true');
            };
            const excludedPages = new Set(); // 含有 exclude-from-graph-view:: true 的页面，不在图谱中展示

            const getCanonicalName = (name) => {
                if (!name) return null;
                const trimmed = String(name).trim();
                return aliasToCanonical.get(trimmed) || trimmed;
            };

            // --- 第 0 遍：先收集 alias:: 关系，建立别名映射（别名 -> 大名称；大名称 -> 全量别名集合） ---
            for (const item of rawData) {
                if (!item || typeof item !== 'object') continue;
                if (!item.content || !item.page || !item.page.name) continue;
                if (shouldExcludeBlock(item)) continue;
                const content = String(item.content);
                const match = content.match(/alias::([^\n\r]+)/);
                if (!match) continue;
                const line = match[1];
                const parts = line.split(/[，,]/).map(s => s.trim()).filter(Boolean);
                if (!parts.length) continue;
                const canonical = String(item.page.name).trim();
                aliasToCanonical.set(canonical, canonical);
                if (!canonicalToAliases.has(canonical)) canonicalToAliases.set(canonical, new Set());
                canonicalToAliases.get(canonical).add(canonical);
                for (const alias of parts) {
                    aliasToCanonical.set(alias, canonical);
                    canonicalToAliases.get(canonical).add(alias);
                }
            }

            // --- 第一遍：分类页面记录与块记录 ---
            for (const item of rawData) {
                if (item && typeof item === 'object') {
                    // 页面节点：有 name / uuid
                    if (item.name && item.uuid) {
                        const rawName = item.name;
                        const pageName = getCanonicalName(rawName);
                        if (!pageName) continue;
                        const existing = pagesByName.get(pageName);
                        if (!existing) {
                            const clone = Object.assign({}, item);
                            clone.name = pageName;
                            pagesByName.set(pageName, clone);
                        } else if (Array.isArray(item._refs)) {
                            existing._refs = (existing._refs || []).concat(item._refs);
                        }
                    }
                    // 块节点：有 content + uuid
                    if (item.content && item.uuid) {
                        const rawPageName = item.page && item.page.name;
                        const pName = getCanonicalName(rawPageName);
                        // 如果某个页面的任意块含有 exclude-from-graph-view:: true，则整页从图谱中隐藏
                        if (shouldExcludeBlock(item) && pName) {
                            excludedPages.add(pName);
                            continue;
                        }
                        if (!shouldExcludeBlock(item)) {
                            blocksByUuid.set(item.uuid, item);
                            if (pName) {
                                if (!pageBlocks.has(pName)) pageBlocks.set(pName, []);
                                pageBlocks.get(pName).push(item);
                            }
                        }
                    }
                }
            }

            // --- 第二遍：为每个页面节点构造 G6 Node（排除含 exclude 标记的页面） ---
            for (const [pageName, page] of pagesByName.entries()) {
                if (excludedPages.has(pageName)) continue;

                // 聚合该页面下的所有块内容，作为正文概要
                const blocks = pageBlocks.get(pageName) || [];
                const combinedContent = blocks
                    .map(b => (b.content || '').trim())
                    .filter(Boolean)
                    .join('\n\n')
                    .trim();

                const displayName = page['original-name'] || page.name || pageName;

                // 使用 _refs 统计被引用的次数（Linked References）
                const backRefBlocks = Array.isArray(page._refs) ? page._refs : [];
                const linkedRefCount = backRefBlocks.length;

                // 通过 _refs 找到“引用它的页面名称”集合
                const linkedFromPagesSet = new Set();
                const linkedRefDetails = [];
                for (const ref of backRefBlocks) {
                    if (!ref || !ref.uuid) continue;
                    const blk = blocksByUuid.get(ref.uuid);
                    if (shouldExcludeBlock(blk)) continue;
                    const rawSrc = blk && blk.page && blk.page.name;
                    const srcPage = getCanonicalName(rawSrc);
                    if (srcPage && srcPage !== pageName) {
                        linkedFromPagesSet.add(srcPage);
                        linkedRefDetails.push({
                            fromPage: srcPage,
                            content: (blk.content || '').trim()
                        });
                    }
                }

                // 根据 Linked References 数量动态调整节点大小（做一下压缩和限制，防止极端过大）
                const minSize = 12;
                const maxSize = 60;
                const baseSize = 18;
                const dynamic = linkedRefCount > 0 ? 6 * Math.log2(linkedRefCount + 1) : 0;
                const size = Math.max(minSize, Math.min(maxSize, baseSize + dynamic));

                const aliasSet = canonicalToAliases.get(pageName) || new Set([pageName]);
                const node = {
                    id: pageName,
                    label: displayName,
                    size,
                    style: {
                        fill: '#020617',
                        stroke: '#38bdf8',
                        lineWidth: 1
                    },
                    mainContent: combinedContent || '(暂无内容)',
                    linkedRefCount,
                    linkedFromPages: Array.from(linkedFromPagesSet),
                    linkedRefDetails,
                    aliases: Array.from(aliasSet)
                };

                nodes.push(node);
            }

            // --- 第三遍：构造边（Edges）---
            const edgeKeySet = new Set();

            // 3.1 通过块的正向引用 refs 构造边： source = 块所在页面; target = 引用的页面
            for (const blk of blocksByUuid.values()) {
                const rawSrc = blk.page && blk.page.name;
                const srcPage = getCanonicalName(rawSrc);
                if (!srcPage || !pagesByName.has(srcPage) || excludedPages.has(srcPage)) continue;

                if (Array.isArray(blk.refs)) {
                    for (const r of blk.refs) {
                        if (!r || typeof r.name !== 'string') continue;
                        const targetPage = getCanonicalName(r.name);
                        if (!targetPage || !pagesByName.has(targetPage) || targetPage === srcPage || excludedPages.has(targetPage)) continue;
                        const key = srcPage + '-->' + targetPage;
                        if (!edgeKeySet.has(key)) {
                            edgeKeySet.add(key);
                            edges.push({
                                source: srcPage,
                                target: targetPage
                            });
                        }
                    }
                }
            }

            // 3.2 再通过页面的反向引用 _refs 确保边完整： source = 引用它的页面; target = 当前页面
            for (const [pageName, page] of pagesByName.entries()) {
                if (excludedPages.has(pageName)) continue;
                const backRefBlocks = Array.isArray(page._refs) ? page._refs : [];
                for (const ref of backRefBlocks) {
                    if (!ref || !ref.uuid) continue;
                    const blk = blocksByUuid.get(ref.uuid);
                    if (shouldExcludeBlock(blk)) continue;
                    const rawSrc = blk && blk.page && blk.page.name;
                    const srcPage = getCanonicalName(rawSrc);
                    if (!srcPage || !pagesByName.has(srcPage) || srcPage === pageName || excludedPages.has(srcPage)) continue;
                    const key = srcPage + '-->' + pageName;
                    if (!edgeKeySet.has(key)) {
                        edgeKeySet.add(key);
                            edges.push({
                            source: srcPage,
                            target: pageName
                        });
                    }
                }
            }

            // 3.3 隐藏页面桥接：若某个被隐藏页面的单个块同时 refs 多个可见页面，则这些页面两两连边
            for (const blk of blocksByUuid.values()) {
                const rawSrc = blk.page && blk.page.name;
                const srcPage = getCanonicalName(rawSrc);
                if (!srcPage || !excludedPages.has(srcPage)) continue;
                if (!Array.isArray(blk.refs)) continue;

                const targetsSet = new Set();
                for (const r of blk.refs) {
                    if (!r || typeof r.name !== 'string') continue;
                    const t = getCanonicalName(r.name);
                    if (!t || excludedPages.has(t) || !pagesByName.has(t)) continue;
                    targetsSet.add(t);
                }
                const arr = Array.from(targetsSet);
                for (let i = 0; i < arr.length; i++) {
                    for (let j = i + 1; j < arr.length; j++) {
                        const a = arr[i];
                        const b = arr[j];
                        if (a === b) continue;
                        const key1 = a + '-->' + b;
                        const key2 = b + '-->' + a;
                        if (!edgeKeySet.has(key1) && !edgeKeySet.has(key2)) {
                            edgeKeySet.add(key1);
                            edges.push({
                                source: a,
                                target: b
                            });
                        }
                    }
                }
            }

            return { nodes, edges };
        }

        // 2. 初始化图谱
        async function renderGraph() {
            let rawData = [];
            try {
                const resp = await fetch('data.json');
                rawData = await resp.json();
            } catch (e) {
                console.error('读取 data.json 失败：', e);
                alert('无法加载 data.json，请确保 index.html 与 data.json 位于同一目录，且通过本地静态服务器打开。');
                return;
            }

            const data = transformData(rawData || []);

            const graph = new G6.Graph({
                container: 'mountNode',
                width: window.innerWidth,
                height: window.innerHeight,
                layout: {
                    type: 'force',
                    preventOverlap: true,
                    linkDistance: 170,
                    nodeStrength: -320,
                    edgeStrength: 0.12,
                    collideStrength: 1.3,
                    alphaDecay: 0.03,
                    animate: true // 恢复“弹弹弹”的动态布局效果
                },
                modes: {
                    // 桌面：画布拖拽 + 缩放 + 节点拖拽；移动端：仅缩放，拖拽/点按由自定义触摸逻辑处理
                    default: isMobile
                        ? ['zoom-canvas']
                        : ['drag-canvas', 'zoom-canvas', 'drag-node'],
                },
                defaultNode: {
                    labelCfg: {
                        style: {
                            fill: '#e5e7eb',
                            fontSize: 11,
                            fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
                            opacity: 1
                        }
                    }
                },
                defaultEdge: {
                    style: {
                        stroke: '#475569',
                        lineWidth: 0.6,
                        opacity: 0.35
                    }
                },
                nodeStateStyles: {
                    highlight: {
                        opacity: 1,
                        stroke: '#38bdf8',
                        lineWidth: 2,
                        fill: '#020617'
                    },
                    center: {
                        opacity: 1,
                        stroke: '#f97316',
                        lineWidth: 3,
                        fill: '#020617'
                    },
                    inactive: {
                        opacity: 0.15
                    }
                },
                edgeStateStyles: {
                    highlight: {
                        stroke: '#38bdf8',
                        lineWidth: 1.1,
                        opacity: 0.8
                },
                    inactive: {
                        opacity: 0.05
                    }
                }
            });

            // 初始不渲染完整图（避免占用过多内存/GPU），先渲染空画布；
            // 真正开始漫游（搜索/随机）或切到全景时再用 changeData 渲染子图/全图。
            graph.data({ nodes: [], edges: [] });
            graph.render();

            globalGraph = graph;
            // 全量搜索索引（不随漫游子图变化），确保在引用正文里点 [[双括号]] 时始终能解析到节点
            globalSearchIndex = data.nodes.map(n => ({
                id: n.id,
                label: n.label || n.id,
                aliases: Array.isArray(n.aliases) ? n.aliases.join(' ') : ''
            }));

            if (window.Fuse) {
                globalFuse = new Fuse(globalSearchIndex, {
                    threshold: 0.3,
                    keys: ['label', 'aliases']
                });
            }

            // 全量名称/别名 -> id 映射
            globalNameToId = new Map();
            data.nodes.forEach(n => {
                const id = n.id;
                globalNameToId.set(normalizeName(id), id);
                if (n.label) globalNameToId.set(normalizeName(n.label), id);
                if (Array.isArray(n.aliases)) {
                    n.aliases.forEach(a => globalNameToId.set(normalizeName(a), id));
                }
            });

            // 建立邻接表，用于高亮与漫游模式，并统计节点/边数量以及孤立节点数
            globalAdjacency = {};
            data.edges.forEach(e => {
                if (!globalAdjacency[e.source]) globalAdjacency[e.source] = new Set();
                if (!globalAdjacency[e.target]) globalAdjacency[e.target] = new Set();
                globalAdjacency[e.source].add(e.target);
                globalAdjacency[e.target].add(e.source);
            });

            // 统计信息
            const degreeMap = new Map();
            data.nodes.forEach(n => degreeMap.set(n.id, 0));
            data.edges.forEach(e => {
                if (degreeMap.has(e.source)) degreeMap.set(e.source, degreeMap.get(e.source) + 1);
                if (degreeMap.has(e.target)) degreeMap.set(e.target, degreeMap.get(e.target) + 1);
            });
            let isolatedCount = 0;
            degreeMap.forEach(v => {
                if (v === 0) isolatedCount += 1;
            });
            const statsEl = document.getElementById('graphStats');
            if (statsEl) {
                statsEl.textContent = `节点: ${data.nodes.length} ｜ 孤立节点: ${isolatedCount} ｜ 边: ${data.edges.length}`;
            }

            let roamMode = false;
            let roamVisibleIds = null; // Set<string> 当前漫游模式下可见节点

            // 自适应窗口大小变化
            window.addEventListener('resize', () => {
                if (!graph || graph.get('destroyed')) return;
                graph.changeSize(window.innerWidth, window.innerHeight);
            });

            // 画布拖拽完全交由内置 'drag-canvas' 行为处理

            // 远景缩小时隐藏标签，避免文字过密；若有高亮中心，则仅显示中心及一层节点标签
            const updateLabelVisibility = (zoom) => {
                const nodes = graph.getNodes();
                const hasHighlight = globalLabelVisibleIds && globalLabelVisibleIds.size > 0;
                const showByZoom = zoom >= 0.7;
                nodes.forEach(node => {
                    const model = node.getModel();
                    const id = node.getID();
                    let visible = showByZoom;
                    if (hasHighlight) {
                        visible = globalLabelVisibleIds.has(id);
                    }
                    graph.updateItem(node, {
                        labelCfg: {
                            style: Object.assign({}, model.labelCfg && model.labelCfg.style, {
                                opacity: visible ? 1 : 0
                            })
                        }
                    });
                });
            };

            graph.on('viewportchange', (e) => {
                const zoom = e.matrix[0];
                updateLabelVisibility(zoom);
            });

            const resetHighlight = () => {
                if (!graph) return;
                graph.getNodes().forEach(n => graph.clearItemStates(n));
                graph.getEdges().forEach(e => graph.clearItemStates(e));
                globalCurrentCenterId = null;
                globalLabelVisibleIds = null;
                // 恢复为仅按缩放控制标签
                updateLabelVisibility(graph.getZoom());
            };
            // 提供给全局点击“取消聚焦”使用
            window.resetGraphHighlight = resetHighlight;

            const applyHighlight = (centerId) => {
                if (!graph || !globalAdjacency || !centerId) return;
                resetHighlight();

                // 先拿到中心节点 3 层以内的距离映射
                const MAX_DEPTH = 3;
                const dist = (() => {
                    const d = new Map();
                    if (!globalAdjacency[centerId]) return d;
                    d.set(centerId, 0);
                    const queue = [centerId];
                    while (queue.length) {
                        const id = queue.shift();
                        const cur = d.get(id);
                        if (cur >= MAX_DEPTH) continue;
                        const neighbors = globalAdjacency[id] || new Set();
                        neighbors.forEach(n => {
                            if (!d.has(n)) {
                                d.set(n, cur + 1);
                                queue.push(n);
                            }
                        });
                    }
                    return d;
                })();
                if (!dist.size) return;

                // 初始只取一层（中心 + 1 层）
                let visited = new Set([centerId]);
                dist.forEach((v, id) => {
                    if (v === 1) visited.add(id);
                });

                // 若其中有在当前高亮子图中“度为 0”的点，则尽量补进其二/三层邻居
                const computeDegreesInSet = (set) => {
                    const degree = new Map();
                    set.forEach(id => degree.set(id, 0));
                    const allEdges = graph.getEdges().map(e => e.getModel());
                    allEdges.forEach(m => {
                        if (set.has(m.source) && set.has(m.target)) {
                            degree.set(m.source, (degree.get(m.source) || 0) + 1);
                            degree.set(m.target, (degree.get(m.target) || 0) + 1);
                        }
                    });
                    return degree;
                };

                for (let iter = 0; iter < 2; iter++) { // 最多补两轮
                    const degree = computeDegreesInSet(visited);
                    const toAdd = new Set();
                    visited.forEach(id => {
                        if ((degree.get(id) || 0) > 0) return;
                        const d = dist.get(id);
                        if (d == null || d >= MAX_DEPTH) return;
                        const neighbors = globalAdjacency[id] || new Set();
                        neighbors.forEach(n => {
                            const dn = dist.get(n);
                            if (dn != null && dn <= MAX_DEPTH && !visited.has(n)) {
                                toAdd.add(n);
                            }
                        });
                    });
                    if (!toAdd.size) break;
                    toAdd.forEach(id => visited.add(id));
                }

                const nodes = graph.getNodes();
                const edges = graph.getEdges();

                nodes.forEach(n => graph.clearItemStates(n));
                edges.forEach(e => graph.clearItemStates(e));

                nodes.forEach(n => {
                    const id = n.getID();
                    if (visited.has(id)) {
                        graph.setItemState(n, 'highlight', true);
                        if (id === centerId) {
                            graph.setItemState(n, 'center', true);
                        }
                    } else {
                        graph.setItemState(n, 'inactive', true);
                    }
                });

                edges.forEach(e => {
                    const m = e.getModel();
                    const inSet = visited.has(m.source) && visited.has(m.target);
                    graph.setItemState(e, inSet ? 'highlight' : 'inactive', true);
                });

                // 高亮时：仅中心及其“尽量消孤立后”的邻域显示标签
                globalLabelVisibleIds = visited;
                updateLabelVisibility(graph.getZoom());
            };

            const showNodeDetail = (nodeItem) => {
                const model = nodeItem.getModel();
                globalCurrentCenterId = model.id;

                const panel = document.getElementById('detailPanel');
                document.getElementById('title').innerText = model.label;
                currentTitleText = model.label;

                const meta = [];
                if (Array.isArray(model.aliases) && model.aliases.length > 1) {
                    meta.push(`别名：${model.aliases.join(' / ')}`);
                }
                if (typeof model.linkedRefCount === 'number') {
                    meta.push(`被引用块数：${model.linkedRefCount}`);
                }
                document.getElementById('meta').innerText = meta.join('  ·  ');
                currentContentHtml = renderWikiLinks(model.mainContent || '');
                document.getElementById('content').innerHTML = currentContentHtml;
                
                const fromPages = Array.isArray(model.linkedFromPages) ? model.linkedFromPages : [];
                const refsHtml = fromPages
                    .map(name => `<li class="cursor-pointer hover:text-sky-200" data-ref-page="${name}">${name}</li>`)
                    .join('');
                document.getElementById('refs').innerHTML = refsHtml || '<li class="text-slate-500">无引用页面</li>';

                const detailContainer = document.getElementById('refDetails');
                const details = Array.isArray(model.linkedRefDetails) ? model.linkedRefDetails : [];
                currentNodeLinkedDetails = details;
                if (details.length) {
                    detailContainer.innerHTML = '<div class="text-slate-400">点击上方某个页面名，在该行下方展开对应引用块内容。</div>';
                } else {
                    detailContainer.innerHTML = '<div class="text-slate-500">无引用详情</div>';
                }
                
                panel.classList.add('open');
                applyHighlight(model.id);
            };

            const applyRoamFromNode = (centerId, append) => {
                if (!centerId) return;
                let visible = append && roamVisibleIds ? new Set(roamVisibleIds) : new Set();
                visible.add(centerId);

                roamVisibleIds = visible;
                const subNodes = data.nodes.filter(n => visible.has(n.id));
                const subEdges = data.edges.filter(e => visible.has(e.source) && visible.has(e.target));
                graph.changeData({ nodes: subNodes, edges: subEdges });

                // 复位视图，让当前漫游子图居中显示
                fitViewToNodeIds(Array.from(visible));

                const item = graph.findById(centerId);
                if (item) {
                    showNodeDetail(item);
                }

                // 首次漫游时隐藏首屏覆盖层
                if (!roamStarted && startOverlay) {
                    roamStarted = true;
                    startOverlay.classList.add('hidden');
                }
            };

            const roamButton = document.getElementById('toggleRoam');
            const randomButton = document.getElementById('randomRoam');
            const resetButton = document.getElementById('resetView');
            const startOverlay = document.getElementById('startOverlay');
            const startRandomBtn = document.getElementById('startRandomBtn');
            const startFullBtn = document.getElementById('startFullBtn');

            const fitViewToNodeIds = (ids) => {
                const items = ids
                    .map(id => graph.findById(id))
                    .filter(Boolean);
                if (!items.length) {
                    graph.fitView(20);
                    return;
                }
                let minX = Infinity, minY = Infinity;
                let maxX = -Infinity, maxY = -Infinity;
                items.forEach(node => {
                    const m = node.getModel();
                    const x = m.x || 0;
                    const y = m.y || 0;
                    if (x < minX) minX = x;
                    if (y < minY) minY = y;
                    if (x > maxX) maxX = x;
                    if (y > maxY) maxY = y;
                });
                const width = graph.get('width');
                const height = graph.get('height');
                const cx = (minX + maxX) / 2;
                const cy = (minY + maxY) / 2;
                const size = Math.max(maxX - minX, maxY - minY, 10);
                const scale = Math.min(width, height) / (size * 2.2);

                const canvasCenter = { x: width / 2, y: height / 2 };
                const centerCanvasPoint = graph.getCanvasByPoint(cx, cy);
                graph.translate(canvasCenter.x - centerCanvasPoint.x, canvasCenter.y - centerCanvasPoint.y);
                graph.zoomTo(scale, canvasCenter);
            };

            const resetView = () => {
                if (!graph) return;
                // 若当前有聚焦节点，则以该节点及其一层节点为中心复位；否则对当前子图做整体 fitView
                if (globalCurrentCenterId && globalAdjacency[globalCurrentCenterId]) {
                    const ids = new Set([globalCurrentCenterId]);
                    (globalAdjacency[globalCurrentCenterId] || new Set()).forEach(n => ids.add(n));
                    fitViewToNodeIds(Array.from(ids));
                } else {
                    graph.fitView(20);
                }
            };

            const beginRoamAtNode = (id) => {
                if (!id) return;
                setRoamMode(true);
                applyRoamFromNode(id, false);
                // 等当前子图布局完成后，再做一次视图复位，体验等同于手动点击“复位视图”
                graph.once('afterlayout', () => {
                    resetView();
                });
            };
            // 暴露给全局事件处理使用（首屏搜索、其它全局逻辑）
            window.beginRoamAtNode = beginRoamAtNode;

            const setRoamMode = (on) => {
                roamMode = on;
                globalRoamMode = on;
                if (roamButton) {
                    // 默认漫游；点击按钮切全景
                    roamButton.textContent = on ? '切换到全景' : '切换到漫游';
                }
                if (!on) {
                    roamVisibleIds = null;
                    graph.changeData(data);
                    globalSearchIndex = data.nodes.map(n => ({
                        id: n.id,
                        label: n.label || n.id,
                        aliases: Array.isArray(n.aliases) ? n.aliases.join(' ') : ''
                    }));
                    if (window.Fuse) {
                        globalFuse = new Fuse(globalSearchIndex, {
                            threshold: 0.3,
                            keys: ['label', 'aliases']
                        });
                    }
                    resetHighlight();
                }
            };

            if (roamButton) {
                roamButton.addEventListener('click', () => {
                    // 在首屏没开始前，先隐藏覆盖层
                    if (!roamStarted && startOverlay) {
                        roamStarted = true;
                        startOverlay.classList.add('hidden');
                    }
                    setRoamMode(!roamMode);
                });
            }

            if (randomButton) {
                randomButton.addEventListener('click', () => {
                    if (!data.nodes.length) return;
                    const candidates = data.nodes.filter(n => globalAdjacency[n.id] && globalAdjacency[n.id].size > 0);
                    if (!candidates.length) return;
                    const picked = candidates[Math.floor(Math.random() * candidates.length)];
                    beginRoamAtNode(picked.id);
                });
            }

            if (startRandomBtn) {
                startRandomBtn.addEventListener('click', () => {
                    if (!data.nodes.length) return;
                    const candidates = data.nodes.filter(n => globalAdjacency[n.id] && globalAdjacency[n.id].size > 0);
                    if (!candidates.length) return;
                    const picked = candidates[Math.floor(Math.random() * candidates.length)];
                    beginRoamAtNode(picked.id);
                });
            }

            if (startFullBtn) {
                startFullBtn.addEventListener('click', () => {
                    roamStarted = true;
                    if (startOverlay) startOverlay.classList.add('hidden');
                    setRoamMode(false);
                    resetHighlight();
                    resetView();
                });
            }

            if (resetButton) {
                resetButton.addEventListener('click', resetView);
            }

            // 3. 点击交互：展开详细信息 + 高亮关系 / 漫游扩展
            const handleNodeTapOrClick = (e) => {
                const item = e.item;
                if (!item) return;
                const id = item.getID();

                // 再次点击同一聚焦节点：取消聚焦 / 高亮
                if (globalCurrentCenterId === id) {
                    resetHighlight();
                    return;
                }

                if (roamMode) {
                    // 漫游模式下，点击图中的节点只切换详情，不扩展子图
                    graph.focusItem(item, true);
                    showNodeDetail(item);
                } else {
                    graph.focusItem(item, true);
                    showNodeDetail(item);
                }
            };

            graph.on('node:click', handleNodeTapOrClick);

            // 移动端：自定义 touch 逻辑，区分“点按聚焦”和“拖动画布”
            if (isMobile) {
                let touchState = null; // { type: 'node' | 'canvas', id?, x, y, time }
                const TAP_DISTANCE = 8; // px
                const TAP_DURATION = 300; // ms

                const startTouch = (type) => (e) => {
                    const id = type === 'node' && e.item ? e.item.getID() : null;
                    touchState = {
                        type,
                        id,
                        x: e.x,
                        y: e.y,
                        time: Date.now(),
                        lastX: e.x,
                        lastY: e.y
                    };
                };

                const moveTouch = (e) => {
                    if (!touchState) return;
                    const dx = e.x - touchState.lastX;
                    const dy = e.y - touchState.lastY;
                    // 只要有明显移动，就当作拖动画布
                    graph.translate(dx, dy);
                    touchState.lastX = e.x;
                    touchState.lastY = e.y;
                };

                const endTouch = (type) => (e) => {
                    if (!touchState || touchState.type !== type) {
                        touchState = null;
                        return;
                    }
                    const dx = e.x - touchState.x;
                    const dy = e.y - touchState.y;
                    const dist = Math.hypot(dx, dy);
                    const dt = Date.now() - touchState.time;

                    // 轻触在节点上：视为点击聚焦
                    if (type === 'node' && dist < TAP_DISTANCE && dt < TAP_DURATION) {
                        handleNodeTapOrClick(e);
                    }
                    touchState = null;
                };

                // 在节点上按下/移动/抬起
                graph.on('node:touchstart', startTouch('node'));
                graph.on('node:touchmove', moveTouch);
                graph.on('node:touchend', endTouch('node'));

                // 在画布空白处按下/移动/抬起（仅用于拖动画布）
                graph.on('canvas:touchstart', startTouch('canvas'));
                graph.on('canvas:touchmove', moveTouch);
                graph.on('canvas:touchend', () => { touchState = null; });
            }

            // 点击画布空白处，清除高亮
            // 画布点击仅用于拖拽，不再取消聚焦 / 高亮，防止误触
            graph.on('canvas:click', () => {});

            // 暴露一个给搜索 / wikilink 使用的打开节点函数
            window.__openNodeById = (id) => {
                if (!graph) return;
                if (roamMode) {
                    applyRoamFromNode(id, true);
                } else {
                    const item = graph.findById(id);
                    if (!item) return;
                    graph.focusItem(item, true);
                    showNodeDetail(item);
                }
            };

            // 初始进入页面默认处于漫游模式，由首屏覆盖层引导用户选择“搜索节点开始 / 随机节点 / 全景图”
            setRoamMode(true);
        }

        function closePanel() {
            document.getElementById('detailPanel').classList.remove('open');
        }

        // 点击具体引用页面，展开该页面下的引用块详情（在对应行下面）
        document.addEventListener('click', (e) => {
            const li = e.target.closest('#refs li[data-ref-page]');
            if (!li) return;
            const pageName = li.getAttribute('data-ref-page');
            const related = (currentNodeLinkedDetails || []).filter(d => d.fromPage === pageName);
            currentRefPageBlocks = related;
            let detailBox = li.querySelector('.ref-detail-box');
            if (!detailBox) {
                detailBox = document.createElement('div');
                detailBox.className = 'ref-detail-box mt-1 space-y-2';
                li.appendChild(detailBox);
            }
            if (!related.length) {
                detailBox.innerHTML = `<div class="text-slate-500">该页面的引用块暂无可展示内容（可能被过滤）。</div>`;
                return;
            }
            const open = detailBox.dataset.open === 'true';
            if (open) {
                detailBox.dataset.open = 'false';
                detailBox.innerHTML = '';
                return;
            }
            detailBox.dataset.open = 'true';
            detailBox.innerHTML = related.map((d, idx) => `
                <div class="border border-slate-700/60 rounded-md px-2 py-1.5">
                    <div class="flex items-center justify-between mb-1">
                        <div class="text-[11px] text-sky-300">${escapeHtml(d.fromPage || '未知页面')}</div>
                        <button class="ref-enlarge text-[11px] text-sky-300 hover:text-sky-100 px-1.5 py-0.5 border border-slate-600 rounded" data-ref-index="${idx}">
                            放大阅读
                        </button>
                    </div>
                    <pre class="text-[11px] text-slate-200 bg-slate-900/40 rounded-sm px-1 py-1 max-h-40 overflow-y-auto">${renderWikiLinks(d.content || '')}</pre>
                </div>
            `).join('');
        });

        // 简单搜索交互（左上角）
        document.addEventListener('input', (e) => {
            if (e.target && e.target.id === 'searchInput') {
                const value = e.target.value.trim();
                const list = document.getElementById('searchResults');
                if (!value || !globalFuse) {
                    list.innerHTML = '';
                    list.classList.add('hidden');
                    return;
                }
                const results = globalFuse.search(value, { limit: 12 });
                if (!results.length) {
                    list.innerHTML = '<li class="px-3 py-1.5 text-slate-500">无匹配结果</li>';
                    list.classList.remove('hidden');
                    return;
                }
                list.innerHTML = results.map(r => {
                    const d = r.item;
                    const aliasText = d.aliases ? `（${d.aliases}）` : '';
                    return `<li data-node-id="${d.id}" class="px-3 py-1.5 hover:bg-slate-800 cursor-pointer">${d.label}${aliasText}</li>`;
                }).join('');
                list.classList.remove('hidden');
            }
        });

        document.addEventListener('click', (e) => {
            const li = e.target.closest('#searchResults li');
            if (li && globalGraph) {
                const id = li.getAttribute('data-node-id');
                if (window.__openNodeById) {
                    window.__openNodeById(id);
                }
                document.getElementById('searchResults').classList.add('hidden');
            }
        });

        // 首屏大搜索框交互
        document.addEventListener('input', (e) => {
            if (e.target && e.target.id === 'startSearchInput') {
                const value = e.target.value.trim();
                const list = document.getElementById('startSearchResults');
                if (!value || !globalFuse) {
                    list.innerHTML = '';
                    list.classList.add('hidden');
                    return;
                }
                const results = globalFuse.search(value, { limit: 12 });
                if (!results.length) {
                    list.innerHTML = '<li class="px-4 py-1.5 text-slate-500">无匹配结果</li>';
                    list.classList.remove('hidden');
                    return;
                }
                list.innerHTML = results.map(r => {
                    const d = r.item;
                    const aliasText = d.aliases ? `（${d.aliases}）` : '';
                    return `<li data-node-id="${d.id}" class="px-4 py-1.5 hover:bg-slate-800 cursor-pointer">${d.label}${aliasText}</li>`;
                }).join('');
                list.classList.remove('hidden');
            }
        });

        document.addEventListener('click', (e) => {
            const li = e.target.closest('#startSearchResults li');
            if (li && globalGraph) {
                const id = li.getAttribute('data-node-id');
                roamStarted = true;
                const overlay = document.getElementById('startOverlay');
                if (overlay) overlay.classList.add('hidden');
                if (window.beginRoamAtNode) {
                    window.beginRoamAtNode(id);
                }
                document.getElementById('startSearchResults').classList.add('hidden');
            }
        });

        // 点击 [[wiki]] 链接，跳转到对应节点
        document.addEventListener('click', (e) => {
            const span = e.target.closest('.wikilink[data-wikilink]');
            if (!span || !globalGraph) return;
            const name = span.getAttribute('data-wikilink');
            const candidateId = globalNameToId.get(normalizeName(name)) || name;
            if (window.__openNodeById) {
                window.__openNodeById(candidateId);
            }
        });

        // 放大 / 关闭正文阅读弹层
        document.addEventListener('click', (e) => {
            const modal = document.getElementById('contentModal');
            if (e.target && e.target.id === 'enlargeContent') {
                if (!currentContentHtml) return;
                document.getElementById('modalTitle').innerText = currentTitleText || '';
                document.getElementById('modalContent').innerHTML = currentContentHtml;
                applyModalFontScale();
                modal.classList.remove('hidden');
                modal.classList.add('flex');
                return;
            }
            const refBtn = e.target.closest('.ref-enlarge[data-ref-index]');
            if (refBtn) {
                const idx = parseInt(refBtn.getAttribute('data-ref-index'), 10);
                const block = (currentRefPageBlocks || [])[idx];
                if (!block) return;
                document.getElementById('modalTitle').innerText = `${block.fromPage || '引用页面'} · 引用块`;
                document.getElementById('modalContent').innerHTML = renderWikiLinks(block.content || '');
                applyModalFontScale();
                modal.classList.remove('hidden');
                modal.classList.add('flex');
                return;
            }
            if (e.target && (e.target.id === 'closeModal' || e.target.id === 'contentModal')) {
                modal.classList.add('hidden');
                modal.classList.remove('flex');
                return;
            }

            if (e.target && e.target.id === 'fontSmaller') {
                modalFontScale = Math.max(0.7, modalFontScale - 0.1);
                try {
                    window.localStorage.setItem('logseq-graph-modal-font-scale', String(modalFontScale));
                } catch (_) {}
                applyModalFontScale();
                return;
            }
            if (e.target && e.target.id === 'fontLarger') {
                modalFontScale = Math.min(2.0, modalFontScale + 0.1);
                try {
                    window.localStorage.setItem('logseq-graph-modal-font-scale', String(modalFontScale));
                } catch (_) {}
                applyModalFontScale();
                return;
            }
            if (e.target && e.target.id === 'fontReset') {
                modalFontScale = 1;
                try {
                    window.localStorage.setItem('logseq-graph-modal-font-scale', String(modalFontScale));
                } catch (_) {}
                applyModalFontScale();
                return;
            }

            if (e.target && e.target.id === 'clearFocus') {
                // 重置高亮/聚焦状态，并收起详情面板
                if (window.resetGraphHighlight) {
                    window.resetGraphHighlight();
                }
                const panel = document.getElementById('detailPanel');
                if (panel) panel.classList.remove('open');
            }
        });

        renderGraph();
    </script>
</body>
</html>
```