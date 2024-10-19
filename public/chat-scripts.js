const socket = io();

let isAnswerReady = false;
let isConversationMode = false;
let lastAnswer = "";
let currentAnimatedElements = [];
let lastAnswerHtml = ""; // To store the last AI message's HTML
let lastSmartAnswer = "";

let aiMessage;

// Получаем кнопку по ID и добавляем обработчик события click
const svgButton = document.getElementById('svg-button');
svgButton.addEventListener('click', sendMessage);


socket.on('ai_answer_chunk', (msg) => {
    lastAnswer = removeTextInAsterisks(msg).cleanedText
    addAiContent(aiMessage, formatText(msg))
    lastAnswerHtml = formatText(msg);
});


socket.on('smart_answer_chunk', (msg) => {
    lastSmartAnswer = formatText(msg);
    updateExpandedContent(lastSmartAnswer);
});

socket.on('notification', (msg) => {
    const icon = msg.icon;
    const text = msg.text;
    showNotification(text, icon);
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

socket.on('smart_answer_ready', async (msg) => {
    convertLastAiMessageToHiddenHtml(lastSmartAnswer);
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

function convertLastAiMessageToHiddenHtml(hiddenHtml) {
    const chatWindow = document.getElementById("chat-window");

    // Находим последнее сообщение ИИ
    const aiMessages = chatWindow.getElementsByClassName('ai-message');
    if (aiMessages.length === 0) return;  // Нет сообщений ИИ

    const lastAiMessage = aiMessages[aiMessages.length - 1];

    // Проверяем, есть ли уже скрытый текст
    if (lastAiMessage.querySelector('.hidden-html')) {
        console.warn("Это сообщение уже содержит скрытый HTML.");
        return;
    }

    // Создаем скрытый HTML элемент
    const hiddenHtmlElement = document.createElement('span');
    hiddenHtmlElement.classList.add('hidden-html');
    hiddenHtmlElement.style.display = 'none';  // Изначально скрыто
    hiddenHtmlElement.innerHTML = hiddenHtml;
    lastAiMessage.appendChild(hiddenHtmlElement);

    // Создаем и добавляем SVG кнопку
    const button = document.createElement('button');
    button.classList.add('svg-button', 'ai-button');
    button.innerHTML = `<img src="edit.svg" alt="Show hidden text" />`;
    lastAiMessage.appendChild(button);

    // Добавляем обработчик для кнопки
    button.addEventListener('click', () => {
        console.log(hiddenHtml);  // Воспроизводим скрытый текст
        expandNotification(hiddenHtml, "smart_search.svg")
    });

    console.log("Последнее сообщение ИИ обновлено скрытым HTML.");
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
    if (messageContainer.classList.contains('loading')) {
        messageContainer.classList.remove('loading'); // Remove loading class
    }

    messageContainer.innerHTML = htmlContent;

}

function populateChatFromList(messages) {
    const chatWindow = document.getElementById("chat-window");

    for (let i = 0; i < messages.length; i++) {
        const message = messages[i];

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

            // Проверяем, есть ли следующее сообщение от системы
            if (i + 1 < messages.length && messages[i + 1].role === "system") {
                const systemMessage = messages[i + 1];

                // Проверяем, начинается ли сообщение с "Ответ из поиска:\n"
                if (systemMessage.content.startsWith("Ответ из поиска:\n")) {
                    const hiddenHtmlContent = systemMessage.content.replace("Ответ из поиска:\n", "");
                    const formattedHiddenHtml = formatText(hiddenHtmlContent);

                    // Преобразуем последнее сообщение ИИ в сообщение со скрытым HTML
                    convertLastAiMessageToHiddenHtml(formattedHiddenHtml);

                    // Пропускаем следующее сообщение, так как оно обработано
                    i++;
                }
            }
        }
        // Прокрутка вниз для каждого сообщения
        chatWindow.scrollTop = chatWindow.scrollHeight;
    }
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

function showNotification(message, iconSrc) {
    const notification = document.getElementById('notification');
    const notificationText = notification.querySelector('.notification-text');
    const notificationIcon = notification.querySelector('.notification-icon');

    // Изменяем содержимое уведомления
    notificationText.textContent = message;
    if (iconSrc) {
        notificationIcon.src = iconSrc;
    }

    // Показываем уведомление
    notification.classList.remove('hidden');
    notification.classList.add('visible');

    // Автоматическое скрытие уведомления через 5 секунд
    setTimeout(() => {
        notification.classList.remove('visible');
        notification.classList.add('hidden');
    }, 5000);

    // Добавляем обработчик на нажатие для открытия развернутого меню
    notification.addEventListener('click', () => expandNotification(message, iconSrc));
}

function expandNotification(message, iconSrc) {
    const expandedNotification = document.getElementById('expanded-notification');
    const blurBackground = document.getElementById('blur-background');
    const expandedText = expandedNotification.querySelector('.expanded-text');
    const expandedIcon = expandedNotification.querySelector('.expanded-icon');

    // Устанавливаем иконку и текст в развернутом меню
    expandedText.innerHTML = `${message}`;
    expandedIcon.src = iconSrc;

    // Плавное раскрытие меню и фона
    expandedNotification.classList.remove('hidden');
    expandedNotification.classList.add('visible');
    blurBackground.classList.remove('hidden');
    blurBackground.classList.add('visible');

    // Закрытие при клике на крестик
    document.querySelector('.close-btn').addEventListener('click', closeExpandedNotification);
}

function closeExpandedNotification() {
    const expandedNotification = document.getElementById('expanded-notification');
    const blurBackground = document.getElementById('blur-background');

    // Плавное закрытие меню и фона
    expandedNotification.classList.remove('visible');
    expandedNotification.classList.add('hidden');
    blurBackground.classList.remove('visible');
    blurBackground.classList.add('hidden');
}

// Пример изменения HTML-содержимого в развернутом меню
function updateExpandedContent(htmlContent) {
    const expandedText = document.querySelector('.expanded-text');
    expandedText.innerHTML = htmlContent;
}

socket.emit("login", "dev")
