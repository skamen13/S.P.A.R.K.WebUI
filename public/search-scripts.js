const socket = io(); // Подключение к серверу через WebSocket

// Элементы страницы
const searchInput = document.getElementById('search-input');
const searchButton = document.getElementById('search-button');
const settingsIcon = document.getElementById('settings-icon');
const settingsPanel = document.getElementById('settings-panel');
const responseDiv = document.getElementById('response');
const sourcesDiv = document.getElementById('sources');
const refinementInput = document.getElementById('refinement-input');
const refinementButton = document.getElementById('refinement-button');
const chatMessages = document.getElementById('chat-messages');
const infoLength = document.getElementById('info-length');
const infoLengthValue = document.getElementById('info-length-value');

// Переключение панели настроек
settingsIcon.addEventListener('click', () => {
    settingsPanel.classList.toggle('show');
});

// Обработка клика по кнопке поиска
searchButton.addEventListener('click', () => {
    const query = searchInput.value;
    responseDiv.innerHTML = ''; // Очищаем ответ
    sourcesDiv.innerHTML = ''; // Очищаем источники
    chatMessages.innerHTML = ''; // Очищаем чат

    // Отображаем анимацию загрузки
    const loadingAnimation = document.createElement('div');
    loadingAnimation.className = 'loading-animation';
    loadingAnimation.innerHTML = '<div></div><div></div><div></div>';
    responseDiv.appendChild(loadingAnimation);
    loadingAnimation.style.display = 'inline-block';

    // Отправляем запрос на сервер
    socket.emit('smart-search', { query: query, infoLength: infoLength.value });
});

// Обработка ответа от сервера
socket.on('search_answer', (msg) => {
    const loadingAnimation = document.querySelector('.loading-animation');
    if (loadingAnimation) loadingAnimation.style.display = 'none';

    // Отображаем ответ
    responseDiv.innerHTML = formatText(msg.response);

    sourcesDiv.innerHTML = '';

    // Отображаем источники
    if (msg.sources && msg.sources.length > 0) {
        msg.sources.forEach(source => {
            const link = document.createElement('a');
            link.href = source.url;
            link.target = '_blank';
            link.innerHTML = `<img src="https://www.google.com/s2/favicons?domain=${new URL(source.url).hostname}" alt="icon"> ${source.name}`;
            sourcesDiv.appendChild(link);
        });
    }
});

// Обработка клика по кнопке уточнения
refinementButton.addEventListener('click', () => {
    const refinementQuery = refinementInput.value;
    const originalQuery = searchInput.value;

    // Добавляем новое сообщение пользователя в чат
    chatMessages.innerHTML += `<div class="message user">${refinementQuery}</div>`;

    // Отправляем уточнённый запрос на сервер
    socket.emit('refine-search', { query: originalQuery, refinement: refinementQuery, infoLength: infoLength.value });
});

// Обработка ответа на уточнённый запрос
socket.on('refine_answer', (msg) => {
    // Добавляем ответ системы в чат
    chatMessages.innerHTML += `<div class="message ai">${formatText(msg.response)}</div>`;
    chatMessages.scrollTop = chatMessages.scrollHeight; // Прокручиваем вниз
});

// Форматирование текста с учетом специальных символов
function formatText(text) {
    // Сначала обрабатываем заголовки (## в начале строки)
    text = text.replace(/^##\s*(.*)$/gm, '<h2>$1</h2>');

    // Затем обрабатываем жирный текст (**с двух сторон**)
    text = text.replace(/\*\*(.*?)\*\*/g, '<span class="bold">$1</span>');

    // Обрабатываем одиночные звездочки (*), заменяя их на точки
    text = text.replace(/(?<!\*)\*(?!\*)/g, '<span class="bold">•</span>');

    // Сохраняем разрывы строк
    text = text.replace(/\n/g, '<br>');

    return text;
}

socket.emit("login", "dev")
