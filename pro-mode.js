const puppeteer = require("puppeteer");
const Groq = require('groq-sdk');
const DDG = require("duck-duck-scrape");
const gis = require('async-g-i-s');

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

async function searchDuckLinks(query = "") {
    const searchResults = await DDG.search(query, {
        safeSearch: DDG.SafeSearchType.STRICT
    });

    return searchResults.results;
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

        let finalAnswer = "";

        for await (const chunk of chatCompletion) {
            process.stdout.write(chunk.choices[0]?.delta?.content || '');
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

    let basicAnswer = "## Структура ответа:";

    for (const action of actions){
        if (action.name === "text"){
            for (const text of action.args){
                basicAnswer+= "\n" + text;
            }
        }
        else if (action.name === "page qe"){
            basicAnswer+= "\n$[поиск информации на этот вопрос...]$"
            wordCount++
        }
        else if (action.name === "image"){
            basicAnswer+= "\n$[поиск изображения...]$"
            wordCount++
        }
    }

    socket.emit('ai_answer_chunk', basicAnswer);

    wordCount = 6474 / wordCount;

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
        else if (action.name === "page qe"){
            const pageAnswer = await pageSummary(action.args[0], action.args[1], wordCount, socket);
            lastPageSearch = action.args[0];
            rawAnswer+= pageAnswer + "\n";
            socket.emit('ai_answer_chunk', "## Ответ готовится...\n" + rawAnswer);
            await pause(500);
        }
        else if (action.name === "image"){
            const results = await gis(slide.topic);

            // Фильтруем результаты, оставляя только те, которые используют протокол https
            const httpsResults = results.filter(result => result.url.startsWith("https:"));

            // Проверяем, есть ли результаты после фильтрации, и присваиваем первый из них
            if (httpsResults.length > 0) {
                imagesUrl[slides.indexOf(slide)] = httpsResults[0].url;
            } else {
                imagesUrl[slides.indexOf(slide)] = null; // Или другое значение по умолчанию, если нет https URL
            }
        }
    }

    const finalChatCompletion = await groq.chat.completions.create({
        "messages": [
            {
                "role": "system",
                "content": "Вы НЕВЕРОЯТНО КРАСИВО И ПОНЯТНО ОФОРМЛЯЕТЕ ТЕКСТЫ. В ваших развёрнутых текстах должен быть КОНКРЕТНЫЙ ОТВЕТ НА ВОПРОС, понятный, выделенный, чтобы не приходилось искать его долго в тексте ответа. В ваших ответах ТОЛЬКО ПРОВЕРЕННАЯ ИНФОРМАЦИЯ (не используйте ту, которая кажется неправдоподобной) В основном вы отвечаете НА РУССКОМ ЯЗЫКЕ"
            },
            {
                "role": "user",
                "content": "Красиво переоформите длинный ответ на вопрос \"Какие лучшие бесплатные хостинги Minecraft?\". Вот изначальный ответ:\nНиже приведен список бесплатных хостингов Minecraft:\nСписок бесплатных хостингов Minecraft:\n\n1. **Minehut**: Один из самых популярных бесплатных хостингов Minecraft. Предоставляет доступ к серверам с 2-64 слотами.\n2. **Apex Hosting**: Предлагает бесплатную версию своего хостинга с ограничениями на количество слотов и скорость соединения.\n3. **ServerMiner**: Бесплатный хостинг с возможностью создания серверов с 2-10 слотами.\n4. **Minecraft Server Hosting**: Предлагает бесплатную версию своего хостинга с ограничениями на количество слотов и скорость соединения.\n5. **Hostinger**: Предлагает бесплатную версию своего хостинга с ограничениями на количество слотов и скорость соединения.\n6. **000webhost**: Предлагает бесплатную версию своего хостинга с ограничениями на количество слотов и скорость соединения.\n7. **MCS**: Бесплатный хостинг с возможностью создания серверов с 2-10 слотами.\n8. **Minecraft Server**: Предлагает бесплатную версию своего хостинга с ограничениями на количество слотов и скорость соединения.\n9. **GameJolt**: Бесплатный хостинг с возможностью создания серверов с 2-10 слотами.\n10. **PlanetMinecraft**: Предлагает бесплатную версию своего хостинга с ограничениями на количество слотов и скорость соединения.\n\nПожалуйста, обратите внимание, что многие из этих хостингов имеют ограничения и рекламу, поэтому выберите тот, который лучше всего подходит для ваших потребностей.\nВыбирайте по своему усмотрению, но по данным интернета лучшим хостингом является:\nХорошая тема! Для хостинга Minecraft существует несколько вариантов, каждый со своими плюсами и минусами. Рассмотрим несколько популярных вариантов:\n\n1. **Aternos**: Это один из самых популярных хостингов Minecraft, который предлагает бесплатный хостинг с ограниченными функциями. Альтернативная версия платная, но она включает в себя дополнительные функции, такие как создание многопользовательских серверов и управление правами доступа.\n2. **McMyAdmin**: Это платный хостинг, который предлагает широкий набор функций, включая создание многопользовательских серверов, управление правами доступа и мониторинг сервера. McMyAdmin также предлагает поддержку различных версий Minecraft.\n3. **BisectHosting**: Это платный хостинг, который предлагает быструю установку и конфигурацию сервера Minecraft. BisectHosting также предлагает поддержку различных версий Minecraft и возможность создания многопользовательских серверов.\n4. **Hostinger**: Это платный хостинг, который предлагает широкий набор функций, включая создание многопользовательских серверов, управление правами доступа и мониторинг сервера. Hostinger также предлагает поддержку различных версий Minecraft.\n5. **ScalaCube**: Это платный хостинг, который предлагает быструю установку и конфигурацию сервера Minecraft. ScalaCube также предлагает поддержку различных версий Minecraft и возможность создания многопользовательских серверов.\n\nНа мой взгляд, лучший хостинг Minecraft зависит от ваших конкретных потребностей и предпочтений. Если вы ищете бесплатный хостинг с ограниченными функциями, то Aternos может быть хорошим выбором. Если вы готовы заплатить за более широкий набор функций, то McMyAdmin, BisectHosting, Hostinger или ScalaCube могут быть лучшим выбором.\n\nНекоторые факторы, которые следует учитывать при выборе хостинга Minecraft:\n\n* **Цена**: Бесплатные хостинги, такие как Aternos, могут иметь ограничения и рекламу. Платные хостинги, такие как McMyAdmin и BisectHosting, могут быть более дорогими, но они предлагают более широкий набор функций.\n* **Уровень поддержки**: Некоторые хостинги, такие как McMyAdmin и Hostinger, предлагают более высокий уровень поддержки и технической помощи.\n* **Возможности конфигурации**: Некоторые хостинги, такие как BisectHosting и ScalaCube, предлагают более простую конфигурацию сервера Minecraft.\n* **Возможность создания многопользовательских серверов**: Некоторые хостинги, такие как McMyAdmin и Hostinger, предлагают возможность создания многопользовательских серверов.  \n\nВ конечном итоге, выбор хостинга Minecraft зависит от ваших конкретных потребностей и предпочтений."
            }
        ],
        "model": "gemma2-9b-it",
        "temperature": 1,
        "max_tokens": 1024,
        "top_p": 0.7,
        "stream": true,
        "stop": null
    });

    let finalAnswer = "";

    for await (const chunk of finalChatCompletion) {
        process.stdout.write(chunk.choices[0]?.delta?.content || '');
        finalAnswer+= chunk.choices[0]?.delta?.content || '';
        socket.emit('ai_answer_chunk', finalAnswer);
    }

    return finalAnswer;
}

module.exports = {
    smartSearch
};
