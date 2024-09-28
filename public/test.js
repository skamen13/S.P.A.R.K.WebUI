const axios = require("axios");
const {convert} = require("html-to-text");
const https = require("https");
const {gwsearch} = require("nayan-server");
const DDG = require("duck-duck-scrape");
const puppeteer = require('puppeteer');
const translate = require('@iamtraction/google-translate');
const Groq = require('groq-sdk');

const groq = new Groq({
    apiKey: "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"
});

async function getVisibleTextFromUrl(url) {
    // Запуск Puppeteer в headless-режиме
    const browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();

    try {
        // Переход по URL
        await page.goto(url, { waitUntil: 'networkidle2' });

        // Получение видимого текста
        const visibleText = await page.evaluate(() => {
            // Находим все элементы, кроме невидимых
            let body = document.querySelector('body');
            let texts = [];

            function getTextFromNode(node) {
                // Получаем текст только из видимых узлов
                if (node.nodeType === Node.TEXT_NODE && node.nodeValue.trim() !== '') {
                    texts.push(node.nodeValue.trim());
                } else if (node.nodeType === Node.ELEMENT_NODE && window.getComputedStyle(node).display !== 'none') {
                    for (let child of node.childNodes) {
                        getTextFromNode(child);
                    }
                }
            }

            getTextFromNode(body);
            return texts.join(' ').trim();
        });

        return visibleText;
    } catch (error) {
        console.error(`Ошибка при получении страницы: ${error.message}`);
        return null;
    } finally {
        // Закрытие браузера после выполнения
        await browser.close();
    }
}

const agent = new https.Agent({ rejectUnauthorized: false });

function levenshtein(a, b) {
    const matrix = [];

    for (let i = 0; i <= b.length; i++) {
        matrix[i] = [i];
    }

    for (let j = 0; j <= a.length; j++) {
        matrix[0][j] = j;
    }

    for (let i = 1; i <= b.length; i++) {
        for (let j = 1; j <= a.length; j++) {
            if (b.charAt(i - 1) === a.charAt(j - 1)) {
                matrix[i][j] = matrix[i - 1][j - 1];
            } else {
                matrix[i][j] = Math.min(
                    matrix[i - 1][j - 1] + 1, // Замена
                    Math.min(matrix[i][j - 1] + 1, // Вставка
                        matrix[i - 1][j] + 1) // Удаление
                );
            }
        }
    }

    return matrix[b.length][a.length];
}

// Функция для поиска наиболее похожей строки и продолжения текста
function findClosestAndExtend(mainText, searchText, wordCount) {
    const mainWords = mainText.split(/\s+/);
    let bestMatchIndex = -1;
    let bestDistance = Infinity;

    // Поиск самой похожей подстроки по расстоянию Левенштейна
    for (let i = 0; i <= mainWords.length - searchText.split(/\s+/).length; i++) {
        const candidate = mainWords.slice(i, i + searchText.split(/\s+/).length).join(' ');
        const distance = levenshtein(candidate.toLowerCase(), searchText.toLowerCase());

        if (distance < bestDistance) {
            bestDistance = distance;
            bestMatchIndex = i;
        }
    }

    if (bestMatchIndex === -1) {
        return "Похожая строка не найдена";
    }

    // Захватываем нужное количество слов после совпадения
    const resultWords = mainWords.slice(bestMatchIndex, bestMatchIndex + searchText.split(/\s+/).length + wordCount).join(' ');

    return resultWords;
}

async function answerFromURL(url =  "https://interneturok.ru/lesson/algebra/8-klass/algebraicheskie-drobi-arifmeticheskie-operacii-nad-algebraicheskimi-drobyami/praktika-vidy-chisel-uproschenie-ratsionalnyh-vyrazheniy", description = "1. Дробь можно упростить, разложив на множители ее числитель и знаменатель и сократив одинаковые множители: 2. Для сложения и вычитания дробей нужно привести их ..."){

    let allExcerpts = "";

    try {
        const response = await axios.get(url, { httpsAgent: agent });
        const html = response.data;

        allExcerpts = convert(html, {
            wordwrap: 130 // Ширина строки (можно настроить)
        });

    } catch (error) {
        //socket.emit('smart_search_answer', 'Error fetching the page:' + error);
        console.error('Error fetching the page:', error);
        return "";
    }

    if (allExcerpts === "")
    {
        return "";
    }

    const outputText = findClosestAndExtend(allExcerpts, description, 400);

    console.log(outputText)
    return outputText;
}

async function searchDuckLinks(query = "") {
    const searchResults = await DDG.search(query, {
        safeSearch: DDG.SafeSearchType.STRICT
    });

    console.log(searchResults.results);

    return searchResults.results;
}

async function query(data) {
    const response = await fetch(
        "https://api-inference.huggingface.co/models/deepset/roberta-base-squad2",
        {
            headers: {
                Authorization: "Bearer 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",
                "Content-Type": "application/json",
            },
            method: "POST",
            body: JSON.stringify(data),
        }
    );
    const result = await response.json();
    return result;
}

function sliceStringByWords(str, startIdx, wordCount) {
    // Обрезаем строку начиная с указанного индекса символа
    let slicedStr = str.slice(startIdx);

    // Разбиваем строку на слова
    let words = slicedStr.split(/\s+/).filter(word => word.length > 0);

    // Обрезаем до указанного количества слов
    let selectedWords = words.slice(0, wordCount);

    // Возвращаем строку из выбранных слов
    return selectedWords.join(' ');
}

async function pageSummary(request = "prove expression does not depend on x", Question = "How to prove that an expression does not depend on x", maxWords = 3237){
    const searchResult = await searchDuckLinks(request);
    console.log(searchResult[0].url)

    try {
        getVisibleTextFromUrl(searchResult[0].url).then(async text => {
            let neededText = "Похожая строка не найдена"

            let i = -1

            while (neededText === "Похожая строка не найдена" && i < searchResult.length)
            {
                i++;
                neededText = findClosestAndExtend(text, searchResult[i].description, maxWords)
            }

            console.log(neededText)

            const chatCompletion = await groq.chat.completions.create({
                "messages": [
                    {
                        "role": "system",
                        "content": neededText
                    },
                    {
                        "role": "user",
                        "content": Question + " Ответьте НА РУССКОМ ЯЗЫКЕ"
                    }
                ],
                "model": "llama-3.1-8b-instant",
                "temperature": 0.5,
                "max_tokens": 1024,
                "top_p": 0.7,
                "stream": true,
                "stop": null
            });

            for await (const chunk of chatCompletion) {
                process.stdout.write(chunk.choices[0]?.delta?.content || '');
            }
        });

    } catch (error) {
        //socket.emit('smart_search_answer', 'Error fetching the page:' + error);
        console.error('Error fetching the page:', error);
        return "";
    }
}

pageSummary()
