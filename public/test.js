const rake = require('rake-js');

const text = "доклад по происхождению слова друг в русском языке";

// Извлечение ключевых слов
const keywords = rake.generate(text);

console.log(keywords);
