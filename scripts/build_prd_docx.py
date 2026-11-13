from __future__ import annotations

import os
import re
import tempfile
import xml.etree.ElementTree as ET
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile

from docx import Document
from docx.enum.section import WD_SECTION
from docx.enum.table import WD_CELL_VERTICAL_ALIGNMENT, WD_TABLE_ALIGNMENT
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Cm, Pt, RGBColor


REPO_ROOT = Path(__file__).resolve().parents[1]
SOURCE = Path(os.environ.get("GUIGU_PRD_SOURCE", REPO_ROOT / "docs" / "龟龟伴读_产品需求文档_PRD.md"))
OUTPUT = Path(os.environ.get("GUIGU_PRD_OUTPUT", REPO_ROOT / "docs" / "龟龟伴读_产品需求文档_PRD.docx"))
LOGO = REPO_ROOT / "public" / "assets" / "legacy" / "brand" / "guigu_logo.png"
TURTLE = REPO_ROOT / "public" / "assets" / "characters" / "turtle" / "turtle_reading.png"

INK = "17352D"
LEAF = "18764C"
MINT = "E7F7E7"
PALE = "F4F8F3"
SUN = "FFC94A"
WHITE = "FFFFFF"
MUTED = "61746E"
BODY_FONT = "Hiragino Sans GB"
WORD_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"


def set_cell_shading(cell, fill: str) -> None:
    tc_pr = cell._tc.get_or_add_tcPr()
    shd = tc_pr.find(qn("w:shd"))
    if shd is None:
        shd = OxmlElement("w:shd")
        tc_pr.append(shd)
    shd.set(qn("w:fill"), fill)


def set_cell_margins(cell, top=90, start=110, bottom=90, end=110) -> None:
    tc = cell._tc
    tc_pr = tc.get_or_add_tcPr()
    tc_mar = tc_pr.first_child_found_in("w:tcMar")
    if tc_mar is None:
        tc_mar = OxmlElement("w:tcMar")
        tc_pr.append(tc_mar)
    for margin, value in (("top", top), ("start", start), ("bottom", bottom), ("end", end)):
        node = tc_mar.find(qn(f"w:{margin}"))
        if node is None:
            node = OxmlElement(f"w:{margin}")
            tc_mar.append(node)
        node.set(qn("w:w"), str(value))
        node.set(qn("w:type"), "dxa")


def set_repeat_table_header(row) -> None:
    tr_pr = row._tr.get_or_add_trPr()
    tbl_header = OxmlElement("w:tblHeader")
    tbl_header.set(qn("w:val"), "true")
    tr_pr.append(tbl_header)


def set_keep_together(row) -> None:
    tr_pr = row._tr.get_or_add_trPr()
    cant_split = OxmlElement("w:cantSplit")
    tr_pr.append(cant_split)


def set_run_font(run, name=BODY_FONT, size=None, bold=None, color=None) -> None:
    run.font.name = name
    run._element.rPr.rFonts.set(qn("w:ascii"), name)
    run._element.rPr.rFonts.set(qn("w:hAnsi"), name)
    run._element.rPr.rFonts.set(qn("w:eastAsia"), name)
    if size is not None:
        run.font.size = Pt(size)
    if bold is not None:
        run.bold = bold
    if color:
        run.font.color.rgb = RGBColor.from_string(color)


def add_page_number(paragraph) -> None:
    paragraph.alignment = WD_ALIGN_PARAGRAPH.RIGHT
    run = paragraph.add_run("第 ")
    set_run_font(run, size=8, color=MUTED)
    fld_char_1 = OxmlElement("w:fldChar")
    fld_char_1.set(qn("w:fldCharType"), "begin")
    instr_text = OxmlElement("w:instrText")
    instr_text.set(qn("xml:space"), "preserve")
    instr_text.text = " PAGE "
    fld_char_2 = OxmlElement("w:fldChar")
    fld_char_2.set(qn("w:fldCharType"), "end")
    run._r.extend([fld_char_1, instr_text, fld_char_2])
    tail = paragraph.add_run(" 页")
    set_run_font(tail, size=8, color=MUTED)


def strip_inline_markup(text: str) -> str:
    text = re.sub(r"\*\*(.*?)\*\*", r"\1", text)
    text = re.sub(r"`([^`]+)`", r"\1", text)
    return text.strip()


def configure_styles(doc: Document) -> None:
    normal = doc.styles["Normal"]
    normal.font.name = BODY_FONT
    normal._element.rPr.rFonts.set(qn("w:ascii"), BODY_FONT)
    normal._element.rPr.rFonts.set(qn("w:hAnsi"), BODY_FONT)
    normal._element.rPr.rFonts.set(qn("w:eastAsia"), BODY_FONT)
    normal.font.size = Pt(10)
    normal.font.color.rgb = RGBColor.from_string(INK)
    normal.paragraph_format.space_after = Pt(5)
    normal.paragraph_format.line_spacing = 1.3

    for style_name, size, color, before, after in (
        ("Title", 28, LEAF, 0, 10),
        ("Heading 1", 17, LEAF, 12, 6),
        ("Heading 2", 13, INK, 9, 4),
    ):
        style = doc.styles[style_name]
        style.font.name = BODY_FONT
        style._element.rPr.rFonts.set(qn("w:ascii"), BODY_FONT)
        style._element.rPr.rFonts.set(qn("w:hAnsi"), BODY_FONT)
        style._element.rPr.rFonts.set(qn("w:eastAsia"), BODY_FONT)
        style.font.size = Pt(size)
        style.font.color.rgb = RGBColor.from_string(color)
        style.font.bold = True
        style.paragraph_format.space_before = Pt(before)
        style.paragraph_format.space_after = Pt(after)
        style.paragraph_format.keep_with_next = True

    for style_name in ("List Bullet", "List Number"):
        style = doc.styles[style_name]
        style.font.name = BODY_FONT
        style._element.rPr.rFonts.set(qn("w:ascii"), BODY_FONT)
        style._element.rPr.rFonts.set(qn("w:hAnsi"), BODY_FONT)
        style._element.rPr.rFonts.set(qn("w:eastAsia"), BODY_FONT)
        style.font.size = Pt(10)
        style.font.color.rgb = RGBColor.from_string(INK)
        style.paragraph_format.left_indent = Cm(0.7)
        style.paragraph_format.first_line_indent = Cm(-0.35)
        style.paragraph_format.space_after = Pt(3)


def add_cover(doc: Document, lines: list[str]) -> None:
    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.LEFT
    p.paragraph_format.space_after = Pt(38)
    p.add_run().add_picture(str(LOGO), width=Cm(5.2))

    title = doc.add_paragraph(style="Title")
    title.paragraph_format.space_before = Pt(18)
    title.add_run(strip_inline_markup(lines[0].lstrip("# ")))

    subtitle = doc.add_paragraph()
    subtitle.paragraph_format.space_after = Pt(14)
    run = subtitle.add_run("电子宠物学习陪伴产品 · 开发与验收基线")
    set_run_font(run, size=13, color=MUTED)

    rule = doc.add_table(rows=1, cols=1)
    rule.alignment = WD_TABLE_ALIGNMENT.LEFT
    rule.autofit = False
    rule.columns[0].width = Cm(10.8)
    cell = rule.cell(0, 0)
    set_cell_shading(cell, SUN)
    cell.text = ""
    cell.height = Cm(0.1)

    meta = doc.add_table(rows=0, cols=2)
    meta.alignment = WD_TABLE_ALIGNMENT.LEFT
    meta.autofit = False
    for raw in lines[1:]:
        if not raw.strip():
            continue
        key, _, value = raw.replace("  ", "").partition("：")
        cells = meta.add_row().cells
        cells[0].width = Cm(2.4)
        cells[1].width = Cm(10.3)
        cells[0].text = key
        cells[1].text = value
        for index, table_cell in enumerate(cells):
            set_cell_margins(table_cell, top=70, bottom=70)
            for paragraph in table_cell.paragraphs:
                for run in paragraph.runs:
                    set_run_font(run, size=9.5, bold=index == 0, color=LEAF if index == 0 else INK)

    p_img = doc.add_paragraph()
    p_img.alignment = WD_ALIGN_PARAGRAPH.RIGHT
    p_img.paragraph_format.space_before = Pt(28)
    p_img.add_run().add_picture(str(TURTLE), width=Cm(5.0))

    tag = doc.add_paragraph()
    tag.alignment = WD_ALIGN_PARAGRAPH.RIGHT
    run = tag.add_run("温和 · 好奇 · 一起慢慢进步")
    set_run_font(run, size=10, bold=True, color=LEAF)
    doc.add_page_break()


def add_table(doc: Document, raw_rows: list[str]) -> None:
    rows = []
    for raw in raw_rows:
        values = [strip_inline_markup(value) for value in raw.strip().strip("|").split("|")]
        if all(re.fullmatch(r":?-{3,}:?", value.replace(" ", "")) for value in values):
            continue
        rows.append(values)
    if not rows:
        return

    columns = max(len(row) for row in rows)
    table = doc.add_table(rows=1, cols=columns)
    table.alignment = WD_TABLE_ALIGNMENT.CENTER
    table.autofit = True
    table.style = "Table Grid"
    set_repeat_table_header(table.rows[0])

    for col, value in enumerate(rows[0]):
        cell = table.rows[0].cells[col]
        cell.text = value
        set_cell_shading(cell, LEAF)
        cell.vertical_alignment = WD_CELL_VERTICAL_ALIGNMENT.CENTER
        set_cell_margins(cell)
        for paragraph in cell.paragraphs:
            for run in paragraph.runs:
                set_run_font(run, size=8.5, bold=True, color=WHITE)

    for row_index, values in enumerate(rows[1:], start=1):
        row = table.add_row()
        set_keep_together(row)
        for col in range(columns):
            cell = row.cells[col]
            cell.text = values[col] if col < len(values) else ""
            set_cell_shading(cell, PALE if row_index % 2 else WHITE)
            cell.vertical_alignment = WD_CELL_VERTICAL_ALIGNMENT.CENTER
            set_cell_margins(cell)
            for paragraph in cell.paragraphs:
                paragraph.paragraph_format.space_after = Pt(0)
                paragraph.paragraph_format.line_spacing = 1.1
                for run in paragraph.runs:
                    set_run_font(run, size=8.3, color=INK)
    doc.add_paragraph().paragraph_format.space_after = Pt(1)


def add_code_callout(doc: Document, text: str) -> None:
    table = doc.add_table(rows=1, cols=1)
    table.alignment = WD_TABLE_ALIGNMENT.CENTER
    cell = table.cell(0, 0)
    set_cell_shading(cell, MINT)
    set_cell_margins(cell, top=120, bottom=120, start=160, end=160)
    paragraph = cell.paragraphs[0]
    paragraph.paragraph_format.space_after = Pt(0)
    run = paragraph.add_run(strip_inline_markup(text))
    set_run_font(run, name="SF Mono", size=8.8, bold=True, color=LEAF)


def add_restarted_numbering(doc: Document, paragraph, num_id: int | None = None) -> int:
    if num_id is None:
        style_num_id = int(doc.styles["List Number"]._element.xpath("./w:pPr/w:numPr/w:numId")[0].get(qn("w:val")))
        numbering = doc.part.numbering_part.element
        base_num = next(
            item for item in numbering.findall(qn("w:num"))
            if int(item.get(qn("w:numId"))) == style_num_id
        )
        abstract_num_id = base_num.find(qn("w:abstractNumId")).get(qn("w:val"))
        num_id = max(int(item.get(qn("w:numId"))) for item in numbering.findall(qn("w:num"))) + 1

        num = OxmlElement("w:num")
        num.set(qn("w:numId"), str(num_id))
        abstract = OxmlElement("w:abstractNumId")
        abstract.set(qn("w:val"), abstract_num_id)
        num.append(abstract)
        override = OxmlElement("w:lvlOverride")
        override.set(qn("w:ilvl"), "0")
        start = OxmlElement("w:startOverride")
        start.set(qn("w:val"), "1")
        override.append(start)
        num.append(override)
        numbering.append(num)

    num_pr = OxmlElement("w:numPr")
    level = OxmlElement("w:ilvl")
    level.set(qn("w:val"), "0")
    direct_num_id = OxmlElement("w:numId")
    direct_num_id.set(qn("w:val"), str(num_id))
    num_pr.extend([level, direct_num_id])
    paragraph._p.get_or_add_pPr().append(num_pr)
    return num_id


def add_body(doc: Document, lines: list[str]) -> None:
    index = 0
    active_numbering_id = None
    while index < len(lines):
        raw = lines[index].rstrip()
        stripped = raw.strip()
        if not stripped:
            index += 1
            continue
        if stripped.startswith("|"):
            active_numbering_id = None
            table_lines = []
            while index < len(lines) and lines[index].strip().startswith("|"):
                table_lines.append(lines[index])
                index += 1
            add_table(doc, table_lines)
            continue
        if stripped.startswith("## "):
            active_numbering_id = None
            if stripped == "## 17. 本轮迭代结论":
                doc.add_page_break()
            paragraph = doc.add_paragraph(style="Heading 1")
            paragraph.add_run(strip_inline_markup(stripped[3:]))
        elif stripped.startswith("### "):
            active_numbering_id = None
            paragraph = doc.add_paragraph(style="Heading 2")
            paragraph.add_run(strip_inline_markup(stripped[4:]))
        elif stripped.startswith("- "):
            active_numbering_id = None
            paragraph = doc.add_paragraph(style="List Bullet")
            paragraph.add_run(strip_inline_markup(stripped[2:]))
        elif re.match(r"^\d+\.\s", stripped):
            paragraph = doc.add_paragraph(style="List Number")
            active_numbering_id = add_restarted_numbering(doc, paragraph, active_numbering_id)
            paragraph.add_run(strip_inline_markup(re.sub(r"^\d+\.\s", "", stripped)))
        elif stripped.startswith("`") and stripped.endswith("`"):
            active_numbering_id = None
            add_code_callout(doc, stripped)
        else:
            active_numbering_id = None
            paragraph = doc.add_paragraph()
            paragraph.add_run(strip_inline_markup(stripped))
        index += 1


def add_headers_and_footers(doc: Document) -> None:
    for section in doc.sections:
        section.top_margin = Cm(1.75)
        section.bottom_margin = Cm(1.55)
        section.left_margin = Cm(1.8)
        section.right_margin = Cm(1.8)
        section.header_distance = Cm(0.65)
        section.footer_distance = Cm(0.65)
        section.different_first_page_header_footer = True

        header = section.header.paragraphs[0]
        header.alignment = WD_ALIGN_PARAGRAPH.LEFT
        run = header.add_run("龟龟伴读  /  V1.4 产品需求文档")
        set_run_font(run, size=8, bold=True, color=LEAF)
        p_pr = header._p.get_or_add_pPr()
        bottom_border = OxmlElement("w:pBdr")
        border = OxmlElement("w:bottom")
        border.set(qn("w:val"), "single")
        border.set(qn("w:sz"), "6")
        border.set(qn("w:space"), "4")
        border.set(qn("w:color"), "B8D6BF")
        bottom_border.append(border)
        p_pr.append(bottom_border)

        add_page_number(section.footer.paragraphs[0])


def register_body_font(path: Path) -> None:
    """Add the selected CJK font to the DOCX font table for LibreOffice parity."""
    with tempfile.NamedTemporaryFile(dir=path.parent, suffix=".docx", delete=False) as handle:
        temp_path = Path(handle.name)

    try:
        with ZipFile(path, "r") as source, ZipFile(temp_path, "w", ZIP_DEFLATED) as target:
            for item in source.infolist():
                data = source.read(item.filename)
                if item.filename == "word/fontTable.xml":
                    root = ET.fromstring(data)
                    font_name = f"{{{WORD_NS}}}name"
                    if not any(node.get(font_name) == BODY_FONT for node in root):
                        font = ET.SubElement(root, f"{{{WORD_NS}}}font", {font_name: BODY_FONT})
                        ET.SubElement(font, f"{{{WORD_NS}}}charset", {f"{{{WORD_NS}}}val": "86"})
                        ET.SubElement(font, f"{{{WORD_NS}}}family", {f"{{{WORD_NS}}}val": "swiss"})
                        ET.SubElement(font, f"{{{WORD_NS}}}pitch", {f"{{{WORD_NS}}}val": "variable"})
                    data = ET.tostring(root, encoding="utf-8", xml_declaration=True)
                target.writestr(item, data)
        temp_path.replace(path)
    finally:
        temp_path.unlink(missing_ok=True)


def main() -> None:
    lines = SOURCE.read_text(encoding="utf-8").splitlines()
    first_heading = next(i for i, line in enumerate(lines) if line.startswith("## "))
    cover_lines = lines[:first_heading]
    body_lines = lines[first_heading:]

    doc = Document()
    configure_styles(doc)
    add_headers_and_footers(doc)
    add_cover(doc, cover_lines)
    add_body(doc, body_lines)

    doc.core_properties.title = "龟龟伴读 V1.4 产品需求文档"
    doc.core_properties.subject = "电子宠物学习陪伴产品开发与验收基线"
    doc.core_properties.author = "龟龟伴读产品组"
    doc.core_properties.keywords = "龟龟伴读, 电子宠物, 阅读, 儿童陪伴, PRD"
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    doc.save(OUTPUT)
    register_body_font(OUTPUT)
    print(OUTPUT)


if __name__ == "__main__":
    main()
