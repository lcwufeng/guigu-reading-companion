#!/usr/bin/env python3
"""Import the user-provided graded PDF library into structured reader JSON.

The importer consumes Vision OCR JSONL created by ``vision_ocr.swift``.  It
prefers a PDF text layer when that layer is complete, uses OCR otherwise,
removes recurring headers and front matter by explicit chapter boundaries,
repairs wrapped paragraphs across physical pages, and keeps detected artwork
beside the corresponding reader page.
"""

from __future__ import annotations

import argparse
import json
import math
import re
import statistics
from collections import Counter
from dataclasses import dataclass, field
from pathlib import Path
from typing import Callable, Iterable

import cv2
import fitz
import numpy as np
from PIL import Image


CJK_RE = re.compile(r"[\u3400-\u9fff]")
CHAPTER_NUM_RE = re.compile(r"^第?([一二三四五六七八九十百〇零两0-9]+)[章童]")
FRONT_MATTER_RE = re.compile(r"目录|目次|前言|译者序|译序|序言|代序|后记|译后记|出版说明|作者简介|人物介绍|故事梗概|索引|版权")
SENTENCE_END_RE = re.compile(r"[。！？!?…⋯”’」』）】]$")


@dataclass
class Marker:
    title: str
    file_index: int
    page: int
    y: float | None = None
    height: float = 0.0


@dataclass
class Paragraph:
    text: str
    file_index: int
    start_page: int
    end_page: int


@dataclass
class BookConfig:
    slug: str
    title: str
    author: str
    grade: str
    files: list[str]
    summary: str
    knowledge: str
    memory_category: str
    markers: Callable[[list[fitz.Document], list[list[dict]]], list[Marker]]
    stop_page: int | None = None
    verse: bool = False
    dedupe_lines: bool = False
    teaching_excerpt: bool = False
    illustrated: bool = False


def cjk_count(text: str) -> int:
    return len(CJK_RE.findall(text))


def clean_title(text: str) -> str:
    text = re.sub(r"\s+", " ", text).strip(" ·•—-_/\\")
    text = text.replace("第十六章", "第十六章 ") if text.startswith("第十六章") and len(text) > 5 else text
    return re.sub(r"\s+", " ", text).strip()


def normalized(text: str) -> str:
    return re.sub(r"[\s\d\W_]+", "", text, flags=re.UNICODE)


def load_ocr(path: Path) -> list[dict]:
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]


def pdf_text_boxes(doc: fitz.Document, page_index: int) -> list[dict]:
    page = doc[page_index]
    width, height = page.rect.width, page.rect.height
    boxes: list[dict] = []
    for block in page.get_text("dict", flags=fitz.TEXT_PRESERVE_LIGATURES).get("blocks", []):
        if block.get("type") != 0:
            continue
        for line in block.get("lines", []):
            spans = line.get("spans", [])
            text = "".join(span.get("text", "") for span in spans).strip()
            if not text:
                continue
            x0, y0, x1, y1 = line.get("bbox", (0, 0, 0, 0))
            boxes.append({
                "text": text,
                "confidence": 1.0,
                "x": max(0.0, x0 / width),
                "y": max(0.0, 1.0 - y1 / height),
                "width": max(0.0, (x1 - x0) / width),
                "height": max(0.0, (y1 - y0) / height),
            })
    return sorted(boxes, key=lambda box: (-box["y"], box["x"]))


def chosen_boxes(doc: fitz.Document, ocr_page: dict, page_index: int) -> list[dict]:
    ocr = ocr_page["boxes"]
    extracted = pdf_text_boxes(doc, page_index)
    ocr_chars = sum(cjk_count(box["text"]) for box in ocr)
    extracted_chars = sum(cjk_count(box["text"]) for box in extracted)
    if extracted_chars >= 90 and extracted_chars >= ocr_chars * 0.55:
        return extracted
    return ocr


def find_box(pages: list[dict], page: int, title: str) -> tuple[float | None, float]:
    wanted = normalized(re.sub(r"^第?[一二三四五六七八九十百〇零两0-9]+[章童、.． ]*", "", title))
    if not wanted:
        wanted = normalized(title)
    candidates = pages[page - 1]["boxes"]
    for box in candidates:
        value = normalized(box["text"])
        if value and (wanted in value or value in wanted) and min(len(value), len(wanted)) >= 2:
            return box["y"], box["height"]
    return None, 0.0


def manual_markers(items: list[tuple[int, str]], file_index: int = 0) -> Callable[[list[fitz.Document], list[list[dict]]], list[Marker]]:
    def build(_: list[fitz.Document], ocr_sets: list[list[dict]]) -> list[Marker]:
        result = []
        for page, title in items:
            y, height = find_box(ocr_sets[file_index], page, title)
            result.append(Marker(clean_title(title), file_index, page, y, height))
        return result
    return build


def bookmark_markers(kind: str) -> Callable[[list[fitz.Document], list[list[dict]]], list[Marker]]:
    def build(docs: list[fitz.Document], ocr_sets: list[list[dict]]) -> list[Marker]:
        toc = docs[0].get_toc(simple=True)
        result: list[Marker] = []
        section = ""
        for level, raw_title, page in toc:
            title = clean_title(raw_title)
            if page <= 0:
                continue
            if kind == "andersen":
                if level != 2 or FRONT_MATTER_RE.search(title):
                    continue
            elif kind == "oz":
                if level != 3 or not re.match(r"^\d+\s+", title):
                    continue
            elif kind == "prince":
                if level != 2 or page < 8 or not re.search(r"[一二三四五六七八九十0-9]", title):
                    continue
                title = re.sub(r"^(?!第)([一二三四五六七八九十]+)(章)?$", r"第\1章", title)
            elif kind == "jiali":
                if level == 2 and title in {"女生贾梅", "男生贾里"}:
                    section = title
                    continue
                if level != 3 or FRONT_MATTER_RE.search(title):
                    continue
                title = f"{section} · {title}"
            elif kind == "holmes":
                if level == 2:
                    section = title
                    continue
                if level < 3 or re.match(r"^第[一二]部", title):
                    continue
                title = f"{section} · {title}"
            y, height = find_box(ocr_sets[0], page, raw_title)
            result.append(Marker(title, 0, page, y, height))
        return result
    return build


def reynard_markers(_: list[fitz.Document], ocr_sets: list[list[dict]]) -> list[Marker]:
    pages = ocr_sets[0]
    result: list[Marker] = []
    for page in pages:
        boxes = [box for box in page["boxes"] if cjk_count(box["text"])]
        for index, box in enumerate(boxes):
            text = clean_title(box["text"])
            if not 3 <= cjk_count(text) <= 28 or FRONT_MATTER_RE.search(text) or "列那狐的故事" == text:
                continue
            previous_y = boxes[index - 1]["y"] if index else 1.0
            gap = previous_y - (box["y"] + box["height"])
            if gap > 0.032 and not re.search(r"[，。！？；：“”\"（）()]", text):
                result.append(Marker(text.replace("—一", "——"), 0, page["page"], box["y"], box["height"]))
    return result


def insects_markers(_: list[fitz.Document], ocr_sets: list[list[dict]]) -> list[Marker]:
    result: list[Marker] = []
    volume = 0
    for page in ocr_sets[0][9:]:
        boxes = [box for box in page["boxes"] if cjk_count(box["text"])]
        for index, box in enumerate(boxes[:10]):
            match = CHAPTER_NUM_RE.match(box["text"].replace(" ", ""))
            if not match:
                continue
            if match.group(1) in {"一", "1"}:
                volume += 1
            subtitle = boxes[index + 1]["text"] if index + 1 < len(boxes) else ""
            title = f"第{volume}卷 · {box['text']} {subtitle}" if volume else f"{box['text']} {subtitle}"
            result.append(Marker(clean_title(title), 0, page["page"], box["y"], box["height"]))
            break
    return result


def prairie_markers(_: list[fitz.Document], ocr_sets: list[list[dict]]) -> list[Marker]:
    result: list[Marker] = []
    for file_index, pages in enumerate(ocr_sets):
        for page in pages:
            for box in page["boxes"]:
                text = clean_title(box["text"])
                match = re.match(r"^(\d{1,2})\s*([^/\d].{1,24})$", text)
                if match and box["height"] > 0.024 and 0.70 < box["y"] < 0.86:
                    result.append(Marker(f"第{int(match.group(1))}章 · {match.group(2)}", file_index, page["page"], box["y"], box["height"]))
                    break
    return sorted(result, key=lambda marker: int(re.search(r"\d+", marker.title).group()))


IDIOM_TITLES = [
    "按图索骥", "半途而废", "百步穿杨", "百折不挠", "拔苗助长", "班门弄斧", "兵不厌诈", "病入膏肓", "不寒而栗", "东施效颦",
    "德高望重", "孤注一掷", "害群之马", "刻舟求剑", "口蜜腹剑", "狼狈为奸", "乐不思蜀", "毛遂自荐", "明目张胆", "弄巧成拙",
    "完璧归赵", "呕心沥血", "破釜沉舟", "扑朔迷离", "黔驴技穷", "骑虎难下", "如鱼得水", "人杰地灵", "入木三分", "三顾茅庐",
    "三令五申", "熟能生巧", "司空见惯", "退避三舍", "螳臂当车", "图穷匕见", "闻鸡起舞", "卧薪尝胆", "望梅止渴", "相依为命",
    "相提并论", "信誓旦旦", "胸有成竹", "掩耳盗铃", "以逸待劳", "庸人自扰", "叶公好龙", "斩草除根", "助纣为虐", "指鹿为马",
    "纸上谈兵", "爱不释手", "暗度陈仓", "白驹过隙", "闭门思过", "标新立异", "不拘小节", "背水一战", "初出茅庐", "唇亡齿寒",
    "重蹈覆辙", "大义灭亲", "恶贯满盈", "釜底抽薪", "负荆请罪", "高枕无忧", "过河拆桥", "刮目相看", "狐假虎威", "画龙点睛",
    "华而不实", "黄粱一梦", "驾轻就熟", "家喻户晓", "金玉其外，败絮其中", "空前绝后", "励精图治", "抛砖引玉", "爱屋及乌", "安步当车",
    "按兵不动", "八面威风", "拔山举鼎", "百川归海", "百发百中", "包藏祸心", "别无长物", "草船借箭", "超群绝伦", "得心应手",
    "赴汤蹈火", "哄堂大笑", "鸡犬升天", "开卷有益", "马首是瞻", "南州冠冕", "大笔如椽", "乐此不疲", "冒天下之大不韪", "对牛弹琴",
    "后生可畏", "家鸡野雉", "不知所云", "半部论语", "咄咄怪事", "难兄难弟", "合浦珠还", "汗马功劳", "井底之蛙", "门可罗雀",
    "马革裹尸", "克勤克俭", "打草惊蛇", "冰山难靠", "侃侃而谈", "木人石心", "三人成虎", "滴水穿石", "兵贵神速", "鸿鹄之志",
    "破镜重圆", "宾至如归",
]


def idiom_markers(_: list[fitz.Document], ocr_sets: list[list[dict]]) -> list[Marker]:
    pages = ocr_sets[0]
    page_numbers = [7, *range(10, 251, 2)]
    result = []
    for page_number, title in zip(page_numbers, IDIOM_TITLES, strict=True):
        y, height = find_box(pages, page_number, title)
        result.append(Marker(title, 0, page_number, y, height))
    return result


def palm_markers(_: list[fitz.Document], ocr_sets: list[list[dict]]) -> list[Marker]:
    items = [
        (4, "鲸鱼和小鱼"), (7, "蝴蝶在读香喷喷的报纸"), (9, "奇怪的雨伞"), (11, "给狗熊奶奶读信"),
        (13, "玩滑梯的小星星"), (15, "再见，蜻蜓老师"), (17, "月亮·太阳"), (19, "躲在树上的雨"),
        (22, "森林，请开步走"), (25, "但愿"), (27, "香蝴蝶"), (29, "月亮，掉进了古井"),
        (31, "第24个故事"), (35, "池塘里的圆月亮"), (39, "变成小虫子，也要在一起"), (42, "会说话的卷心菜"),
        (45, "打架"), (48, "枣子和苹果"), (51, "我的一份呢"), (53, "阳台栏杆上的小猫"),
        (57, "一只差点变成狼和狐狸的鸭"), (60, "软软的漂亮沙发"), (63, "当一只小尾巴"), (66, "阿邦的清蒸怪鱼"),
        (71, "马戏场上的小黑熊"), (74, "池塘里的狼尾巴"), (78, "大灰狼和会动的口袋"), (81, "睡在云上的朋友"),
        (84, "狐狸的大尾巴掉了"), (86, "钓到一个馋嘴哥哥"), (91, "美味的高尔夫球棒"),
    ]
    return manual_markers(items)([], ocr_sets)


def spring_autumn_markers(_: list[fitz.Document], ocr_sets: list[list[dict]]) -> list[Marker]:
    printed = [
        (1, "千金一笑"), (7, "兄弟相残"), (13, "暗箭伤人"), (17, "管鲍之交"), (23, "一鼓作气"), (28, "老马识途"),
        (34, "仙鹤坐车"), (39, "唇亡齿寒"), (44, "五张羊皮"), (50, "‘仁义’大旗"), (55, "饱不忘饥"), (64, "退避三舍"),
        (72, "犒军救国"), (78, "放虎回山"), (88, "桃园打鸟"), (96, "一鸣惊人"), (102, "搜孤救孤"), (109, "晏子使楚"),
        (113, "混出昭关"), (121, "鱼肠藏剑"), (127, "掘墓鞭尸"), (135, "周游列国"), (141, "石屋养马"), (147, "卧薪尝胆"),
    ]
    return manual_markers([(page + 2, title) for page, title in printed])([], ocr_sets)


def class_monitor_markers(_: list[fitz.Document], ocr_sets: list[list[dict]]) -> list[Marker]:
    result = []
    banned = re.compile(r"第一辑|第二辑|目录|班长下台珍藏版")
    for page in ocr_sets[0][5:289]:
        boxes = [box for box in page["boxes"] if cjk_count(box["text"])]
        candidates = []
        for box in boxes:
            text = clean_title(box["text"])
            if 2 <= cjk_count(text) <= 18 and not banned.search(text) and not re.search(r"[，。！？：“”\"（）]", text):
                if 0.20 < box["x"] < 0.58 and (box["y"] > 0.90 or page["page"] in {6, 150} and box["y"] > 0.80):
                    candidates.append((box["y"], box, text))
        if candidates:
            _, box, title = max(candidates)
            result.append(Marker(title, 0, page["page"], box["y"], box["height"]))
    return result


ALICE = [(7, "第一章 掉进兔子洞"), (20, "第二章 泪池塘"), (30, "第三章 会议式长跑和一个长故事"), (41, "第四章 兔子哥派来比尔"), (57, "第五章 毛毛虫的忠告"), (70, "第六章 小猪和胡椒粉"), (85, "第七章 疯狂茶会"), (98, "第八章 王后的槌球场"), (116, "第九章 素海龟的故事"), (136, "第十章 龙虾的四人组舞"), (158, "第十一章 谁偷了果馅饼"), (176, "第十二章 爱丽丝出庭作证")]
SECRET_GARDEN = [(9, "第一章 一个也没剩下"), (15, "第二章 玛丽小姐倔乖乖"), (24, "第三章 穿过荒原"), (29, "第四章 玛莎"), (45, "第五章 走廊里的哭声"), (50, "第六章 有人在哭——真的！"), (57, "第七章 花园的钥匙"), (63, "第八章 引路的知更鸟"), (74, "第九章 最奇怪的房子"), (81, "第十章 迪康"), (93, "第十一章 槲鸫的窝巢"), (102, "第十二章 我能有一小片地吗？"), (111, "第十三章 我是科林"), (121, "第十四章 一位小王爷"), (134, "第十五章 筑巢"), (145, "第十六章 我就不来！玛丽说"), (152, "第十七章 大发雷霆"), (160, "第十八章 你可不能浪费时间"), (168, "第十九章 春天来到了！"), (179, "第二十章 我会一直活下去的！"), (187, "第二十一章 本·韦瑟斯达夫"), (201, "第二十二章 太阳西下时分"), (207, "第二十三章 魔法"), (214, "第二十四章 让他们笑吧"), (227, "第二十五章 帘幕"), (234, "第二十六章 那是妈妈！"), (243, "第二十七章 在花园里")]


BOOKS: list[BookConfig] = [
    BookConfig("reynard-fox", "列那狐的故事", "法国民间故事", "三年级", ["三年级/列那狐的故事.pdf"], "列那狐凭机智周旋于动物王国的十余个故事。", "列那狐故事形成于欧洲中世纪，常用拟人动物讽刺贪婪、虚荣与权力。", "三年级·欧洲民间故事", reynard_markers),
    BookConfig("arabian-nights", "天方夜谭", "阿拉伯民间故事", "三年级", ["三年级/天方夜谭.pdf"], "收录故事开端、阿里巴巴、四色鱼、辛巴达和阿拉丁等故事。", "《天方夜谭》又名《一千零一夜》，由许多民间故事层层嵌套而成。", "三年级·世界民间故事", manual_markers([(4, "故事的开端"), (12, "阿里巴巴和四十大盗"), (61, "四色鱼的故事"), (101, "辛巴达航海记"), (143, "阿拉丁奇遇记")]), illustrated=True),
    BookConfig("alice-wonderland", "爱丽丝漫游仙境", "刘易斯·卡罗尔", "三年级", ["三年级/爱丽丝漫游仙境.pdf"], "爱丽丝追随白兔进入奇妙世界的十二章冒险。", "作品把逻辑游戏、语言幽默和奇异想象编织在一起。", "三年级·英国儿童文学", manual_markers(ALICE), illustrated=True),
    BookConfig("pipilu", "皮皮鲁传", "郑渊洁", "三年级", ["三年级/皮皮鲁传.pdf"], "按原书目录收录皮皮鲁外传、鲍尔历险记等十三篇故事。", "皮皮鲁系列用大胆想象讨论成长、规则、勇气与独立判断。", "三年级·中国儿童文学", manual_markers([(5, "皮皮鲁外传"), (59, "鲍尔历险记"), (172, "世纪末危机"), (201, "红塔乐园"), (239, "驯兔记"), (270, "名画风波"), (298, "巴斯波和他的飞碟"), (303, "皮皮鲁分身记"), (314, "皮皮鲁和水姑娘"), (320, "皮皮鲁奇遇记"), (327, "皮皮鲁魔袜"), (330, "皮皮鲁牙膏奇遇记"), (347, "大侠皮皮鲁")]), stop_page=351),
    BookConfig("wizard-oz", "绿野仙踪", "L.弗兰克·鲍姆", "三年级", ["三年级/绿野仙踪.pdf"], "多萝茜与稻草人、铁皮人和狮子同行的二十四章冒险。", "故事通过寻找脑子、心和勇气，讨论人怎样在行动中发现自身已有的力量。", "三年级·美国儿童文学", bookmark_markers("oz")),
    BookConfig("first-second-grader", "一年级大个子二年级小个子", "古田足日", "二年级", ["二年级/一年级大个子二年级小个子.pdf"], "正也和秋代在校园与森林旅程中逐渐成为朋友。", "作品用孩子的身高、年级和性格反差，表现理解、勇气与互相帮助。", "二年级·日本儿童文学", manual_markers([(20, "第一章 一年级的学生也高过头了"), (34, "第二章 大个子被小个子拉着手"), (46, "第三章 我肚子饿啦"), (58, "第四章 坚强起来，是什么意思？"), (68, "第五章 秋代又打架了"), (78, "第六章 对孩子来说，差不多所有的路都是第一次的路"), (90, "第七章 第一次看见秋代哭了"), (104, "第八章 正也离家出走"), (116, "第九章 小朋友，你挺坚强"), (128, "第十章 是好心的叔叔，还是诱拐犯"), (138, "第十一章 正也终于到了一棵杉树的树林"), (152, "第十二章 慢腾腾的真理子大显身手"), (166, "第十三章 紫斑风铃花的原野，出现了彩虹")]), illustrated=True),
    BookConfig("chinese-idioms", "中国成语故事", "张芳 主编", "二年级", ["二年级/中国成语故事（彩绘注音版）.pdf"], "按原书逐篇收录一百二十二则彩绘成语故事。", "成语把历史故事和固定表达浓缩在几个字里，理解典故能帮助准确使用。", "二年级·成语与传统文化", idiom_markers, illustrated=True),
    BookConfig("fantastic-mr-fox", "了不起的狐狸爸爸", "罗尔德·达尔", "二年级", ["二年级/了不起的狐狸爸爸.pdf"], "用户电子版收录猎枪、铁锹、挖掘机、饥饿与宴会五个精彩回合。", "狐狸爸爸的办法既依靠勇气，也依靠合作和对对手行动的判断。", "二年级·英国儿童文学", manual_markers([(8, "第一回合——猎枪"), (10, "第二回合——铁锹"), (11, "第三回合——挖掘机"), (13, "第四回合——饥饿"), (15, "第五回合——盛大的宴会")]), stop_page=16, teaching_excerpt=True, illustrated=True),
    BookConfig("inventor-rabbit", "发明家奇奇兔", "埃迪特·施莱本-维克", "二年级", ["二年级/发明家奇奇兔.pdf"], "奇奇兔一次次发明机器，也在寻找真正的朋友。", "发明从发现问题开始；好点子还需要试验、修改，并考虑使用者的感受。", "二年级·德国绘本", manual_markers([(3, "完整故事")]), stop_page=30, verse=True, dedupe_lines=True, illustrated=True),
    BookConfig("nezha-sea", "哪吒闹海", "中国神话故事", "二年级", ["二年级/哪吒闹海.pdf"], "哪吒面对龙宫作乱、保护百姓的神话故事。", "哪吒故事来自中国古代神话和文学改编，不同版本的情节会有所差异。", "二年级·中国神话", manual_markers([(7, "完整故事")]), stop_page=23, teaching_excerpt=True, illustrated=True),
    BookConfig("sisters-red-rain-shoes", "妹妹的红雨鞋", "林焕彰", "二年级", ["二年级/妹妹的红雨鞋.pdf"], "以红雨鞋、雨点和妹妹的脚步写成的儿童诗。", "儿童诗常用声音、重复和画面感，让普通生活变得有节奏、有想象。", "二年级·中国儿童诗", manual_markers([(2, "妹妹的红雨鞋")]), verse=True, dedupe_lines=True, illustrated=True),
    BookConfig("andersen-complete", "安徒生童话全集", "安徒生", "二年级", ["二年级/安徒生童话全集.pdf"], "依据原书书签完整收录全集中的一百余篇童话，已去除目次、译序和译后记。", "安徒生把民间童话传统、个人想象与现实观察结合在一起。", "二年级·丹麦童话全集", bookmark_markers("andersen")),
    BookConfig("palm-fairy-tales", "小巴掌童话", "张秋生", "二年级", ["二年级/小巴掌童话.pdf"], "收录篇幅短小、富有诗意和幽默感的小巴掌童话。", "小童话常用一个细节或一次转折，在很短的篇幅里留下想象空间。", "二年级·中国童话", palm_markers, teaching_excerpt=True, illustrated=True),
    BookConfig("no-brain-unhappy", "没头脑和不高兴", "任溶溶", "二年级", ["二年级/没头脑和不高兴.pdf"], "用户电子版中收录的故事正文与精彩片段。", "夸张的性格会带来连锁后果，幽默故事也能帮助我们反思习惯。", "二年级·中国儿童文学", manual_markers([(8, "没头脑和不高兴")]), stop_page=25, teaching_excerpt=True, illustrated=True),
    BookConfig("kick-drag-red-shoes", "踢拖踢拖小红鞋", "金波", "二年级", ["二年级/踢拖踢拖小红鞋.pdf"], "一双小红鞋带着节奏和想象走进孩子的世界。", "重复的拟声词会形成节奏，也能让文字像声音和动作一样被感受到。", "二年级·中国儿童文学", manual_markers([(2, "完整故事")]), verse=True, dedupe_lines=True, illustrated=True),
    BookConfig("old-tales-south-city", "城南旧事", "林海音", "五年级", ["五年级/城南旧事.pdf"], "收录惠安馆、我们看海去、兰姨娘、驴打滚儿和爸爸的花儿落了。", "小说用小英子的童年视角记录旧北京的人情、离别与成长。", "五年级·中国现代文学", manual_markers([(1, "惠安馆"), (27, "我们看海去"), (38, "兰姨娘"), (48, "驴打滚儿"), (55, "爸爸的花儿落了")])),
    BookConfig("handkerchief-flower-field", "手绢上的花田", "安房直子", "五年级", ["五年级/手绢上的花田.pdf"], "围绕菊酒、小人和红房顶之家展开的七章幻想故事。", "安房直子的幻想常从日常物件打开入口，让愿望、贪心与温柔互相照见。", "五年级·日本幻想文学", manual_markers([(1, "第一章 壶中的小人们"), (8, "第二章 新娘来了"), (12, "第三章 一只小小的长靴"), (17, "第四章 玻璃珠"), (26, "第五章 小人们跳舞"), (30, "第六章 不安的日子"), (31, "第七章 去红房顶的家") ])),
    BookConfig("spring-autumn-stories", "春秋故事", "林汉达", "五年级", ["五年级/春秋故事.pdf"], "用通俗语言讲述春秋时期的重要人物与事件。", "春秋时期诸侯争霸，许多今天仍在使用的成语和典故由此产生。", "五年级·中国历史故事", spring_autumn_markers, stop_page=155),
    BookConfig("class-monitor-steps-down", "班长下台", "桂文亚", "五年级", ["五年级/班长下台.pdf"], "按原书篇目收录校园、家庭、自然与成长主题散文。", "儿童散文会把真实经历、细节观察和作者当时的感受写在一起。", "五年级·中国儿童散文", class_monitor_markers, stop_page=290),
    BookConfig("grass-house", "草房子", "曹文轩", "五年级", ["五年级/草房子.pdf"], "油麻地小学少年们在九章故事中经历友情、尊严、疾病与成长。", "作品用水乡景物和儿童视角表现人物的选择、困境与温情。", "五年级·中国儿童文学", manual_markers([(1, "第一章 秃鹤"), (37, "第二章 纸月"), (79, "第三章 白雀"), (122, "第四章 艾地"), (162, "第五章 红门"), (206, "第六章 细马"), (245, "第七章 白雀（二）"), (283, "第八章 红门（二）"), (309, "第九章 药寮")])),
    BookConfig("little-prince", "小王子", "圣埃克苏佩里", "六年级", ["六年级/小王子.pdf"], "小王子离开自己的星球，访问不同星球并来到地球的二十七章旅程。", "作品借童话式旅行讨论友谊、责任、孤独和真正重要的事物。", "六年级·法国文学", bookmark_markers("prince"), illustrated=True),
    BookConfig("insects", "昆虫记", "法布尔", "四年级", ["四年级/昆虫记.pdf"], "按卷与章节收录法布尔对昆虫生活的长期观察。", "观察记录需要区分亲眼所见、实验推断和想象性的表达。", "四年级·自然科学文学", insects_markers, illustrated=True),
    BookConfig("boys-jiali", "男生贾里（含女生贾梅）", "秦文君", "四年级", ["四年级/男生贾里.pdf"], "原文件合订收录女生贾梅与男生贾里两部分故事。", "校园小说通过同学、家庭和集体生活中的选择表现成长。", "四年级·中国校园文学", bookmark_markers("jiali")),
    BookConfig("sherlock-holmes", "福尔摩斯探案集", "柯南·道尔", "四年级", ["四年级/福尔摩斯探案集.pdf"], "收录巴斯克维尔的猎犬、恐怖谷和血字的研究。", "侦探推理要把观察到的证据与解释区分开，再检验推断能否覆盖全部线索。", "四年级·英国侦探文学", bookmark_markers("holmes")),
    BookConfig("secret-garden", "秘密花园", "弗朗西丝·霍奇森·伯内特", "四年级", ["四年级/秘密花园.pdf"], "玛丽、科林和迪康在二十七章中让花园与自己一同恢复生机。", "园艺、季节变化和人与人的陪伴共同构成小说中的“魔法”。", "四年级·英国儿童文学", manual_markers(SECRET_GARDEN), illustrated=True),
    BookConfig("little-house-prairie", "草原上的小木屋", "罗兰·英格斯·怀德", "四年级", ["四年级/草原上的小木屋 上.pdf", "四年级/草原上的小木屋 下.pdf"], "上下册合并，按原书连续章节记录一家人的草原拓荒生活。", "作品以儿童视角记录迁徙、建屋、自然环境和家庭劳动。", "四年级·美国儿童文学", prairie_markers, illustrated=True),
]


def recurring_lines(page_boxes: list[list[dict]]) -> set[str]:
    counts = Counter()
    for boxes in page_boxes:
        seen = set()
        for box in boxes:
            value = normalized(box["text"])
            if 2 <= len(value) <= 28:
                seen.add(value)
        counts.update(seen)
    threshold = max(4, math.ceil(len(page_boxes) * 0.04))
    return {value for value, count in counts.items() if count >= threshold}


def teaching_line(text: str) -> bool:
    compact = text.strip()
    if re.search(r"选文精粹|随堂测|自读提示|故事放大镜|故事万花筒|阅读要求|词语积累|读书感受|返回|下课了|人物关系图|故事简介|作者简介|基本信息|自然风光|想一想", compact):
        return True
    if "“" in compact or "”" in compact or '"' in compact:
        return False
    if compact.endswith(("？", "?")) and 5 <= cjk_count(compact) <= 35:
        return True
    return bool(re.search(r"你觉得|找出相关|故事中.+为什么|为什么.+[？?]$|怎样.+[？?]$|^\d+[.、].+[？?]$", compact))


def boxes_for_range(
    page_boxes: list[list[dict]],
    marker: Marker,
    next_marker: Marker | None,
    stop_page: int,
    config: BookConfig,
) -> Iterable[tuple[int, list[dict]]]:
    end_page = stop_page
    if next_marker and next_marker.file_index == marker.file_index:
        end_page = next_marker.page
    for page_number in range(marker.page, end_page + 1):
        if page_number > len(page_boxes):
            break
        if config.slug == "chinese-idioms":
            final_story_page = marker.page + (2 if marker.page == 7 else 1)
            if page_number > final_story_page:
                continue
        boxes = page_boxes[page_number - 1]
        selected = []
        teaching_started = False
        for box in boxes:
            if page_number == marker.page and marker.y is not None and box["y"] >= marker.y - 0.002:
                continue
            if page_number == marker.page and marker.y is None and box["y"] > 0.72 and box["height"] > 0.025:
                title_candidate = clean_title(box["text"])
                if 2 <= cjk_count(title_candidate) <= 20 and not re.search(r"[。！？；：“”]", title_candidate):
                    continue
            if next_marker and next_marker.file_index == marker.file_index and page_number == next_marker.page and next_marker.y is not None and box["y"] <= next_marker.y + next_marker.height + 0.002:
                continue
            if next_marker and next_marker.file_index == marker.file_index and page_number == next_marker.page and next_marker.y is None:
                continue
            if config.slug == "chinese-idioms" and page_number > marker.page:
                cutoff = 0.50 if marker.page == 7 and page_number == 9 else 0.27
                if box["x"] >= 0.67 or box["y"] < cutoff:
                    continue
            text = box["text"].strip()
            if config.teaching_excerpt and (teaching_started or teaching_line(text)):
                teaching_started = True
                continue
            selected.append(box)
        if selected:
            yield page_number, selected


def append_line(paragraphs: list[Paragraph], text: str, file_index: int, page: int, new_paragraph: bool, dedupe: bool) -> None:
    text = re.sub(r"\s+", " ", text).strip()
    if not text or cjk_count(text) == 0:
        return
    if dedupe and any(normalized(existing.text) == normalized(text) for existing in paragraphs[-80:]):
        return
    if not paragraphs or new_paragraph:
        paragraphs.append(Paragraph(text, file_index, page, page))
        return
    previous = paragraphs[-1]
    spacer = " " if re.search(r"[A-Za-z0-9]$", previous.text) and re.match(r"[A-Za-z0-9]", text) else ""
    previous.text = f"{previous.text}{spacer}{text}"
    previous.end_page = page


def chapter_paragraphs(
    config: BookConfig,
    marker: Marker,
    next_marker: Marker | None,
    chosen: list[list[list[dict]]],
    repeated: list[set[str]],
    file_page_counts: list[int],
) -> list[Paragraph]:
    stop = file_page_counts[marker.file_index]
    if config.stop_page and marker.file_index == len(config.files) - 1:
        stop = min(stop, config.stop_page - 1)
    paragraphs: list[Paragraph] = []
    previous_page_last = ""
    for page_number, boxes in boxes_for_range(chosen[marker.file_index], marker, next_marker, stop, config):
        body = []
        for box in boxes:
            text = box["text"].strip()
            value = normalized(text)
            if not value or value in repeated[marker.file_index] or cjk_count(text) == 0:
                continue
            if FRONT_MATTER_RE.fullmatch(value) or normalized(marker.title) == value:
                continue
            if re.fullmatch(r"[一—\-]*\s*\d+\s*[一—\-]*", text):
                continue
            body.append(box)
        if not body:
            continue
        lefts = [box["x"] for box in body if box["width"] > 0.2]
        left = float(np.percentile(lefts, 20)) if lefts else min(box["x"] for box in body)
        for index, box in enumerate(body):
            text = box["text"].strip()
            is_first = index == 0
            indented = box["x"] > left + 0.025 and box["width"] > 0.12
            short_line = cjk_count(text) <= 18 and box["width"] < 0.55
            page_continuation = is_first and paragraphs and not SENTENCE_END_RE.search(previous_page_last) and not indented
            if config.verse:
                new_paragraph = not page_continuation
            else:
                new_paragraph = not page_continuation and (is_first or indented or (paragraphs and SENTENCE_END_RE.search(paragraphs[-1].text) and short_line))
            append_line(paragraphs, text, marker.file_index, page_number, new_paragraph, config.dedupe_lines)
            previous_page_last = text
    return [paragraph for paragraph in paragraphs if cjk_count(paragraph.text) >= 2]


def artwork_crop(doc: fitz.Document, ocr_page: dict, page_number: int) -> Image.Image | None:
    page = doc[page_number - 1]
    scale = 850 / max(page.rect.width, 1)
    pix = page.get_pixmap(matrix=fitz.Matrix(scale, scale), colorspace=fitz.csRGB, alpha=False)
    rgb = np.frombuffer(pix.samples, dtype=np.uint8).reshape(pix.height, pix.width, 3)
    h, w = rgb.shape[:2]
    border = np.concatenate([rgb[: max(2, h // 40)].reshape(-1, 3), rgb[-max(2, h // 40):].reshape(-1, 3)])
    background = np.median(border, axis=0)
    distance = np.linalg.norm(rgb.astype(np.float32) - background.astype(np.float32), axis=2)
    hsv = cv2.cvtColor(rgb, cv2.COLOR_RGB2HSV)
    ink = ((distance > 32) | (hsv[:, :, 1] > 42)).astype(np.uint8) * 255
    for box in ocr_page["boxes"]:
        x0 = max(0, int(box["x"] * w) - 5)
        x1 = min(w, int((box["x"] + box["width"]) * w) + 5)
        y0 = max(0, int((1 - box["y"] - box["height"]) * h) - 5)
        y1 = min(h, int((1 - box["y"]) * h) + 5)
        ink[y0:y1, x0:x1] = 0
    margin_x, margin_y = int(w * 0.025), int(h * 0.025)
    ink[:margin_y] = ink[-margin_y:] = 0
    ink[:, :margin_x] = ink[:, -margin_x:] = 0
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (max(5, w // 70) | 1, max(5, h // 70) | 1))
    merged = cv2.morphologyEx(ink, cv2.MORPH_CLOSE, kernel, iterations=2)
    count, _, stats, _ = cv2.connectedComponentsWithStats(merged)
    candidates = []
    for x, y, cw, ch, area in stats[1:count]:
        ratio = area / (w * h)
        if ratio >= 0.012 and cw >= w * 0.16 and ch >= h * 0.10:
            candidates.append((area, x, y, cw, ch))
    if not candidates:
        return None
    candidates.sort(reverse=True)
    _, x, y, cw, ch = candidates[0]
    if cw > w * 0.94 and ch > h * 0.94 and sum(cjk_count(box["text"]) for box in ocr_page["boxes"]) > 120:
        return None
    pad = max(8, int(min(w, h) * 0.018))
    x0, y0 = max(0, x - pad), max(0, y - pad)
    x1, y1 = min(w, x + cw + pad), min(h, y + ch + pad)
    crop = Image.fromarray(rgb[y0:y1, x0:x1])
    if crop.width < 120 or crop.height < 90:
        return None
    crop.thumbnail((900, 760), Image.Resampling.LANCZOS)
    return crop


def paginate(paragraphs: list[Paragraph], illustrations: list[tuple[int, int, str]], title: str) -> list[dict]:
    pages: list[dict] = []
    current: list[Paragraph] = []
    length = 0
    for paragraph in paragraphs:
        if current and length + len(paragraph.text) > 1450:
            pages.append({"heading": title, "body": "\n\n".join(item.text for item in current), "_range": (current[0].file_index, current[0].start_page, current[-1].end_page)})
            current = []
            length = 0
        current.append(paragraph)
        length += len(paragraph.text)
    if current:
        pages.append({"heading": title, "body": "\n\n".join(item.text for item in current), "_range": (current[0].file_index, current[0].start_page, current[-1].end_page)})
    if not pages:
        pages = [{"heading": title, "body": "本章正文识别后暂时没有可显示的文字。", "_range": (0, 0, 0)}]
    if len(pages) > 1 and len(pages[-1]["body"]) < 120:
        trailing = pages.pop()
        pages[-1]["body"] = f"{pages[-1]['body']}\n\n{trailing['body']}"
        pages[-1]["_range"] = (pages[-1]["_range"][0], pages[-1]["_range"][1], trailing["_range"][2])
    for file_index, source_page, src in illustrations:
        target = next((page for page in pages if page["_range"][0] == file_index and page["_range"][1] <= source_page <= page["_range"][2]), None)
        if target is None:
            target = pages[0]
        target.setdefault("images", []).append({"src": src, "alt": f"《{title}》原书插图"})
    for page in pages:
        page.pop("_range", None)
    return pages


def import_book(config: BookConfig, source_root: Path, ocr_root: Path, output_root: Path, asset_root: Path, skip_images: bool) -> dict:
    docs = [fitz.open(source_root / relative) for relative in config.files]
    ocr_sets = [load_ocr(ocr_root / Path(relative).with_suffix(".jsonl")) for relative in config.files]
    chosen = []
    repeated = []
    for doc, pages in zip(docs, ocr_sets):
        boxes = [chosen_boxes(doc, page, index) for index, page in enumerate(pages)]
        chosen.append(boxes)
        repeated.append(recurring_lines(boxes))
    markers = config.markers(docs, ocr_sets)
    markers = [marker for marker in markers if marker.page > 0 and not FRONT_MATTER_RE.search(marker.title)]
    markers.sort(key=lambda marker: (marker.file_index, marker.page, -(marker.y or 1.0)))
    deduped = []
    seen = set()
    for marker in markers:
        key = (marker.file_index, marker.page, normalized(marker.title))
        if key not in seen:
            deduped.append(marker)
            seen.add(key)
    markers = deduped
    chapters = []
    image_count = 0
    for index, marker in enumerate(markers):
        next_marker = markers[index + 1] if index + 1 < len(markers) else None
        paragraphs = chapter_paragraphs(config, marker, next_marker, chosen, repeated, [len(doc) for doc in docs])
        illustrations: list[tuple[int, int, str]] = []
        if config.illustrated and not skip_images:
            end_page = (next_marker.page if next_marker and next_marker.file_index == marker.file_index else len(docs[marker.file_index]))
            if next_marker and next_marker.file_index == marker.file_index and next_marker.page > marker.page:
                end_page -= 1
            if config.stop_page:
                end_page = min(end_page, config.stop_page - 1)
            page_numbers: Iterable[int] = range(marker.page, end_page + 1)
            if config.slug in {"chinese-idioms", "palm-fairy-tales"}:
                page_numbers = [marker.page]
            for page_number in page_numbers:
                if page_number > len(docs[marker.file_index]):
                    break
                crop = artwork_crop(docs[marker.file_index], ocr_sets[marker.file_index][page_number - 1], page_number)
                if crop is None:
                    continue
                relative = Path(config.slug) / f"f{marker.file_index + 1}-p{page_number:04d}.webp"
                destination = asset_root / relative
                destination.parent.mkdir(parents=True, exist_ok=True)
                crop.save(destination, "WEBP", quality=68, method=6)
                illustrations.append((marker.file_index, page_number, f"/assets/books/classics/{relative.as_posix()}"))
                image_count += 1
        pages = paginate(paragraphs, illustrations, marker.title)
        chapters.append({"id": str(len(chapters) + 1), "title": marker.title, "pages": pages})
    payload = {
        "id": config.slug,
        "title": config.title,
        "author": config.author,
        "grade": config.grade,
        "sourceLabel": "用户提供电子版；扫描页经本地 OCR 整理",
        "chapters": chapters,
    }
    output_root.mkdir(parents=True, exist_ok=True)
    (output_root / f"{config.slug}.json").write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    return {
        "slug": config.slug,
        "title": config.title,
        "author": config.author,
        "grade": config.grade,
        "summary": config.summary,
        "knowledge": config.knowledge,
        "memoryCategory": config.memory_category,
        "chapterCount": len(chapters),
        "pageCount": sum(len(chapter["pages"]) for chapter in chapters),
        "imageCount": image_count,
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source-root", type=Path, default=Path("./1-6年级经典读物"))
    parser.add_argument("--ocr-root", type=Path, default=Path("tmp/pdfs/full-ocr"))
    parser.add_argument("--output-root", type=Path, default=Path("public/books/classics"))
    parser.add_argument("--asset-root", type=Path, default=Path("public/assets/books/classics"))
    parser.add_argument("--app-manifest", type=Path, default=Path("app/classic-books-manifest.json"))
    parser.add_argument("--skip-images", action="store_true")
    parser.add_argument("--only", action="append", default=[])
    args = parser.parse_args()
    selected = [book for book in BOOKS if not args.only or book.slug in args.only]
    manifest = [import_book(book, args.source_root, args.ocr_root, args.output_root, args.asset_root, args.skip_images) for book in selected]
    manifest_path = args.output_root / "manifest.json"
    manifest_json = json.dumps(manifest, ensure_ascii=False, indent=2)
    manifest_path.write_text(manifest_json, encoding="utf-8")
    args.app_manifest.parent.mkdir(parents=True, exist_ok=True)
    args.app_manifest.write_text(manifest_json, encoding="utf-8")
    for book in manifest:
        print(f"{book['grade']} 《{book['title']}》: {book['chapterCount']} 章 / {book['pageCount']} 阅读页 / {book['imageCount']} 幅插图")


if __name__ == "__main__":
    main()
