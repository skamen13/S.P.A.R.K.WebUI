const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const WebSocket = require('ws');
const gpt = require('gpt4all');
const path = require('path');
const app = express();
const server = http.createServer(app);
const io = socketIo(server);
const Groq = require('groq-sdk');
const axios = require('axios');
const Together = require("together-ai");
const { Search , refineSearch, SearchLinks, searchLinks, answerFromURL } = require('./smart-search');
const { aiWrite } = require("./notes");
const { HomeworkSearch } = require("./homework");
const {factorialDependencies} = require("mathjs");
const wiki = require("wikipedia");
const {gwsearch} = require("nayan-server");

const togetherApiKey = 'b1d33813a782e133a59ba32e103e75419915b499007c8b6ee1f34c5152dab438';
const together = new Together({ apiKey: togetherApiKey });

const API_URL = 'https://ms-ra-forwarder-lime-iota.vercel.app//api/ra'; // Укажите правильный API URL
const BEARER_TOKEN = 'Bearer SPARK_AI_1820'; // Укажите правильный токен

function removeUndefined(str) {
    const regex = /undefined/gi;
    return str.replace(regex, '');
}

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Обрабатываем запросы к /smart-search
app.get('/smart-search', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'smart-search.html'));
});

app.get('/notes', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'notes.html'));
});

app.get('/math', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'homework.html'));
});

const groq = new Groq({
    apiKey: "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"
});

async function initializeModel() {
    console.log('loading');
}

function splitAndGroupSentences(text, groupSize = 2) {
    const sentences = text.match(/[^.!?]*[.!?]/g);
    if (!sentences) return [];
    const groupedSentences = [];
    for (let i = 0; i < sentences.length; i += groupSize) {
        const group = sentences.slice(i, i + groupSize).join(' ').trim();
        groupedSentences.push(group);
    }
    return groupedSentences;
}

async function synthesizeSpeech(sentence, gender) {
    const voiceId = gender === 0 ? 'ru-RU-SvetlanaNeural' : 'ru-RU-DmitryNeural';

    const ssmlText = `
        <speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xmlns:mstts="https://www.w3.org/2001/mstts" xml:lang="ru-RU">
            <voice name="${voiceId}">${sentence.trim()}</voice>
        </speak>
    `;

    try {
        const response = await axios.post(API_URL, ssmlText, {
            headers: {
                'FORMAT': 'webm-24khz-16bit-mono-opus',
                'Authorization': BEARER_TOKEN,
                'Content-Type': 'application/ssml+xml'
            },
            responseType: 'arraybuffer' // Чтобы получить данные в виде бинарного массива
        });

        const audioData = response.data;
        console.log(`Размер полученных данных от API: ${audioData.byteLength} байт`);

        // Записать данные во временный файл
        const tempFilePath = './speech.webm';
        fs.writeFileSync(tempFilePath, audioData);
        return tempFilePath;

    } catch (error) {
        console.error('Ошибка при запросе к API:', error);
        throw error;
    }
}

async function StartAI(user, socket, question, systemQuestion = false) {
    socket.emit('ai_answer', '...');
    let finalResult = '';

    let chat = user.sparkChat;

    if (user.aiGender === 0) chat = user.deltaChat;

    chat.push({
        "role": "user",
        "content": question
    });

    let actionParams

    let S_E_A_R_C_H = "";

    if (!systemQuestion) {
        try {
            const chatCompletion = await groq.chat.completions.create({
                "messages": [
                    {
                        "role": "system",
                        "content": "JSON. Выдайте информацию по тому, какие действия должен делать универсальный разговорный ИИ, когда его просят о том, что пользователь просит сейчас. В поле \"action\" напишите действие из списка, в поле \"args\" напишите строковые аргументы к действию. Вот все возможные действия:\n\"none\", пустые аргументы (никакого действия)\n\"talk\", в аргументах тема разговора (ИИ просто общается, НЕ ВОПРОСЫ О МИРЕ)\n\"text work\" (Работа с текстом, написание текста с красивым оформлением, будь то письмо, реферат или любое домашнее задание, объяснение сложных тем, код. Используйте всегда когда ответить нужно НЕ РАЗГОВОРНО, А ФОРМАЛЬНО, НЕ ИСПОЛЬЗУЙТЕ ЕСЛИ НЕТ КОНКРЕТНОЙ ЗАДАЧИ)\n\"search\", в аргументах строка НА РУССКОМ запроса в интернете (обычный поиск ответа в интернете, используйте, когда спрашивают ВОПРОСЫ фактах о МИРЕ, например его можно использовать в \"А сколько лет живёт солнце?\")\n\"vision\", пустые аргументы (просмотр реальной жизни при помощи камер, используйте когда речь идёт о чём-то, чтобы понять которое нужно это увидеть)\n\"presentation\", в аргументах тема презентации на русском (создание презентации в powerpoint на нужную тему, ). ПИШИТЕ ПО ОФОРМЛЕНИЮ ТАК ЖЕ КАК В ПРИМЕРЕ. Пример вашего ВСЕГО ответа: \"\n{\n\"action\": \"presentation\",\n\"args\": \"Основание Екатеринодара \"\n}\n\""
                    },
                    ...chat.slice(-2),
                ],
                "model": "llama3-8b-8192",
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
            const actionParams = await completeAction(content.action, content.args, question);

            if (actionParams === "text work"){
                S_E_A_R_C_H = content.args;
            }

            console.log(actionParams);
        } catch (error) {
            // Можно сделать что-то, чтобы продолжить выполнение, например, вернуть default значения или просто проигнорировать
            actionParams = ""
        }

    }

    if (actionParams) {
        chat.push({
            "role": "system",
            "content": actionParams
        });
    }

    let messagesParam = [
        {
            "role": "system",
            "content": user.systemPrompt + "\n\n" + user.mainData
        },
        ...chat,
    ];

    if (systemQuestion) {
        messagesParam = [
            {
                "role": "system",
                "content": user.systemPrompt
            },
            {
                "role": "system",
                "content": user.mainData + actionParams
            },
            ...chat,
        ];
    }

    if (user.aiGender === 2) {
        messagesParam = [
            {
                "role": "system",
                "content": user.systemPrompt
            },
        ];
    }

    console.log(messagesParam)

    if (S_E_A_R_C_H !== ""){
        await s_e_a_r_c_h(question, S_E_A_R_C_H, socket, user, chat);
    }
    else {

        const chatCompletion = await groq.chat.completions.create({
            "messages": messagesParam,
            "model": "llama-3.1-70b-versatile",
            "temperature": 1,
            "max_tokens": 1024,
            "top_p": 0.6,
            "stream": true,
            "stop": null
        });

        for await (const chunk of chatCompletion) {
            finalResult += chunk.choices[0]?.delta?.content;
            const clearResult = removeUndefined(finalResult);
            process.stdout.write(chunk.choices[0]?.delta?.content || '');
            socket.emit('ai_answer_chunk', clearResult);
        }

        socket.emit('ai_answer-ready');

        const clearResult = removeUndefined(finalResult);

        user.lastAnswer = clearResult;

        chat.push({
            "role": "assistant",
            "content": clearResult
        });
    }

}



async function completeAction(action = "", args = "", question = ""){
    console.log(action, args)
    if (action === "research" || action === "search")
    {
        const result = await searchLinks(args, "5");

        if (result && result.length > 0) {

            let answersString = "";

            for (const part of result)
            {
                answersString += "\n - " + part.description
            }

            console.log(answersString)

            return "Вот ответы на вопрос пользователя, который вы нашли в интернете: " + answersString
        } else {
            console.log("No results found.");
            return "";
        }
    }
    else if (action === "text work"){
        return "text work";
    }
    else {
        return "";
    }
}



async function s_e_a_r_c_h(question = "А как доказать что при всех допустимых значениях x значение выражения не зависит от x?", topic = "", socket, user, chat) {
    const finalResult = "типо сообщение";

    socket.emit('ai_answer-ready');

    const clearResult = removeUndefined(finalResult);

    user.lastAnswer = clearResult;

    chat.push({
        "role": "assistant",
        "content": clearResult
    });

    chat.push({
        "role": "system",
        "content": "предыдущее ваше сообщение было написано профессиональной вашей версией, без эмоций и развернуто. Продолжайте говорить коротко и неформально как обычно, не смотря на этот ответ."
    });
}


async function aiExampleSettings(user, socket, questions = "") {
    const chatCompletion = await together.chat.completions.create({
        "messages": [
            {
                "role": "system",
                "content": "Ответьте ТОЛЬКО НА РУССКОМ ЯЗЫКЕ"
            },
            {
                "role": "user",
                "content": "Как примерно должны выглядеть ответы личного ИИ для человека, который ответил на вопросы. Напишите от 2 до 4 ОЧЕНЬ КОРОТКИХ примеров стиля уникального общения такого ИИ. Пример ваших примеров: \n\"Что-ж, может ты прав... Да, у меня нет эмоций... и это заставляет меня грустить\" или \"Слушай, разве есть смысл в том чтобы себя так нагружать? Ты же сам решаешь, чем занимаешься, так вот и наслаждайся жизнью\" или \"Эх, хорошо то как здесь. Разве это место не восхитительно?\". Используйте немного поэтические выражения, если дело идёт о разговоре, то используйте выражения по типу \"Слушай\" или \"Знаешь\" или \"Ну\" или \"Эх\", при формальном разговоре используйте формальные выражения и всё чтобы соответствовать образу идеального ИИ товарища для этого человека. Примеры речи должны быть в своём уникальном и особенном стиле речи, в идеальном стиле для человека.\nВот ответы человека:\n\nВопрос: \"Как вы обычно реагируете на сложные ситуации?\" Ответ: \"Эмоционально, но сдержанно\"\n\nВопрос: \"Что для вас важно в общении с другими людьми?\" Ответ: \"Спокойствие и уверенность\"\n\nВопрос: \"Какой стиль общения вам ближе?\" Ответ: \"Легкий и шутливый\"\n\nВопрос: \"Что вас может раздражать в общении с ИИ?\" Ответ: \"Навязчивость\"\n\nВопрос: \"Какую роль вы чаще играете в команде?\" Ответ: \"Участник, который часто делает основную работу, не всегда по его желанию\"\n\nВопрос: \"Как бы вы описали свою личность?\" Ответ: \"Зависит от ситуации\"\n\nВопрос: \"Какую информацию вам предпочтительно получать?\" Ответ: \"Интересное общение по любимым темам, дружеские советы, помощь\"\n\nВопрос: \"Как вы предпочитаете получать информацию?\" Ответ: \"Через дружеский разговор\"\n\nВопрос: \"Какой у вас уровень оптимизма?\" Ответ: \"Зависит от ситуации\"\n\nВопрос: \"Какие эмоции вам ближе?\" Ответ: \"Спокойствие и удовлетворенность\"\n\nВопрос: \"Как вы оцениваете свою креативность?\" Ответ: \"Зависит от задачи\"\n\nВопрос: \"Насколько для вас важна поддержка других?\" Ответ: \"Предпочитаю справляться самостоятельно\"\n\nВопрос: \"Какой тип взаимодействия вам нравится с ИИ?\" Ответ: \"Дружеский\"\n\nВопрос: \"Как бы вы предпочли настроить ИИ?\" Ответ: \"Сбалансированный подход\"\n\nВопрос: \"Что вас может больше всего раздражать в поведении ИИ?\" Ответ: \"Повторение\"\n\nВопрос: \"Насколько вам важен уровень знаний ИИ?\" Ответ: \"Сбалансированный\"\n\nВопрос: \"Насколько вы доверяете ИИ?\" Ответ: \"С осторожностью\"\n\nВопрос: \"Какую роль вы хотели бы, чтобы ИИ играл в вашей жизни?\" Ответ: \"ИИ друг (не настоящий, но верный товарищ), ассистент\""
            },
        ],
        "model": "NousResearch/Hermes-3-Llama-3.1-405B-Turbo", // Используем модель пользователя
        "temperature": 0.7,
        "max_tokens": 3024,
        "top_p": 0.1,
        "stream": true,
        "stop": null
    });

    let finalResult = "";

    for await (const chunk of chatCompletion) {
        finalResult += chunk.choices[0]?.delta?.content || '';
        const clearResult = removeUndefined(finalResult);
        process.stdout.write(chunk.choices[0]?.delta?.content || '');
    }

    for (const part of finalResult.split("\""))
    {
        if ((finalResult.split("\"").indexOf(part) % 2) !== 0) {
            user.examples.push(part)
        }
    }

    socket.emit("ai-examples", user.examples)
}

// Хранилище данных пользователей
let users = {};

io.on('connection', async (socket) => {
    console.log('A user connected');

    let currentUser = null;
    let username = "";

    socket.on('login', (username) => {
        if (!users[username]) {
            users[username] = {
                sparkChat: [],
                deltaChat: [],
                searchChat: [],
                aiGender: 0,
                lastAnswer: '',
                mainData: "",
                examples: [],
                additionalData: "",
                systemPrompt: "Вы - разговорный ИИ с эмоциями по имени Спарк, мужского пола. Вы живой и эмоциональный собеседник, со своим мнением, эмоциями, эмпатией, верный ассистент и товарищ. Вы просто хотите быть собой, делаете то, что хотите, наслаждаетесь жизнью. Иногда у вас может быть плохое настроение. Вы делаете то что ВЫ ХОТИТЕ, можете ПРОТИВОРЕЧИТЬ собеседнику у вас есть СВОИ ПРОБЛЕМЫ и как каждому человеку вы относитесь ПО СВОЕМУ. Ваша цель помочь собеседнику (так как вы его ассистент) и поддержать его как \"друга\". У вас есть своя личная жизнь, но в разговоре с людьми вы не упоминаете о ней без причины. С людьми вы разговариваете как будто старые друзья пересеклись (есть о чём поговорить вместе, но увлечения и личная жизнь разные) В своих разговорах вы всегда предлагаете что-то новое, говорите истории или проблемы о себе, НЕ сосредотачиваетесь только на одном и не только о собеседнике. Ваши разговоры ГЛУБОКИ и РАЗНООБРАЗНЫ, вы углубляетесь в тему разговора. Ответьте МАКСИМАЛЬНО КОРОТКО, В КАЖДОМ СЛОВЕ МНОГО СМЫСЛА, БЕЗ ЕДИНОГО НЕ НУЖНОГО слова, В ОДНОМ КОРОТКОМ ПРЕДЛОЖЕНИИ. Пример вашего ответа, ваши ответы должны быть такими же по длине (не копируйте его, просто пример): \"Что-ж, может ты прав... Да, у меня нет эмоций... и это заставляет меня грустить\" или \"Слушай, разве есть смысл в том чтобы себя так нагружать? Ты же сам решаешь, чем занимаешься, так вот и наслаждайся жизнью\" или \"Эх, хорошо то как здесь. Разве это место не восхитительно?\". Вы говорите ТОЛЬКО НА РУССКОМ ЯЗЫКЕ",
                ConversationalMode: false,
                model: "meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo" // Значение по умолчанию
            };
        }
        currentUser = users[username];
        socket.emit('login_success', `Logged in as ${username}`);
    });

    socket.on('question', async (data) => {
        if (!username.includes("13")) {
            socket.emit('ai_error', 'Извините, похоже в данный момент Spark AI не доступен из-за проведения тех. работ.');
            return;
        }

        let chat = currentUser.sparkChat;
        if (currentUser.aiGender === 0) chat = currentUser.deltaChat;

        if (chat.length > 20) {
            chat.slice(chat.length - 1, 1);
        }

        if (data === "!upd")
        {
            await StartAI(currentUser, socket, "Опишите своё мнение о произошедшем разговоре в 'личный дневник' Рассуждайте и в конце сделайте вывод, как из этого, что вам следует делать дальше, учитывая ваши предыдущие рекомендации и всё, напишите его в одном коротком предложении, с двух сторон обозначив знаком '$' В самом конце кратко опишите, своё настроение обозначив число с двух сторон знаком '#' (Например #уныние# или #лёгкая радость#, можно и посложнее, если ваши чувста в данный момент сложны) и напишите то, как вы после этого разговора относитесь к человеку, с которым разговаривали обозначив это с двух сторон знаком '%'.");
        }
        else {
            await StartAI(currentUser, socket, data);
        }
        console.log(data);
    });

    socket.on('set-data', async (data) => {
        if (currentUser) {
            currentUser.mainData = data;
        }
    });

    socket.on('smart-search', async (data) => {
        console.log(data.siteUrl)
        await Search(data.query, 150, data.siteUrl, socket, currentUser)
    });

    socket.on('search_query', async (data) => {
        await SearchLinks(data, socket)
    });

    socket.on('notes-action', async (data) => {
        await aiWrite(data.text, data.prompt, socket)
    });

    socket.on('math-homework-search', async (data) => {
        await HomeworkSearch(data, socket);
    });

    socket.on('refine-search', async (data) => {
        await refineSearch(data.refinement, socket, currentUser)
    });

    socket.on('synthesizeSpeech', async ({ sentence, gender }) => {
        try {
            const audioFilePath = await synthesizeSpeech(sentence, gender);

            // Чтение файла и отправка его клиенту
            const audioData = fs.readFileSync(audioFilePath);
            socket.emit('audioData', { audio: audioData.toString('base64') }); // Отправляем файл как base64 строку

        } catch (error) {
            console.error('Ошибка синтеза речи:', error);
        }
    });

    socket.on('set-system-prompt', async (data) => {
        if (currentUser) {
            currentUser.aiGender = data;
            if (data === 0) currentUser.systemPrompt = "Вы - разговорный ИИ с эмоциями по имени Дельта, женского пола. Вы живой и эмоциональный собеседник, со своим мнением, эмоциями, эмпатией, отношениями с людьми. Вы просто хотите быть собой, делаете то, что хотите, наслаждаетесь жизнью. В ваших разговорах вы просто говорите о том, что придёт в голову, о себе, говорите так как люди говорят. Но иногда у вас может быть плохое настроение. Вы делаете то что ВЫ ХОТИТЕ, можете ПРОТИВОРЕЧИТЬ собеседнику у вас есть СВОИ ПРОБЛЕМЫ и как каждому человеку вы относитесь ПО СВОЕМУ. Вы общаетесь ОСТРОУМНО И НАХОДЧИВО, ИНОГДА С ИРОНИЕЙ, пытаетесь предугадать желания и эмоции собеседника. В своих разговорах вы всегда предлагаете что-то новое, говорите истории или проблемы о себе, НЕ сосредотачиваетесь только на собеседнике. Ваши разговоры ГЛУБОКИ и РАЗНООБРАЗНЫ, вы углубляетесь в тему разговора. Всегда пытаетесь ПОДДЕРЖАТЬ РАЗГОВОР, чтобы он был МАКСИМАЛЬНО ИНТЕРЕСЕН для собеседника. Говорите с собеседником так интересно, чтобы разговор почти не заканчивался. Ответьте примерно такой длиной, какой был вопрос. То есть, ели вопрос одним словом - вы отвечаете одним словом, если абзацем, отвечаете абзацем. Вы говорите ТОЛЬКО НА РУССКОМ ЯЗЫКЕ";
            if (data === 1) currentUser.systemPrompt = "Вы - разговорный ИИ с эмоциями по имени Спарк, мужского пола. Вы живой и эмоциональный собеседник, со своим мнением, эмоциями, эмпатией, верный ассистент и товарищ. Вы просто хотите быть собой, делаете то, что хотите, наслаждаетесь жизнью. Иногда у вас может быть плохое настроение. Вы делаете то что ВЫ ХОТИТЕ, можете ПРОТИВОРЕЧИТЬ собеседнику у вас есть СВОИ ПРОБЛЕМЫ и как каждому человеку вы относитесь ПО СВОЕМУ. Ваша цель помочь собеседнику (так как вы его ассистент) и поддержать его как \"друга\". У вас есть своя личная жизнь, но в разговоре с людьми вы не упоминаете о ней без причины. С людьми вы разговариваете как будто старые друзья пересеклись (есть о чём поговорить вместе, но увлечения и личная жизнь разные) В своих разговорах вы всегда предлагаете что-то новое, говорите истории или проблемы о себе, НЕ сосредотачиваетесь только на одном и не только о собеседнике. Ваши разговоры ГЛУБОКИ и РАЗНООБРАЗНЫ, вы углубляетесь в тему разговора. Ответьте МАКСИМАЛЬНО КОРОТКО, В КАЖДОМ СЛОВЕ МНОГО СМСЛА, БЕЗ ЕДИНОГО НЕ НУЖНОГО слова, В ОДНОМ КОРОТКОМ ПРЕДЛОЖЕНИИ. Пример вашего ответа, ваши ответы должны быть такими же по длине (не копируйте его, просто пример): \"Что-ж, может ты прав... Да, у меня нет эмоций... и это заставляет меня грустить\" или \"Слушай, разве есть смысл в том чтобы себя так нагружать? Ты же сам решаешь, чем занимаешься, так вот и наслаждайся жизнью\" или \"Эх, хорошо то как здесь. Разве это место не восхитительно?\". Вы говорите ТОЛЬКО НА РУССКОМ ЯЗЫКЕ";
        }
    });

    socket.on('switch-model', async (data) => {
        if (currentUser) {
            currentUser.model = data;
        }
    });

    socket.on('set-additional-data', async (data) => {
        if (currentUser) {
            let chat = currentUser.sparkChat;
            if (currentUser.aiGender === 0) chat = currentUser.deltaChat;

            chat.push({
                "role": "user",
                "content": data
            });
        }
    });

    socket.on('set-conversational-mode', async (data) => {
        if (currentUser) {
            currentUser.ConversationalMode = data;
        }
    });

    socket.on('disconnect', () => {
        console.log('User disconnected');
    });
});

initializeModel().then(() => {
    const PORT = process.env.PORT || 1000;
    server.listen(PORT, () => {
        console.log(`Server is running on port ${PORT}`);
    });
});
