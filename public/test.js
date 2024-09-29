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

            const chatCompletion = await groq.chat.completions.create({
                "messages": [
                    {
                        "role": "system",
                        "content": neededText
                    },
                    {
                        "role": "user",
                        "content": Question + " Ответьте НА РУССКОМ ЯЗЫКЕ БЕЗ ГАЛЮЦИНАЦИЙ ИЛИ ВЫДУМАННОЙ ИНФОРМАЦИИ"
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


async function smartSearch(question = ""){
    const chatCompletion = await groq.chat.completions.create({
        "messages": [
            {
                "role": "system",
                "content": "JSON. Вы полезный ассистент. Ваши ответы всегда ПРАВИЛЬНЫ, без ошибок, понятны каждому и с красиво оформлены. Вы говорите на том языке, на котором просит пользователь. В ответах, сами не предоставляйте информацию, которую НЕ ЗНАЕТЕ на 100%. Ваши ответы - как бы УЛУЧШЕННЫЙ google поиск в ИНТЕРНЕТЕ, но КАК КРАСИВО ОФОРМЛЕННАЯ СТАТЬЯ. В поле \"action\" напишите массив действий из списка (часть ответа), в поле \"name\" - название действия, в поле у каждого действия \"args\" напишите массив строковых аргументов к действию. ПРИМЕР КОМАНД (имён действий действий), КОТОРЫЕ ВАМ СТОИТ ИСПОЛЬЗОВАТЬ: \n" +
                    "\n" +
                    "\"text\" - в аргументах строка с текстом (обычный, текст, которые вы сами напишите)\n" +
                    "\"page qe\" - в первом строковом аргументе напишите поисковой запрос в google, во втором строковом аргументе напишите вопрос на который нужно ответить (ищет в google ответ веб-страницу, затем кратко объясняет, что в ней говорится, используйте, когда НЕ ЗНАЕТЕ на 100% что-то (каждый повторяющийся запрос берутся другие страницы) (лучше использовать и перестраховаться))\n" +
                    "\"image\" - в аргументах напишите на какую тему картинка (если вписать !page, то будет картинка из предыдущей веб-страницы page summory или page qe), сколько строковых аргументов, столько и картинок в линии (картинка из интернета на определённую тему)\n" +
                    "\n" +
                    "Пример вашего ответа:\n" +
                    "\n" +
                    "{\n" +
                    "  \"actions\": [\n" +
                    "    {\n" +
                    "      \"name\": \"text\",\n" +
                    "      \"args\": \"Вот несколько бесплатных хостингов для node.js:\"\n" +
                    "    },\n" +
                    "    {\n" +
                    "      \"name\": \"page qe\",\n" +
                    "      \"args\": [\"Free node.js hosting list\", \"Список бесплатных хостингов node.js\"]\n" +
                    "    },\n" +
                    "    {\n" +
                    "      \"name\": \"image\",\n" +
                    "      \"args\": [\"!page\"]\n" +
                    "    },\n" +
                    "    {\n" +
                    "      \"name\": \"image\",\n" +
                    "      \"args\": [\"!page\"]\n" +
                    "    },\n" +
                    "    {\n" +
                    "      \"name\": \"text\",\n" +
                    "      \"args\": [\"Выбирайте по своему усмотрению, но по данным интернета лучшим хостингом является:\"]\n" +
                    "    },\n" +
                    "    {\n" +
                    "      \"name\": \"page qe\",\n" +
                    "      \"args\": [\"Best free node.js hosting\", \"Какой лучший хостинг minecraft\"]\n" +
                    "    }\n" +
                    "  ]\n" +
                    "}\n" +
                    "\n" +
                    "Ваши ответы должны быть поняты человеку с образованием: \"8 класс среднеобразовательной школы\""
            },
            {
                "role": "user",
                "content": "Какие лучшие бесплатные хостинги Minecraft?"
            }
        ],
        "model": "llama-3.2-90b-text-preview",
        "temperature": 0.7,
        "max_tokens": 1024,
        "top_p": 0.7,
        "stream": false,
        "response_format": {
            "type": "json_object"
        },
        "stop": null
    });

    const content = JSON.parse(chatCompletion.choices[0].message.content);
    const actions = content.actions;

    let wordCount = 0;

    for (const action of actions){
        if (action.name === "page qe"){
            wordCount++
        }
    }

    wordCount = 6474 / wordCount;

    for await (const action of actions){
        if (action.name === "text"){
            for (const text of action.args){
                console.log(text)
            }
        }
        else if (action.name === "page qe"){
            await pageSummary(action.args[0], action.args[1], wordCount);
        }
    }
}

smartSearch("Какие лучшие бесплатные хостинги Minecraft?")
