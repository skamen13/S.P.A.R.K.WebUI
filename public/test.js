const fetch = require('node-fetch');
const cheerio = require('cheerio');

async function searchQuestion(question) {
    const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(question)}`;
    try {
        const response = await fetch(searchUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/85.0.4183.102 Safari/537.36',
            },
        });
        const html = await response.text();

        // Используем cheerio для парсинга HTML
        const $ = cheerio.load(html);
        const snippets = [];
        $('.BNeawe').each((i, el) => {
            snippets.push($(el).text());
        });

        return snippets.slice(0, 5); // Вернуть первые 5 результатов
    } catch (error) {
        console.error('Error searching question:', error);
        return [];
    }
}

// Пример использования
searchQuestion('Какое расстояние до Луны?').then(results => console.log(results));
