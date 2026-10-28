"""Bounded local extraction. Original files exist only in a private temp folder."""
import io
import os
from pathlib import Path
import re
import subprocess
import sys
import tempfile
import time
import unicodedata
import uuid
import zipfile
import xml.etree.ElementTree as ET

MAX_BYTES = 10 * 1024 * 1024
MAX_TEXT = 18000
EXTENSIONS = {'.pdf', '.png', '.jpg', '.jpeg', '.webp', '.docx', '.xlsx', '.pptx', '.txt', '.csv'}
MIMES = {'.pdf':'application/pdf', '.png':'image/png', '.jpg':'image/jpeg', '.jpeg':'image/jpeg', '.webp':'image/webp', '.docx':'application/vnd.openxmlformats-officedocument.wordprocessingml.document', '.xlsx':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', '.pptx':'application/vnd.openxmlformats-officedocument.presentationml.presentation', '.txt':'text/plain', '.csv':'text/csv'}


class ExtractionError(ValueError):
    pass


def safe_name(name):
    name = unicodedata.normalize('NFC', str(name).replace('\\', '/').split('/')[-1])
    name = ''.join(c for c in name if ord(c) >= 32 and ord(c) != 127).strip()
    suffix=Path(name).suffix
    if len(name)>160 and len(suffix)<=10:
        name=name[:160-len(suffix)]+suffix
    return name[:160] or 'document'


def clean_text(text):
    return re.sub(r'\n{4,}', '\n\n\n', re.sub(r'[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]', '', text)).strip()


def xml(raw):
    if len(raw) > 8_000_000 or re.search(br'<!DOCTYPE|<!ENTITY', raw, re.I):
        raise ExtractionError('Документ содержит неподдерживаемую структуру XML.')
    try:
        return ET.fromstring(raw)
    except ET.ParseError as error:
        raise ExtractionError('Не удалось прочитать структуру документа.') from error


def office_zip(data):
    try:
        archive = zipfile.ZipFile(io.BytesIO(data))
        entries = archive.infolist()
        if len(entries) > 2000 or sum(e.file_size for e in entries) > 50_000_000 or any(e.flag_bits & 1 for e in entries):
            raise ExtractionError('Документ слишком сложный или защищён паролем.')
        return archive
    except (zipfile.BadZipFile, RuntimeError) as error:
        raise ExtractionError('Файл повреждён или не соответствует указанному формату.') from error


def limited_command(args, deadline):
    remaining = min(35, deadline - time.monotonic())
    if remaining <= 0:
        raise ExtractionError('Распознавание заняло слишком много времени. Загрузите меньше страниц.')
    try:
        with tempfile.TemporaryFile() as output:
            result = subprocess.run([sys.executable, str(Path(__file__).with_name('limit_exec.py')), *map(str, args)], stdout=output, stderr=subprocess.DEVNULL, timeout=remaining, env={**os.environ, 'OMP_THREAD_LIMIT':'1'})
            output.seek(0)
            captured = output.read(2_000_001)
    except subprocess.TimeoutExpired as error:
        raise ExtractionError('Распознавание заняло слишком много времени. Попробуйте более чёткое фото или меньше страниц.') from error
    if result.returncode:
        raise ExtractionError('Не удалось распознать файл. Проверьте, что он открывается и не защищён паролем.')
    if len(captured) > 2_000_000:
        raise ExtractionError('В документе слишком много текста. Загрузите нужные страницы отдельно.')
    return captured.decode('utf-8', errors='replace')


def ocr_image(path, directory, deadline):
    from PIL import Image, ImageOps
    Image.MAX_IMAGE_PIXELS = 20_000_000
    try:
        with Image.open(path) as image:
            if image.format not in {'JPEG', 'PNG', 'WEBP'}:
                raise ExtractionError('Поддерживаются фотографии JPG, PNG и WebP.')
            if image.width * image.height > 20_000_000:
                raise ExtractionError('Изображение больше 20 мегапикселей.')
            image = ImageOps.exif_transpose(image)
            image.thumbnail((2600, 2600))
            if image.mode == 'RGBA':
                background = Image.new('RGB', image.size, 'white')
                background.paste(image, mask=image.getchannel('A'))
                image = background
            else:
                image = image.convert('RGB')
            normalized = directory / ('ocr-' + uuid.uuid4().hex + '.png')
            image.save(normalized)
    except (Image.DecompressionBombError, Image.DecompressionBombWarning, OSError, ValueError) as error:
        raise ExtractionError('Изображение повреждено или слишком большое. Используйте JPG/PNG/WebP до 20 мегапикселей.') from error
    return limited_command(['tesseract', normalized, 'stdout', '-l', 'rus+eng', '--psm', '3'], deadline)


def extract_attachment(data, original_name):
    name = safe_name(original_name)
    ext = Path(name).suffix.lower()
    if ext not in EXTENSIONS:
        raise ExtractionError('Поддерживаются JPG, PNG, WebP, PDF, DOCX, XLSX, PPTX, TXT и CSV. HEIC, DOC и XLS сохраните в одном из этих форматов.')
    if not data or len(data) > MAX_BYTES:
        raise ExtractionError('Файл пустой или больше 10 МБ.')
    warnings = []
    pages = None
    method = 'text'
    deadline = time.monotonic() + 95
    with tempfile.TemporaryDirectory(prefix='fot-attachment-') as temporary:
        directory = Path(temporary)
        path = directory / ('input' + ext)
        path.write_bytes(data)
        if ext in {'.png', '.jpg', '.jpeg', '.webp'}:
            method = 'ocr'
            text = ocr_image(path, directory, deadline)
        elif ext == '.pdf':
            if not data.startswith(b'%PDF-'):
                raise ExtractionError('Файл не является PDF.')
            info = limited_command(['pdfinfo', path], deadline)
            match = re.search(r'^Pages:\s+(\d+)', info, re.M)
            pages = int(match.group(1)) if match else None
            text = limited_command(['pdftotext', '-f', '1', '-l', '20', '-layout', '-enc', 'UTF-8', path, '-'], deadline)
            if len(clean_text(text)) < 80:
                method = 'ocr'
                last = min(pages or 6, 6)
                limited_command(['pdftoppm', '-f', '1', '-l', str(last), '-scale-to', '2000', '-png', path, directory / 'page'], deadline)
                text = '\n\n'.join(ocr_image(image, directory, deadline) for image in sorted(directory.glob('page-*.png')))
                if pages and pages > last:
                    warnings.append('Распознаны первые 6 страниц скана. Остальные загрузите отдельно.')
            elif pages and pages > 20:
                warnings.append('Прочитаны первые 20 страниц PDF. Остальные загрузите отдельно.')
            if method=='text':
                warnings.append('Прочитан текстовый слой PDF. Если условия находятся на сканах или картинках, приложите эти страницы отдельно как фото.')
        elif ext in {'.docx', '.pptx'}:
            with office_zip(data) as archive:
                if ext == '.docx':
                    if 'word/document.xml' not in archive.namelist():
                        raise ExtractionError('В файле нет документа Word.')
                    root = xml(archive.read('word/document.xml'))
                    paragraphs = root.findall('.//{http://schemas.openxmlformats.org/wordprocessingml/2006/main}p')
                    text = '\n'.join(''.join(p.itertext()) for p in paragraphs)
                else:
                    names = sorted((n for n in archive.namelist() if re.fullmatch(r'ppt/slides/slide\d+\.xml', n)), key=lambda n:int(re.search(r'(\d+)\.xml$', n).group(1)))
                    if not names:
                        raise ExtractionError('В файле нет слайдов PowerPoint.')
                    pages = len(names)
                    text = '\n\n'.join('Слайд '+str(i+1)+'\n'+'\n'.join(xml(archive.read(n)).itertext()) for i,n in enumerate(names[:20]))
                    if len(names) > 20:
                        warnings.append('Прочитаны первые 20 слайдов. Текст внутри картинок на слайдах не распознаётся.')
                    else:
                        warnings.append('Текст внутри картинок на слайдах не распознаётся.')
        elif ext == '.xlsx':
            with office_zip(data) as archive:
                if 'xl/workbook.xml' not in archive.namelist():
                    raise ExtractionError('В файле нет книги Excel.')
                for entry in archive.infolist():
                    if entry.filename.endswith('.xml'):
                        xml(archive.read(entry))
            import openpyxl
            book = openpyxl.load_workbook(io.BytesIO(data), read_only=True, data_only=False, keep_links=False)
            lines = []
            try:
                for sheet in book.worksheets[:8]:
                    lines.append('Лист: '+sheet.title)
                    for row in sheet.iter_rows(max_row=500, max_col=30):
                        values = []
                        for cell in row:
                            value = cell.value
                            if cell.data_type == 'f':
                                values.append('[Формула не рассчитана]')
                                if 'Формулы Excel не пересчитываются; проверьте значения в исходном файле.' not in warnings:
                                    warnings.append('Формулы Excel не пересчитываются; проверьте значения в исходном файле.')
                            elif isinstance(value, (int, float)) and '%' in cell.number_format:
                                values.append(f'{value * 100:g}%')
                            else:
                                values.append('' if value is None else str(value))
                        if any(values):
                            lines.append(' | '.join(values))
                        if sum(map(len, lines)) > MAX_TEXT * 2:
                            break
                text = '\n'.join(lines)
                warnings.append('Обработаны до 8 листов, 500 строк и 30 столбцов на лист. Проверьте соответствие ставок и условий столбцам.')
            finally:
                book.close()
        else:
            if b'\x00' in data:
                raise ExtractionError('Файл не похож на текстовый документ.')
            try:
                text = data.decode('utf-8-sig')
            except UnicodeDecodeError:
                text = data.decode('cp1251', errors='replace')
        text = clean_text(text)
        if len(text) < 8:
            raise ExtractionError('Не удалось прочитать условия. Попробуйте более чёткое фото или PDF с текстовым слоем.')
        truncated = len(text) > MAX_TEXT
        if truncated:
            warnings.append('Текст сокращён до 18 000 символов. При необходимости загрузите нужные страницы отдельно.')
        if method == 'ocr':
            warnings.insert(0, 'Текст распознан с изображения. Проверьте ставки, лимиты, даты и соответствие строк таблицы перед отправкой.')
        return {'id':uuid.uuid4().hex, 'name':name, 'mime':MIMES[ext], 'size':len(data), 'text':text[:MAX_TEXT], 'method':method, 'pages':pages, 'truncated':truncated, 'warnings':warnings}
