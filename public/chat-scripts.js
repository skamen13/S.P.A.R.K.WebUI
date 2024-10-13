const socket = io();

let isAnswerReady = false;
let isConversationMode = false;
let lastAnswer = "";
let currentAnimatedElements = [];

let aiMessage;

// Получаем кнопку по ID и добавляем обработчик события click
const svgButton = document.getElementById('svg-button');
svgButton.addEventListener('click', sendMessage);


socket.on('ai_answer_chunk', (msg) => {
    lastAnswer = removeTextInAsterisks(msg).cleanedText
    addAiContent(aiMessage, formatText(msg))
});

socket.on('ai_answer', (msg) => {
    currentAnimatedElements = [];
    aiMessage = addAiMessage(); // Инициируем анимацию загрузки
});

socket.on('ai_error', (msg) => {
    currentAnimatedElements = [];
    aiMessage = addErrorMessage(); // Инициируем анимацию загрузки
    addAiContent(aiMessage, formatText(msg))
});

// Обработчик события, когда AI сообщение готово
socket.on('ai_answer-ready', async (msg) => {
    isAnswerReady = true;
    console.log("Answer is ready for TTS");
});

socket.on('load-messages', (msg) => {
    console.log(msg)
    populateChatFromList(msg);
});

document.getElementById("user-input").addEventListener("keypress", function(e) {
    if (e.key === 'Enter') {
        sendMessage();
    }
});


function requestSynthesis(text = "") {
    const sentence = text; // Пример текста
    const gender = 0; // Пример пола

    socket.emit('synthesizeSpeech', { sentence, gender });
}

// Получение и воспроизведение аудиофайла
socket.on('audioData', (data) => {
    const audioData = atob(data.audio);
    const audioBuffer = new Uint8Array(audioData.length);
    for (let i = 0; i < audioData.length; i++) {
        audioBuffer[i] = audioData.charCodeAt(i);
    }

    const context = new (window.AudioContext || window.webkitAudioContext)();
    context.decodeAudioData(audioBuffer.buffer, (buffer) => {
        const source = context.createBufferSource();
        source.buffer = buffer;
        source.connect(context.destination);
        source.start(0);
    });
});

function sendMessage() {
    console.log("MESSAGE")
    const userInput = document.getElementById("user-input");
    const messageText = userInput.value.trim();

    if (messageText === "") return;

    // Создаем сообщение пользователя
    const userMessage = document.createElement("div");
    userMessage.classList.add("message", "user-message");
    userMessage.innerText = messageText;

    // Добавляем сообщение в окно чата
    const chatWindow = document.getElementById("chat-window");
    chatWindow.appendChild(userMessage);
    userInput.value = "";

    // Автопрокрутка вниз
    chatWindow.scrollTop = chatWindow.scrollHeight;

    socket.emit('question', messageText);
}

// Функция для добавления сообщения ИИ с анимацией загрузки
function addAiMessage() {

    if (aiMessage) aiMessage = aiMessage.style.marginBottom = "1px"

    const chatWindow = document.querySelector('.chat-window');

    // Создаём контейнер для сообщения
    const messageContainer = document.createElement('div');
    messageContainer.classList.add('message', 'ai-message', 'loading'); // Добавляем класс для загрузки

    // Добавляем контейнер в окно чата
    chatWindow.appendChild(messageContainer);

    messageContainer.style.marginBottom = "70px"

    // Прокручиваем вниз, чтобы увидеть новое сообщение
    chatWindow.scrollTop = chatWindow.scrollHeight;

    return messageContainer; // Возвращаем контейнер для добавления контента
}

function addErrorMessage() {

    if (aiMessage) aiMessage = aiMessage.style.marginBottom = "1px"

    const chatWindow = document.querySelector('.chat-window');

    // Создаём контейнер для сообщения
    const messageContainer = document.createElement('div');
    messageContainer.classList.add('message', 'error-message'); // Добавляем класс для загрузки

    // Добавляем контейнер в окно чата
    chatWindow.appendChild(messageContainer);

    messageContainer.style.marginBottom = "70px"

    // Прокручиваем вниз, чтобы увидеть новое сообщение
    chatWindow.scrollTop = chatWindow.scrollHeight;

    return messageContainer; // Возвращаем контейнер для добавления контента
}

// Функция для остановки анимации загрузки и добавления HTML-контента по одному элементу
function addAiContent(messageContainer, htmlContent) {
    // Убираем класс загрузки при появлении первого элемента
    if (messageContainer.classList.contains('loading')) {
        messageContainer.classList.remove('loading'); // Убираем класс загрузки
    }

    const chatWindow = document.querySelector('.chat-window');

    chatWindow.scrollTop = chatWindow.scrollHeight;

    messageContainer.innerHTML = htmlContent;
}

function populateChatFromList(messages) {
    const chatWindow = document.getElementById("chat-window");

    messages.forEach(message => {
        if (message.role === "user") {
            // Создаем сообщение пользователя
            const userMessage = document.createElement("div");
            userMessage.classList.add("message", "user-message");
            userMessage.innerText = message.content;

            // Добавляем сообщение в окно чата
            chatWindow.appendChild(userMessage);
        } else if (message.role === "assistant") {
            // Создаем сообщение помощника
            const aiMessage = addAiMessage(); // Создаем контейнер для сообщения

            // Добавляем HTML контент, отформатированный функцией formatText
            addAiContent(aiMessage, formatText(message.content));
        }
        // Прокрутка вниз для каждого сообщения
        chatWindow.scrollTop = chatWindow.scrollHeight;
    });
}

function formatText(text) {
    // Сначала обрабатываем заголовки (## в начале строки)
    text = text.replace(/^##\s*(.*)$/gm, '<h2>$1</h2>');

    // Затем обрабатываем жирный текст (**с двух сторон**)
    text = text.replace(/\*\*(.*?)\*\*/g, '<strong><span class="bold">$1</span></strong>');

    text = text.replace(/\$(.*?)\$/g, '<em>$1</em>');

    // Обрабатываем одиночные звездочки (*), заменяя их на точки
    text = text.replace(/(?<!\*)\*(?!\*)/g, '<span class="bold">  •</span>');

    // Сохраняем разрывы строк
    text = text.replace(/\n/g, '<br>');

    return text;
}

function removeTextInAsterisks(input) {
    let text = input
    text = text.replace(/(\*.*?\*)|(\(.*?\))|(\[.*?\])/g, "");

    // Удаляем все звёздочки, кавычки и скобки
    text = text.replace(/[\*"'\(\)\[\]]/g, "");

    return {
        cleanedText: text,
    };
}

socket.emit("login", "dev")
