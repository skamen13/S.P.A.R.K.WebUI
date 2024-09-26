const Groq = require('groq-sdk');
const {gwsearch} = require("nayan-server");
const wiki = require("wikipedia");

const groq = new Groq({
    apiKey: "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"
});

async function s_e_a_r_c_h(question = "А как доказать что при всех допустимых значениях x значение выражения не зависит от x?"){
    const chatCompletion = await groq.chat.completions.create({
        "messages": [
            {
                "role": "system",
                "content": "JSON. Выдайте информацию по тому, какие действия должен делать универсальный разговорный ИИ, когда его просят о том, что пользователь просит сейчас. В поле \"action\" напишите действие из списка, в поле \"args\" напишите строковые аргументы к действию. Вот все возможные действия:\n\"none\", пустые аргументы (никакого действия)\n\"talk\", в аргументах тема разговора (ИИ просто общается, НЕ ВОПРОСЫ О МИРЕ)\n\"text work\" (Работа с текстом, написание текста с красивым оформлением, будь то письмо, реферат или любое домашнее задание, объяснение сложных тем, код. Используйте всегда когда ответить нужно НЕ РАЗГОВОРНО, А ФОРМАЛЬНО, НЕ ИСПОЛЬЗУЙТЕ ЕСЛИ НЕТ КОНКРЕТНОЙ ЗАДАЧИ)\n\"search\", в аргументах строка НА РУССКОМ запроса в интернете (обычный поиск ответа в интернете, используйте, когда спрашивают ВОПРОСЫ фактах о МИРЕ, например его можно использовать в \"А сколько лет живёт солнце?\")\n\"vision\", пустые аргументы (просмотр реальной жизни при помощи камер, используйте когда речь идёт о чём-то, чтобы понять которое нужно это увидеть)\n\"presentation\", в аргументах тема презентации на русском (создание презентации в powerpoint на нужную тему, ). ПИШИТЕ ПО ОФОРМЛЕНИЮ ТАК ЖЕ КАК В ПРИМЕРЕ. Пример вашего ВСЕГО ответа: \"\n{\n\"action\": \"presentation\",\n\"args\": \"Основание Екатеринодара \"\n}\n\""
            },
            {
                "role": "user",
                "content": question
            }
        ],
        "model": "llama3-groq-8b-8192-tool-use-preview",
        "temperature": 0.5,
        "max_tokens": 1024,
        "top_p": 0,
        "stream": false,
        "response_format": {
            "type": "json_object"
        },
        "stop": null
    });

    // Пробуем разобрать ответ и выполнить действие
    const content = JSON.parse(chatCompletion.choices[0].message.content);


    if (content.action === "text work"){
        const result = await searchLinks(content.args, "5");

        if (result && result.length > 0) {

            let answersString = "";

            for (const part of result)
            {
                answersString += "\n - " + part.description
            }

            console.log(answersString)

            try {
                wiki.setLang('ru');
                const searchResults = await wiki.search(content.args);
                console.log(searchResults);
                //Response of type @wikiSearchResult - contains results and optionally a suggestion
                const page = await wiki.page(searchResults.results[0].title);
                const summary = await page.summary();
                console.log(summary);
                answersString += "\n - " + summary.extract
                //Returns the api url with language changed - use `languages()` method to see a list of available langs
            } catch (error) {
                console.log(error);
                //=> Typeof wikiError
            }

            const info = " Вот информация из интернета, которая может вам помочь: " + answersString

            console.log(info);

            const chatCompletion2 = await groq.chat.completions.create({
                "messages": [
                    {
                        "role": "system",
                        "content": "Вы полезный ассистент. Ваши ответы всегда ПРАВИЛЬНЫ, без ошибок, понятны каждому и с красиво оформлены. Вы говорите НА РУССКОМ ЯЗЫКЕ"
                    },
                    {
                        "role": "user",
                        "content": question + info
                    }
                ],
                "model": "llama-3.1-70b-versatile",
                "temperature": 0.7,
                "max_tokens": 1024,
                "top_p": 0.7,
                "stream": true,
                "stop": null
            });

            for await (const chunk of chatCompletion2) {
                process.stdout.write(chunk.choices[0]?.delta?.content || '');
            }
        } else {
            console.log("No results found.");
        }
    }
}

async function searchLinks(query = "", limit = "1") {
    try {
        const data = await gwsearch(query, limit);
        console.log(data.data);
        return data.data;
    } catch (error) {
        console.error("Error during search:", error);
        throw error;
    }
}

s_e_a_r_c_h()
