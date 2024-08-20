const {search, ResultTypes} = require("google-sr");
const axios = require("axios");
const cheerio = require("cheerio");
const levenshtein = require("fast-levenshtein");
const https = require("https");
const Groq = require('groq-sdk');
const express = require('express');
const app = express();
const port = 3000;

const agent = new https.Agent({ rejectUnauthorized: false });

const groq = new Groq({
    apiKey: "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"
});


async function Search(query = "", numSentences = 60, socket) {
    const searchResults = await search({
        query: query,
        safeMode: false,
        filterResults: [ResultTypes.SearchResult]
    });

    if (searchResults.length === 0) {
        console.log('No results found.');
        return;
    }

    const url = searchResults[0].link;
    const description = searchResults[0].description;

    try {
        const response = await axios.get(url, { httpsAgent: agent });
        const html = response.data;
        const $ = cheerio.load(html);

        // Extract visible text from the page
        const visibleText = $('body').text();

        // Find the closest match to the description
        const sentences = visibleText.match(/[^.!?]+[.!?]+/g) || [];
        let closestSentence = '';
        let minDistance = Infinity;

        sentences.forEach(sentence => {
            const distance = levenshtein.get(description, sentence);
            if (distance < minDistance) {
                minDistance = distance;
                closestSentence = sentence;
            }
        });

        if (closestSentence === '') {
            console.log('No similar text found.');
            return;
        }

        // Find start position of the closest sentence
        const startIdx = visibleText.indexOf(closestSentence);
        if (startIdx === -1) {
            console.log('Closest sentence not found in the text.');
            return;
        }

        // Get the portion of the text starting from the closest sentence
        const textFromStart = visibleText.slice(startIdx);

        // Limit to the number of sentences specified
        const excerpt = textFromStart.match(/[^.!?]+[.!?]+/g)?.slice(0, numSentences).join(' ').trim() || '';

        const chatCompletion = await groq.chat.completions.create({
            "messages": [
                {
                    "role": "system",
                    "content": "Вы доносите информацию для пользователей о любом их вопросе. Ваша информация и ответы должны быть НЕВЕРОЯТНО ТОЧНЫ и ПОНЯТНЫ любому. Если вы НЕ ЗАНЕТЕ ответа или информации о нём не предоставлено - ОТВЕЧАЙТЕ ИСПОЛЬЗУЯ ТО, ЧТО ЕСТЬ. Вы отвечаете БЕЗ ВАШИХ КОМЕНТАРИЕВ, ТОЛЬКО ФАКТЫ. Ваши ответы, как будто обрывки интересной статьи. вы говорите ТОЛЬКО НА РУССКОМ ЯЗЫКЕ"
                },
                {
                    "role": "user",
                    "content": "Развёрнуто ответьте на вопрос \"" + query + "\" используя информацию:\n" + excerpt
                },
            ],
            "model": "gemma2-9b-it",
            "temperature": 0.5,
            "max_tokens": 1024,
            "top_p": 1,
            "stream": false,
            "stop": null
        });

        console.log(chatCompletion.choices[0].message.content);

        socket.emit('search_answer', chatCompletion.choices[0].message.content);

    } catch (error) {
        console.error('Error fetching the page:', error);
    }
}

module.exports = {
    Search
};
