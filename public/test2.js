const inputString = `Это пример **текста
с переносом строки**, и вот еще **одна часть текста**.`;

// Замена текста между двумя звездочками на символ '%'
const resultString = inputString.replace(/\*\*[\s\S]*?\*\*/g, '%');

console.log(resultString);
