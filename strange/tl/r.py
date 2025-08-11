import json
import re
import os

def markdown_to_json(file_path):
    """
    读取Markdown文件，将其内容转换为JSON格式，并保存为新文件。
    
    Args:
        file_path (str): Markdown文件的路径。
    
    Returns:
        bool: 如果成功转换并保存，返回True；否则返回False。
    """
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            markdown_content = f.read()
    except FileNotFoundError:
        print(f"错误：文件未找到，请确保 {file_path} 存在。")
        return False
    except Exception as e:
        print(f"读取文件时发生错误: {e}")
        return False

    history_data = []
    
    # 标准化换行符，处理不同操作系统的换行符格式
    normalized_markdown = markdown_content.replace('\r\n', '\n').replace('\r', '\n')
    
    # 按双换行符分割成块
    blocks = normalized_markdown.strip().split('\n\n')
    
    for block in blocks:
        block_lines = block.strip().split('\n')
        
        if len(block_lines) >= 2:
            year_line = block_lines[0]
            event_text = '\n'.join(block_lines[1:])
            
            # 使用正则表达式匹配年份和年号
            year_match = re.match(r'公元前?(\d+)年(?:（(.+?)）)?', year_line)
            
            if year_match:
                year_str = year_match.group(1)
                reign_year = year_match.group(2) if year_match.group(2) else ""
                is_bc = '公元前' in year_line
                
                # 将公元前年份转换为负数
                year = -int(year_str) if is_bc else int(year_str)
                
                item = {
                    "year": year,
                    "displayYear": year_line,
                    "reignYear": reign_year,
                    "event": event_text.strip()
                }
                history_data.append(item)
    
    # 按年份对数据进行排序
    sorted_data = sorted(history_data, key=lambda x: x['year'])
    
    # 构建输出文件名
    base_name = os.path.splitext(file_path)[0]
    output_file_path = f"{base_name}.json"

    try:
        with open(output_file_path, 'w', encoding='utf-8') as f:
            json.dump(sorted_data, f, ensure_ascii=False, indent=2)
        print(f"成功转换并保存文件至 {output_file_path}")
        return True
    except Exception as e:
        print(f"写入文件时发生错误: {e}")
        return False

# --- 如何使用 ---
if __name__ == "__main__":
    # 假设你的markdown文件名为 'data.md'
    markdown_file = 'data.md'
    
    # 检查文件是否存在，如果不存在则创建一个示例文件
    if not os.path.exists(markdown_file):
        print(f"未找到 {markdown_file}，正在创建示例文件...")
        sample_data = """公元前2070年（禹建立夏朝）
禹建立了夏朝，这是中国历史上第一个王朝。
标志着原始社会到奴隶社会的过渡。

公元前1600年（商朝建立）
商汤灭夏，建立商朝。
商朝以其青铜器和甲骨文闻名。

公元前1046年（西周建立）
周武王伐纣，灭商建周。
分封制和宗法制是中国古代政治制度的基石。

公元220年（三国时期）
曹丕称帝，魏国建立。
中国进入了魏、蜀、吴三国鼎立的局面。
"""
        try:
            with open(markdown_file, 'w', encoding='utf-8') as f:
                f.write(sample_data)
            print("示例文件创建成功。")
        except Exception as e:
            print(f"创建示例文件时出错: {e}")
            exit()
    
    markdown_to_json(markdown_file)