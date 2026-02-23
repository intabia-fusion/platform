#!/bin/bash

# Настройки
SEARCH_DIR="${1:-.}"  # Берем папку из аргумента или текущую
BROTLI_QUALITY=11     # Максимальное сжатие (1-11)

# Проверка наличия утилиты brotli
if ! command -v brotli &> /dev/null; then
    echo "❌ Ошибка: Утилита 'brotli' не найдена."
    echo "Установите её через Homebrew: brew install brotli"
    exit 1
fi

echo "🔍 Папка для сканирования: $SEARCH_DIR"
echo "⚙️  Качество сжатия Brotli: $BROTLI_QUALITY (максимум)"
echo "-------------------------------------------------------------------"
printf "%-30s | %-12s | %-12s | %-10s\n" "Файл" "Gzip (bytes)" "Brotli (bytes)" "Экономия"
echo "-------------------------------------------------------------------"

# Цикл по всем .gz файлам
found_files=0
for gz_file in "$SEARCH_DIR"/*.js.gz; do
    # Проверка, есть ли такие файлы вообще (защита от ошибки "no matches found")
    [ -e "$gz_file" ] || continue

    # Получаем имя оригинального .js файла (убираем .gz с конца)
    js_file="${gz_file%.gz}"

    # Если оригинальный .js файл существует
    if [[ -f "$js_file" ]]; then
        ((found_files++))

        # Формируем имя будущего .br файла
        br_file="${js_file}.br"

        # Сжимаем в Brotli.
        # -k : keep (сохранить оригинальный .js файл)
        # -f : force (перезаписать .br, если уже есть)
        # -q $BROTLI_QUALITY : качество сжатия
        brotli -k -f -q $BROTLI_QUALITY "$js_file"

        # Получаем размеры файлов
        size_gz=$(stat -f%z "$gz_file")
        size_br=$(stat -f%z "$br_file")

        # Считаем процент экономии (сколько места сэкономили относительно gzip)
        # Используем awk для математики с плавающей точкой
        saving=$(awk "BEGIN {printf \"%.2f\", (($size_gz - $size_br) / $size_gz) * 100}")

        # Выводим строку таблицы
        filename=$(basename "$js_file")
        printf "%-30s | %-12d | %-12d | %s%%\n" "$filename" "$size_gz" "$size_br" "$saving"

        # Удаляем созданный .br файл, чтобы не мусорить (так как это тест)
        rm "$br_file"
    fi
done

if [[ $found_files -eq 0 ]]; then
    echo "⚠️  Не найдено пар файлов (.js и .js.gz) в указанной папке."
else
    echo "-------------------------------------------------------------------"
    echo "✅ Тест завершен для $found_files файлов."
fi
