const socket = io(); // Подключение к серверу через WebSocket

// Элементы страницы
const searchInput = document.getElementById('search-input');
const searchButton = document.getElementById('search-button');
const settingsIcon = document.getElementById('settings-icon');
const settingsPanel = document.getElementById('settings-panel');
const siteCardsDiv = document.getElementById('site-cards');
const chatDiv = document.getElementById('chat');
const chatMessages = document.getElementById('chat-messages');
const refinementInput = document.getElementById('refinement-input');
const refinementButton = document.getElementById('refinement-button');
const infoLength = document.getElementById('info-length');
const infoLengthValue = document.getElementById('info-length-value');

// Переключение панели настроек
settingsIcon.addEventListener('click', () => {
    settingsPanel.classList.toggle('show');
});

// Обработка клика по кнопке поиска
searchButton.addEventListener('click', () => {
    const query = searchInput.value;

    siteCardsDiv.innerHTML = ''; // Очищаем предыдущие результаты
    chatDiv.style.display = 'none'; // Скрываем чат

    // Отправляем запрос на сервер
    socket.emit('search_query', query);
});

// Обработка ответа от сервера
socket.on('search_answer', (data) => {
    siteCardsDiv.innerHTML = ''; // Очищаем предыдущие результаты
    const descriptions = data.response.split('$'); // Разделение строк по символу новой строки

    // Отображение карточек для каждого сайта
    descriptions.forEach((description, index) => {
        if (index !== 0) {
            const siteCard = document.createElement('div');
            siteCard.className = 'site-card';
            siteCard.textContent = description;

            siteCard.addEventListener('click', () => {
                console.log("site card", index)

                // Выполнение умного поиска по выбранному сайту
                socket.emit('smart-search', { query: searchInput.value, siteUrl: data.sources[index - 1].url });

                // Показ чата
                chatDiv.style.display = 'block';
            });

            siteCardsDiv.appendChild(siteCard);
        }
    });
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

// Обработка результата умного поиска
socket.on('smart_search_answer', (data) => {
    siteCardsDiv.innerHTML = '';
    const message = document.createElement('div');
    message.className = 'response';
    message.innerHTML = formatText(data.response);
    siteCardsDiv.appendChild(message);
});

socket.emit("login", "dev")
