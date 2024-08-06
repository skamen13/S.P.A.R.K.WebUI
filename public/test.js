async function processText(text) {
    // Удаляем все слова в звёздочках и скобках
    text = text.replace(/(\*.*?\*)|(\(.*?\))|(\[.*?\])/g, "");

    // Удаляем все звёздочки, кавычки и скобки
    text = text.replace(/[\*"'\(\)\[\]]/g, "");

    // Переводим текст на русский язык
    text = await translateToRussian(text);

    return text;
}

async function translateToRussian(text) {
    const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=en|ru`;

    try {
        const response = await fetch(url);
        const data = await response.json();
        return data.responseData.translatedText;
    } catch (error) {
        console.error("Ошибка перевода:", error);
        return text; // Возвращаем оригинальный текст в случае ошибки
    }
}

// Пример использования
(async () => {
    const originalText = "This is an example with *stars*, (parentheses), and [brackets].";
    const processedText = await processText(originalText);
    console.log(processedText);
})();
