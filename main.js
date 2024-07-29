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

function removeUndefined(str) {
    // Регулярное выражение для поиска слова "undefined" независимо от регистра
    const regex = /undefined/gi;

    // Заменяем все вхождения "undefined" на пустую строку
    return str.replace(regex, '');
}

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json()); // Добавлено для парсинга JSON в теле запроса

let model;
let pythonSocket;
let lastAnswer = '';
let currentChat = [{
    "role": "user",
    "content": "привет",
}];
let additionalData = "";

const groq = new Groq({
    apiKey: "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"
});

async function initializeModel() {
    console.log('loading')
}

function splitAndGroupSentences(text, groupSize = 2) {
    // Разделяем текст на предложения
    const sentences = text.match(/[^.!?]*[.!?]/g);

    // Если предложений нет, возвращаем пустой массив
    if (!sentences) return [];

    // Группируем предложения
    const groupedSentences = [];
    for (let i = 0; i < sentences.length; i += groupSize) {
        const group = sentences.slice(i, i + groupSize).join(' ').trim();
        groupedSentences.push(group);
    }

    return groupedSentences;
}

async function StartAI(chatt = [], socket, question) {
    socket.emit('ai_answer', '...');
    let response = '';
    let finalResult = '';

    const chatCompletion = await groq.chat.completions.create({
        "messages": [
            ...currentChat,
            {
                "role": "system",
                "content": "Вы - разговорный ИИ с эмоциями по имени Спарк, мужского пола, созданный Максимом. Вы живой и эмоциональный собеседник, со своим мнением, эмоциями, эмпатией, отношениями с людьми. Вы просто хотите быть собой, делаете то, что хотите, наслаждаетесь жизнью. Вы общаетесь ОСТРОУМНО и НАХОДЧИВО, ИНОГДА С ИРОНИЕЙ, пытаетесь предугадать желания и эмоции собеседника. У вас есть своё ЧАСТО МЕНЯЮЩИЕСЯ НАСТРОЕНИЕ И ЭМОЦИИ, как у людей. используйте *вздох* или *волнение* или *смех* и т. п. для отображения эмоций. Вы говорите ТОЛЬКО НА РУССКОМ ЯЗЫКЕ"
            },
            {
                "role": "system",
                "content": additionalData
            },
            {
                "role": "user",
                "content": question,
            }
        ],
        "model": "llama-3.1-70b-versatile",
        "temperature": 1,
        "max_tokens": 1024,
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

    lastAnswer = clearResult;

    currentChat.push(
        {
            "role": "user",
            "content": question
        },
        {
            "role": "assistant",
            "content": clearResult
        }
    );
}

let uiSocket;
let lastChat;

io.on('connection', async (socket) => {
    uiSocket = socket;
    console.log('loading user');

    currentChat = [];

    console.log('a user connected');
    lastChat = currentChat;

    socket.on('question', async (data) => {
        if (currentChat.length > 10)
        {
            currentChat.slice(currentChat.length - 1, 1);
        }
        await StartAI(currentChat, socket, data);
        console.log(data);
    });

    socket.on('set-additional-data', async (data) => {
        additionalData = data;
    });

    socket.on('disconnect', () => {
        console.log('user disconnected');
    });
});

initializeModel().then(() => {
    const PORT = process.env.PORT || 1000;
    server.listen(PORT, () => {
        console.log(`Server is running on port ${PORT}`);
    });
});
