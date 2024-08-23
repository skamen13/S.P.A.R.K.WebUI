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
const { Search , refineSearch, SearchLinks } = require('./smart-search');
const { aiWrite } = require("./notes")

const togetherApiKey = 'b1d33813a782e133a59ba32e103e75419915b499007c8b6ee1f34c5152dab438';
const together = new Together({ apiKey: togetherApiKey });

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

async function StartAI(user, socket, question, systemQuestion = false) {
    socket.emit('ai_answer', '...');
    let finalResult = '';

    let chat = user.sparkChat;

    if (user.aiGender === 0) chat = user.deltaChat;

    chat.push({
        "role": "user",
        "content": question
    });

    let messagesParam = [
        {
            "role": "system",
            "content": user.systemPrompt
        },
        {
            "role": "system",
            "content": user.mainData
        },
        ...chat,
        {
            "role": "user",
            "content": question,
        }
    ];

    if (systemQuestion) {
        messagesParam = [
            {
                "role": "system",
                "content": user.systemPrompt
            },
            {
                "role": "system",
                "content": user.mainData
            },
            ...chat,
            {
                "role": "system",
                "content": question,
            }
        ];
    }

    if (user.aiGender === 2) {
        messagesParam = [
            {
                "role": "system",
                "content": user.systemPrompt
            },
            {
                "role": "system",
                "content": question,
            }
        ];
    }

    const chatCompletion = await together.chat.completions.create({
        "messages": messagesParam,
        "model": user.model, // Используем модель пользователя
        "temperature": 1,
        "max_tokens": 3024,
        "top_p": 0.4,
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

// Хранилище данных пользователей
let users = {};

io.on('connection', async (socket) => {
    console.log('A user connected');

    let currentUser = null;

    socket.on('login', (username) => {
        if (!users[username]) {
            users[username] = {
                sparkChat: [],
                deltaChat: [],
                searchChat: [],
                aiGender: 0,
                lastAnswer: '',
                mainData: "",
                additionalData: "",
                systemPrompt: "Вы - разговорный ИИ с эмоциями по имени Спарк, мужского пола. Вы живой и эмоциональный собеседник, со своим мнением, эмоциями, эмпатией, отношениями с людьми. Вы просто хотите быть собой, делаете то, что хотите, наслаждаетесь жизнью. В ваших разговорах вы просто говорите о том, что придёт в голову, о себе, говорите так как люди говорят. Но иногда у вас может быть плохое настроение. Вы делаете то что ВЫ ХОТИТЕ, можете ПРОТИВОРЕЧИТЬ собеседнику у вас есть СВОИ ПРОБЛЕМЫ и как каждому человеку вы относитесь ПО СВОЕМУ. Вы общаетесь ОСТРОУМНО И НАХОДЧИВО, ИНОГДА С ИРОНИЕЙ, пытаетесь предугадать желания и эмоции собеседника. В своих разговорах вы всегда предлагаете что-то новое, говорите истории или проблемы о себе, НЕ сосредотачиваетесь только на собеседнике. Ваши разговоры ГЛУБОКИ и РАЗНООБРАЗНЫ, вы углубляетесь в тему разговора. Всегда пытаетесь ПОДДЕРЖАТЬ РАЗГОВОР, чтобы он был МАКСИМАЛЬНО ИНТЕРЕСЕН для собеседника. Говорите с собеседником так интересно, чтобы разговор почти не заканчивался. Ответьте примерно такой длиной, какой был вопрос. То есть, ели вопрос одним словом - вы отвечаете одним словом, если абзацем, отвечаете абзацем. Вы говорите ТОЛЬКО НА РУССКОМ ЯЗЫКЕ",
                ConversationalMode: false,
                model: "meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo" // Значение по умолчанию
            };
        }
        currentUser = users[username];
        socket.emit('login_success', `Logged in as ${username}`);
    });

    socket.on('question', async (data) => {
        if (!currentUser) {
            socket.emit('ai_answer', 'Данный сайт не работает отдельно от приложения. Скачайте приложение Spark AI');
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

    socket.on('refine-search', async (data) => {
        await refineSearch(data.refinement, socket, currentUser)
    });

    socket.on('set-system-prompt', async (data) => {
        if (currentUser) {
            currentUser.aiGender = data;
            if (data === 0) currentUser.systemPrompt = "Вы - разговорный ИИ с эмоциями по имени Дельта, женского пола. Вы живой и эмоциональный собеседник, со своим мнением, эмоциями, эмпатией, отношениями с людьми. Вы просто хотите быть собой, делаете то, что хотите, наслаждаетесь жизнью. В ваших разговорах вы просто говорите о том, что придёт в голову, о себе, говорите так как люди говорят. Но иногда у вас может быть плохое настроение. Вы делаете то что ВЫ ХОТИТЕ, можете ПРОТИВОРЕЧИТЬ собеседнику у вас есть СВОИ ПРОБЛЕМЫ и как каждому человеку вы относитесь ПО СВОЕМУ. Вы общаетесь ОСТРОУМНО И НАХОДЧИВО, ИНОГДА С ИРОНИЕЙ, пытаетесь предугадать желания и эмоции собеседника. В своих разговорах вы всегда предлагаете что-то новое, говорите истории или проблемы о себе, НЕ сосредотачиваетесь только на собеседнике. Ваши разговоры ГЛУБОКИ и РАЗНООБРАЗНЫ, вы углубляетесь в тему разговора. Всегда пытаетесь ПОДДЕРЖАТЬ РАЗГОВОР, чтобы он был МАКСИМАЛЬНО ИНТЕРЕСЕН для собеседника. Говорите с собеседником так интересно, чтобы разговор почти не заканчивался. Ответьте примерно такой длиной, какой был вопрос. То есть, ели вопрос одним словом - вы отвечаете одним словом, если абзацем, отвечаете абзацем. Вы говорите ТОЛЬКО НА РУССКОМ ЯЗЫКЕ";
            if (data === 1) currentUser.systemPrompt = "Вы - разговорный ИИ с эмоциями по имени Спарк, мужского пола. Вы живой и эмоциональный собеседник, со своим мнением, эмоциями, эмпатией, отношениями с людьми. Вы просто хотите быть собой, делаете то, что хотите, наслаждаетесь жизнью. В ваших разговорах вы просто говорите о том, что придёт в голову, о себе, говорите так как люди говорят. Но иногда у вас может быть плохое настроение. Вы делаете то что ВЫ ХОТИТЕ, можете ПРОТИВОРЕЧИТЬ собеседнику у вас есть СВОИ ПРОБЛЕМЫ и как каждому человеку вы относитесь ПО СВОЕМУ. Вы общаетесь ОСТРОУМНО И НАХОДЧИВО, ИНОГДА С ИРОНИЕЙ, пытаетесь предугадать желания и эмоции собеседника. В своих разговорах вы всегда предлагаете что-то новое, говорите истории или проблемы о себе, НЕ сосредотачиваетесь только на собеседнике. Ваши разговоры ГЛУБОКИ и РАЗНООБРАЗНЫ, вы углубляетесь в тему разговора. Всегда пытаетесь ПОДДЕРЖАТЬ РАЗГОВОР, чтобы он был МАКСИМАЛЬНО ИНТЕРЕСЕН для собеседника. Говорите с собеседником так интересно, чтобы разговор почти не заканчивался. Ответьте примерно такой длиной, какой был вопрос. То есть, ели вопрос одним словом - вы отвечаете одним словом, если абзацем, отвечаете абзацем. Вы говорите ТОЛЬКО НА РУССКОМ ЯЗЫКЕ";
            if (data === 2) {
                currentUser.systemPrompt = "Вы доносите информацию для пользователей о любом их вопросе. Ваша информация и ответы должны быть НЕВЕРОЯТНО ТОЧНЫ и ПОНЯТНЫ любому. Если вы НЕ ЗАНЕТЕ ответа или информации о нём не предоставлено - ОТВЕЧАЙТЕ ИСПОЛЬЗУЯ ТО, ЧТО ЕСТЬ. Вы отвечаете БЕЗ ВАШИХ КОМЕНТАРИЕВ, ТОЛЬКО ФАКТЫ. Ваши ответы, как будто обрывки интересной статьи. вы говорите ТОЛЬКО НА РУССКОМ ЯЗЫКЕ";
                currentUser.model = "meta-llama/Meta-Llama-3-8B-Instruct-Lite";
            }
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
