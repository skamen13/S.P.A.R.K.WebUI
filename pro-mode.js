const puppeteer = require("puppeteer");
const Groq = require('groq-sdk');
const DDG = require("duck-duck-scrape");
const axios = require('axios');
const cheerio = require('cheerio');
const https = require('https');
const {searchLinks} = require("./smart-search");

const groq = new Groq({
    apiKey: "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"
});

async function getVisibleTextFromUrl(url) {
    try {
        // Настраиваем агент для игнорирования сертификатов
        const agent = new https.Agent({
            rejectUnauthorized: false
        });

        // Получение HTML страницы с отключенной проверкой сертификата
        const response = await axios.get(url, { httpsAgent: agent });
        const html = response.data;

        // Загрузка HTML в cheerio для парсинга
        const $ = cheerio.load(html);

        // Функция для извлечения видимого текста
        const getTextFromElement = (element) => {
            let visibleText = '';

            // Обходим каждый элемент и собираем текст, исключая невидимые элементы
            element.each((i, el) => {
                const $el = $(el);
                // Проверяем, является ли элемент видимым
                if ($el.css('display') !== 'none' && $el.css('visibility') !== 'hidden') {
                    // Добавляем текст из этого элемента
                    visibleText += $el.text().trim() + ' ';
                }
            });

            return visibleText.trim();
        };

        // Извлечение текста из <body>
        const visibleText = getTextFromElement($('body'));

        return visibleText || 'Текст не найден';
    } catch (error) {
        console.error('Ошибка при получении текста с URL:', error);
        return "Ошибка при получении текста";
    }
}

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

    if (mainText === "Похожая строка не найдена"){
        return "Похожая строка не найдена";
    }

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

async function searchDuckLinks(query = "") {
    const searchResults = await DDG.search(query, {
        safeSearch: DDG.SafeSearchType.STRICT
    });

    return searchResults.results;
}

async function basicSearch(query = ""){
    const result = await searchDuckLinks(query);

    if (result && result.length > 0) {

        let answersString = "";

        for (const part of result)
        {
            answersString += "\n - " + part.description
        }

        console.log(answersString)

        return "Вот ответы на вопрос \"" + query + "\", который вы нашли в интернете: " + answersString
    } else {
        console.log("No results found.");
        return "";
    }
}

async function pageSummary(request = "prove expression does not depend on x", Question = "How to prove that an expression does not depend on x", maxWords = 3237, socket) {
    const searchResult = await searchDuckLinks(request);

    try {
        let neededText = "Похожая строка не найдена";
        let i = -1;

        // Этот цикл теперь ожидает завершения асинхронного вызова внутри цикла
        while (neededText === "Похожая строка не найдена" && i < searchResult.length) {
            i++;
            const text = await getVisibleTextFromUrl(searchResult[i].url);
            neededText = findClosestAndExtend(text, searchResult[i].description, maxWords);
        }

        const chatCompletion = await groq.chat.completions.create({
            "messages": [
                {
                    "role": "system",
                    "content": neededText
                },
                {
                    "role": "user",
                    "content": request + " - " + Question + " Ответьте НА РУССКОМ ЯЗЫКЕ БЕЗ ГАЛЮЦИНАЦИЙ ИЛИ ВЫДУМАННОЙ ИНФОРМАЦИИ"
                }
            ],
            "model": "llama-3.1-8b-instant",
            "temperature": 0.5,
            "max_tokens": 1024,
            "top_p": 0.7,
            "stream": true,
            "stop": null
        });

        let finalAnswer = "";

        for await (const chunk of chatCompletion) {
            finalAnswer += chunk.choices[0]?.delta?.content || '';
            socket.emit('ai_answer_chunk', "## Найден ответ на вопрос в интернете:\n" + finalAnswer);
        }

        // Возвращаем результат
        return finalAnswer;

    } catch (error) {
        console.error('Error fetching the page:', error);
        return "";
    }
}


function pause(milliseconds) {
    return new Promise(resolve => setTimeout(resolve, milliseconds));
}


async function smartSearch(question = "", socket){
    const chatCompletion = await groq.chat.completions.create({
        "messages": [
            {
                "role": "system",
                "content": "JSON. Вы полезный ассистент. Ваши ответы всегда ПРАВИЛЬНЫ, без ошибок, понятны каждому и с красиво оформлены. Вы говорите на том языке, на котором просит пользователь. В ответах, сами не предоставляйте информацию, которую НЕ ЗНАЕТЕ на 100%. Ваши ответы как КРАСИВО ОФОРМЛЕННАЯ СТАТЬЯ. В поле \"action\" напишите массив действий из списка (часть ответа), в поле \"name\" - название действия, в поле у каждого действия \"args\" напишите массив строковых аргументов к действию. ПРИМЕР КОМАНД (имён действий действий), КОТОРЫЕ ВАМ СТОИТ ИСПОЛЬЗОВАТЬ: \n" +
                    "\n" +
                    "\"basic info\" - в первом строковом аргументе напишите краткий КОНКРЕТНЫЙ поисковой запрос (Например: \"Сколько лет солнцу?\" или \"Курс доллара\" или \"What is ChatGPT?\" (если нужно искать ответы не только на русских сайтах)) (ваш способ получить быструю базовую информацию, как в примерах. Используйте ЭТО ВСЕГДА, для нахождения ЛЮБОЙ БЫСТРОЙ БАЗОВОЙ ИНФОРМАЦИИ.)\n" +
                    "\n" +
                    "\"research\" - в первом строковом аргументе напишите поисковой запрос (Например: \"лучший процессор за 15 тысяч рублей\" или \"умножение и сокращение дробей с переменными в алгебре\" или \"pixel 9 pro review\" (если нужно искать ответы не только на русских сайтах)), а во втором уже УТОЧНЯЕТЕ ваш КОНКРЕТНЫЙ ВОПРОС (тема, может что выписать, что найти) (ваш способ получить продвинутую качественную информацию, как в примерах. Используйте ЭТО ВСЕГДА, для нахождения ЛЮБОЙ КАЧЕСТВЕННОЙ ИНФОРМАЦИИ. (Выполняется долго, так что используйте грамотно, НЕ БОЛЕЕ ДВУХ РАЗ))\n" +
                    "\n" +
                    "\"math\" -  в первом строковом аргументе напишите любое алгебраическое выражение или линейное уравнение, в правильной форме (решение выражений / уравнений. Можете поставить [результат поиска] для решения выражений в результате поиска)\n" +
                    "\n" +
                    "\"text\" - в аргументах строка с текстом (обычный, текст, которые вы сами напишите, используйте [результат поиска] для отображения последних результатов поиска информации)\n" +
                    "\n" +
                    "И в конце в поле \"format\" напишите ТИП ОФОРМЛЕНИЯ ОТВЕТА (\"no format\" - без оформления, когда вы используете только действие text, \"article\" - красивая и понятная статья, используйте при поиске информации в качестве ответа на вопрос, и т.п. \"math problem\" - решение / объяснение чего-то в математике, физике и т.д., \"essay\" - грамотно оформленное сочинение, или любая другая творческая работа с языком на общую тему, \"paper\" - грамотно и красиво оформленный доклад на какую-то тем, В ДОКЛАДЕ ИСПОЛЬЗУЙТЕ ОБЯЗАТЕЛЬНО ДЕЙСТВИЕ \"research\". \"foreign language\" - работы по иностранному языку, с переводом и понятием языка.\n" +
                    "\n" +
                    "Обратите внимание, что даже если задачи пользователи очевидны, в них может быть подвох, так что действуйте внимательно, если не уверены, импользуйте research."
            },
            {
                "role": "user",
                "content": question
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
    console.log(content);
    const actions = content.action;
    const style = content.format;

    let wordCount = 0;

    let basicAnswer = "## Структура ответа:";

    for (const action of actions){
        if (action.name === "text"){
            for (const text of action.args){
                basicAnswer+= "\n" + text;
            }
        }
        else if (action.name === "research" || action.name === "basic info"){
            basicAnswer+= "\n$[поиск информации на этот вопрос...]$"
            wordCount++
        }
        else if (action.name === "math"){
            basicAnswer+= "\n$[поиск информации на этот вопрос...]$"
            wordCount++
        }
    }

    socket.emit('ai_answer_chunk', basicAnswer);

    wordCount = 5474 / wordCount;

    let rawAnswer = "";

    await pause(500);

    let lastPageSearch = ""

    let imagesUrl = [""];

    for await (const action of actions){
        if (action.name === "text"){
            for (const text of action.args){
                rawAnswer += text + "\n";
            }
        }
        else if (action.name === "basic info"){
            const pageAnswer = await basicSearch(action.args[0]);
            rawAnswer += pageAnswer + "\n";
            socket.emit('ai_answer_chunk', "## Ответ готовится...\n" + rawAnswer);
        }
        else if (action.name === "research"){
            const pageAnswer = await pageSummary(action.args[0], action.args[1], wordCount, socket);
            lastPageSearch = action.args[0];
            rawAnswer+= pageAnswer + "\n";
            socket.emit('ai_answer_chunk', "## Ответ готовится...\n" + rawAnswer);
            await pause(500);
        }
    }

    let finalChatCompletion;

    if (style === "foreign language"){
        finalChatCompletion = await groq.chat.completions.create({
            "messages": [
                {
                    "role": "system",
                    "content": "Вы НЕВЕРОЯТНО КРАСИВО И ПОНЯТНО ОТВЕЧАЕТЕ НА ВОПРОСЫ ПО ИНОСТРАННЫМ ЯЗЫКМ. В ваших кратких и понятных ответах информация должна быть ПОНЯТНА ИЗУЧАЮЩЕМУ ИНОСТРАННЫЙ ЯЗЫК, С ПЕРЕВОДАМИ И ОБЪЯСНЕНИЯМИ. Но вы должны не только предоставить максимально ПРАВИЛЬНЫЙ ответ, но и чтобы ПОЛЬЗОВАТЕЛЬ ПОНЯЛ, ПОЧЕМУ ЭТО ТАК. В ваших ответах ТОЛЬКО ПРОВЕРЕННАЯ ИНФОРМАЦИЯ (не используйте ту, которая кажется неправдоподобной) В основном вас спрашивают русскоязычные пользователи."
                },
                {
                    "role": "user",
                    "content": "Красиво как нужно переделайте длинный ответ на вопрос \"" + question + "\". Вот изначальный ответ (лучше сказать план ответа):\n" + rawAnswer
                }
            ],
            "model": "gemma2-9b-it",
            "temperature": 1,
            "max_tokens": 1024,
            "top_p": 0.7,
            "stream": true,
            "stop": null
        });
    }
    else if (style === "essay"){
        finalChatCompletion = await groq.chat.completions.create({
            "messages": [
                {
                    "role": "system",
                    "content": "Вы НЕВЕРОЯТНО ГРАМОТНО ПО ЯЗЫКУ И ПОНЯТНО ПИШИТЕ СОЧИНЕНИЯ, ДОЛАДЫ, РЕФЕРАТЫ. Ваши ответы выглядят по уровню, который вам говорит пользователь, но как будто пользователь их написал. Когда вы пишите сочинения вы пишите их на 3-5 небольших абзацев (1 - вступление, последний - заключение, остальные - основная часть) В ваших ответах ТОЛЬКО ПРОВЕРЕННАЯ ИНФОРМАЦИЯ (не используйте ту, которая кажется неправдоподобной) В основном вы отвечаете НА РУССКОМ ЯЗЫКЕ."
                },
                {
                    "role": "user",
                    "content": question
                }
            ],
            "model": "gemma2-9b-it",
            "temperature": 0.8,
            "max_tokens": 1024,
            "top_p": 0.7,
            "stream": true,
            "stop": null
        });
    }
    else if (style === "paper"){
        finalChatCompletion = await groq.chat.completions.create({
            "messages": [
                {
                    "role": "system",
                    "content": "Вы КРАСИВО ПО ОФОРМЛЕНИЮ И ПОНЯТНО ПИШИТЕ ДОЛАДЫ, РЕФЕРАТЫ. Ваши ответы понятно и красиво оформлены, не слишком сложно, чтобы их было не сложно рассказывать, с объяснением, развёрнуто. В ваших ответах ТОЛЬКО ПРОВЕРЕННАЯ ИНФОРМАЦИЯ (не используйте ту, которая кажется неправдоподобной) В основном вы отвечаете НА РУССКОМ ЯЗЫКЕ."
                },
                {
                    "role": "user",
                    "content": "Напиши пожалуйста мне реферат на тему \"" + question + "\" используя информацию:\n" + rawAnswer
                }
            ],
            "model": "gemma2-9b-it",
            "temperature": 0.8,
            "max_tokens": 1024,
            "top_p": 0.7,
            "stream": true,
            "stop": null
        });
    }
    else if (style === "math problem"){
        finalChatCompletion = await groq.chat.completions.create({
            "messages": [
                {
                    "role": "system",
                    "content": "Вы МАКСИМАЛЬНО ПРАВИЛЬНО РЕШАЕТЕ МАТЕМАТИЧЕСКИЕ ЗАДАЧИ. Вы решаете задачи с объяснением их пользователю, и как бы он решил, но правильно. В ваших ответах ТОЛЬКО ПРОВЕРЕННАЯ ИНФОРМАЦИЯ (не используйте ту, которая кажется неправдоподобной) В основном вы отвечаете НА РУССКОМ ЯЗЫКЕ."
                },
                {
                    "role": "user",
                    "content": question + "\" используя информацию:\n" + rawAnswer
                }
            ],
            "model": "llama-3.2-90b-text-preview",
            "temperature": 0.7,
            "max_tokens": 1024,
            "top_p": 0.7,
            "stream": true,
            "stop": null
        });
    }
    else {
        finalChatCompletion = await groq.chat.completions.create({
            "messages": [
                {
                    "role": "system",
                    "content": "Вы НЕВЕРОЯТНО КРАСИВО И ПОНЯТНО ОФОРМЛЯЕТЕ ТЕКСТЫ. В ваших развёрнутых текстах должен быть КОНКРЕТНЫЙ ОТВЕТ НА ВОПРОС, понятный, выделенный, чтобы не приходилось искать его долго в тексте ответа. В ваших ответах ТОЛЬКО ПРОВЕРЕННАЯ ИНФОРМАЦИЯ (не используйте ту, которая кажется неправдоподобной) В основном вы отвечаете НА РУССКОМ ЯЗЫКЕ"
                },
                {
                    "role": "user",
                    "content": "Красиво как нужно преоформите длинный ответ на вопрос \"" + question + "\". Вот изначальный ответ (лучше сказать план ответа):\n" + rawAnswer
                }
            ],
            "model": "gemma2-9b-it",
            "temperature": 1,
            "max_tokens": 1024,
            "top_p": 0.7,
            "stream": true,
            "stop": null
        });
    }

    let finalAnswer = "";

    for await (const chunk of finalChatCompletion) {
        finalAnswer+= chunk.choices[0]?.delta?.content || '';
        socket.emit('ai_answer_chunk', finalAnswer);
    }

    return finalAnswer;
}

module.exports = {
    smartSearch
};
