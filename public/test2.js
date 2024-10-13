const nerdamer = require('nerdamer');
require('nerdamer/Calculus');
require('nerdamer/Algebra');
require('nerdamer/Solve');

const math = require('mathjs');

// Функция для решения уравнений и вычисления выражений
function solveExpression(expressionStr) {
    try {
        // Проверяем, есть ли в выражении знак равенства, чтобы решить уравнение
        if (expressionStr.includes('=')) {
            const solutions = nerdamer.solve(expressionStr, 'n').toString();
            return `Решение уравнения: n = ${solutions}`;
        } else {
            // Если это просто арифметическое выражение, вычисляем его
            const result = math.evaluate(expressionStr);
            return `Результат вычисления: ${result}`;
        }
    } catch (error) {
        return `Ошибка: ${error.message}`;
    }
}

// Примеры использования
const equation = "(n-2)*180/n = 90"; // Уравнение
const arithmeticExpression = "2 + 3 * (8 / 4)"; // Обычное арифметическое выражение

console.log(solveExpression(equation));
console.log(solveExpression(arithmeticExpression));
