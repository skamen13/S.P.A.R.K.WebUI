const {search, ResultTypes} = require("google-sr");
const axios = require("axios");
const cheerio = require("cheerio");
const levenshtein = require("fast-levenshtein");
const https = require("https");
const Groq = require('groq-sdk');
const express = require('express');

const agent = new https.Agent({ rejectUnauthorized: false });

const groq = new Groq({
    apiKey: "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"
});


async function Search(query = "", numSentences = 60, socket, numPages = 2, user) {

    if (!user) {
        console.error('User object is not provided.');
        socket.emit('search_answer', 'User object is not provided.');
        return;
    }
    if (!user.searchChat) {
        user.searchChat = [];
    }

    const searchResults = await search({
        query: query,
        safeMode: false,
        filterResults: [ResultTypes.SearchResult]
    });

    if (searchResults.length === 0) {
        console.log('No results found.');
        socket.emit('search_answer', 'No results found.');
        return;
    }

    let allExcerpts = "";

    console.log(searchResults)

    let Sources = [];

    // Проход по первым numPages страницам
    for (let i = 0; i < Math.min(numPages, searchResults.length); i++) {
        const url = searchResults[i].link;
        const description = searchResults[i].description;

        Sources.push({
            "url": searchResults[i].link,
            "name": searchResults[i].title
        });
        console.log(Sources[i].url)
        console.log(Sources[i].url)

        try {
            const response = await axios.get(url, { httpsAgent: agent });
            const html = response.data;
            const $ = cheerio.load(html);

            // Извлечение видимого текста со страницы
            const visibleText = $('body').text();

            // Определение позиции, начиная с 20% от общего текста
            const startIdx = Math.floor(visibleText.length * 0.2);

            // Получение текста начиная с 20% Zот общего объема
            const textFromStart = visibleText.slice(startIdx);

            // Разбиение текста на предложения
            const sentences = textFromStart.match(/[^.!?]+[.!?]+/g) || [];

            // Если предложения найдены, добавляем первые numSentences предложений в allExcerpts
            if (sentences.length > 0) {
                const excerpt = sentences.slice(0, numSentences).join(' ').trim();
                allExcerpts += excerpt + "\n";
            }
        } catch (error) {
            socket.emit('search_answer', 'Error fetching the page:' + error);
            console.error('Error fetching the page:', error);
        }
    }

    // Если никаких отрывков не найдено, выводим сообщение
    if (allExcerpts === "") {
        console.log('No relevant excerpts found.');
        socket.emit('search_answer', 'No relevant excerpts found.');
        return;
    }

    // Отправляем текст для генерации ответа
    const chatCompletion = await groq.chat.completions.create({
        "messages": [
            {
                "role": "system",
                "content": "Вы доносите информацию для пользователей о любом их вопросе. Ваша информация и ответы должны быть НЕВЕРОЯТНО ТОЧНЫ и ПОНЯТНЫ любому. Если вы НЕ ЗАНЕТЕ ответа или информации о нём не предоставлено - ОТВЕЧАЙТЕ ИСПОЛЬЗУЯ ТО, ЧТО ЕСТЬ. Ваша цель предоставить пользователю КАК МОЖНО БОЛЬШЕ проверенной и полезной по вопросу информации. Если у вас ЕСТЬ ЧТО ДОБАВИТЬ и ВЫ ЗНАЕТЕ ЧТО ЭТО ПРАВДА, ДОБАВЛЯЙТЕ ЭТУ ИНФОРМАЦИЮ. Вы отвечаете БЕЗ ВАШИХ КОМЕНТАРИЕВ, ТОЛЬКО ФАКТЫ. Ваши ответы, как будто обрывки интересной статьи. вы говорите ТОЛЬКО НА РУССКОМ ЯЗЫКЕ"
            },
            {
                "role": "user",
                "content": "Развёрнуто (и с красивым оформлением) ответьте на вопрос \"" + query + "\" используя информацию:\n" + allExcerpts
            },
        ],
        "model": "gemma2-9b-it",
        "temperature": 0.5,
        "max_tokens": 3024,
        "top_p": 1,
        "stream": true,
        "stop": null
    });

    let finalAnswer = '';


    for await (const chunk of chatCompletion) {
        process.stdout.write(chunk.choices[0]?.delta?.content || '');

        finalAnswer += chunk.choices[0]?.delta?.content;

        socket.emit('search_answer', {
            response: finalAnswer,
            sources: Sources
        });
    }

    user.searchChat = [
        {
            "role": "system",
            "content": "Вы доносите информацию для пользователей о любом их вопросе. Ваша информация и ответы должны быть НЕВЕРОЯТНО ТОЧНЫ и ПОНЯТНЫ любому. Если вы НЕ ЗАНЕТЕ ответа или информации о нём не предоставлено - ОТВЕЧАЙТЕ ИСПОЛЬЗУЯ ТО, ЧТО ЕСТЬ. Ваша цель предоставить пользователю КАК МОЖНО БОЛЬШЕ проверенной и полезной по вопросу информации. Если у вас ЕСТЬ ЧТО ДОБАВИТЬ и ВЫ ЗНАЕТЕ ЧТО ЭТО ПРАВДА, ДОБАВЛЯЙТЕ ЭТУ ИНФОРМАЦИЮ. Вы отвечаете БЕЗ ВАШИХ КОМЕНТАРИЕВ, ТОЛЬКО ФАКТЫ. Ваши ответы, как будто обрывки интересной статьи. вы говорите ТОЛЬКО НА РУССКОМ ЯЗЫКЕ"
        },
        {
            "role": "user",
            "content": "Развёрнуто (и с красивым оформлением) ответьте на вопрос \"" + query + "\" используя информацию:\n" + allExcerpts
        },
        {
            "role": "assistant",
            "content": finalAnswer
        },
    ]
}

async function refineSearch(query = "", socket, user){
    // Отправляем текст для генерации ответа
    const chatCompletion = await groq.chat.completions.create({
        "messages": [
            ...user.searchChat,
            {
                "role": "user",
                "content": query
            },
        ],
        "model": "gemma2-9b-it",
        "temperature": 0.5,
        "max_tokens": 3024,
        "top_p": 1,
        "stream": true,
        "stop": null
    });

    let finalAnswer = '';

    for await (const chunk of chatCompletion) {
        process.stdout.write(chunk.choices[0]?.delta?.content || '');

        finalAnswer += chunk.choices[0]?.delta?.content;
    }

    user.searchChat.push(
        {
            "role": "user",
            "content": query
        },
        {
            "role": "assistant",
            "content": finalAnswer
        },
    );

    socket.emit('refine_answer', {
        response: finalAnswer,
    });
}

module.exports = {
    Search,
    refineSearch
};
