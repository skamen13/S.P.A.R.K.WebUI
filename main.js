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

const togetherApiKey = 'b1d33813a782e133a59ba32e103e75419915b499007c8b6ee1f34c5152dab438';
const together = new Together({ apiKey: togetherApiKey });

function removeUndefined(str) {
    const regex = /undefined/gi;
    return str.replace(regex, '');
}

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

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

async function StartAI(user, socket, question) {
    socket.emit('ai_answer', '...');
    let finalResult = '';

    user.currentChat.push({
        "role": "user",
        "content": question
    });

    const chatCompletion = await together.chat.completions.create({
        "messages": [
            {
                "role": "system",
                "content": "Вы - разговорный ИИ с эмоциями по имени Спарк..."
            },
            {
                "role": "system",
                "content": user.mainData
            },
            ...user.currentChat,
            {
                "role": "user",
                "content": question,
            }
        ],
        "model": user.model, // Используем модель пользователя
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

    user.lastAnswer = clearResult;

    user.currentChat.push({
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
                currentChat: [],
                lastAnswer: '',
                mainData: "",
                additionalData: "",
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
        if (currentUser.currentChat.length > 20) {
            currentUser.currentChat.slice(currentUser.currentChat.length - 1, 1);
        }
        await StartAI(currentUser, socket, data);
        console.log(data);
    });

    socket.on('set-data', async (data) => {
        if (currentUser) {
            currentUser.mainData = data;
        }
    });

    socket.on('switch-model', async (data) => {
        if (currentUser) {
            currentUser.model = data;
        }
    });

    socket.on('set-additional-data', async (data) => {
        if (currentUser) {
            currentUser.currentChat.push({
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
