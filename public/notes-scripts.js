// Подключение сокетов
const socket = io();
let previousText = ""; // Для сохранения предыдущего состояния текста

let currentAction = '';

// Получение ответа от ИИ
socket.on('notes_answer', (msg) => {
    document.getElementById('editor').innerHTML = removeUndefined(msg);
    console.log(msg);
    previousText = msg;
});

// Форматирование текста
function format(command, value = null) {
    document.execCommand(command, false, value);
}

// Вставка изображения
function insertImage() {
    const url = prompt('Введите URL изображения');
    if (url) {
        document.execCommand('insertImage', false, url);
    }
}

// Вставка ссылки
function insertLink() {
    const url = prompt('Введите URL ссылки');
    if (url) {
        document.execCommand('createLink', false, url);
    }
}

// Действия для ИИ
function aiAction(action) {
    let editorContent = document.getElementById('editor').innerHTML;

    switch(action) {
        case 'shorten':
            applyAIAction('Сократите этот текст в 2 раза.', editorContent);
            break;
        case 'lengthen':
            applyAIAction('Удлините этот текст в 2 раза.', editorContent);
            break;
        case 'formal':
            applyAIAction('Сделайте этот текст максимально формальным.', editorContent);
            break;
        case 'informal':
            applyAIAction('Сделайте этот текст максимально неформальным.', editorContent);
            break;
        case 'beautify':
            applyAIAction('Очень красиво оформите этот текст.', editorContent);
            break;
        case 'custom': // Кастомное действие
            if (currentAction !== ""){
                applyAIAction(currentAction, editorContent);
            }
            break;
        default:
            console.log('Неизвестное действие: ' + action);
    }
}

// Применение действия ИИ
function applyAIAction(action, content) {
    console.log('ИИ выполняет действие: ${action}');
    socket.emit("notes-action", {prompt: action, text: content})
    // Здесь будет отправка текста в ИИ модель и обработка ответа
    // После выполнения ИИ действия, обнови текст в редакторе, например:
}

// Кнопка "Перегенерировать"
function regenerateAIResponse() {
    let editorContent = document.getElementById('editor').innerHTML;
    applyAIAction('Перегенерируйте текст.', editorContent);
}

// Кнопка "Назад"
function revertText() {
    document.getElementById('editor').innerHTML = previousText;
}

// Удаление undefined из текста
function removeUndefined(text) {
    return text.replace(/undefined/g, "");
}

function openCustomActionInput() {
    currentAction = 'custom';
    openModal();
}

function openModal() {
    document.getElementById('modal').style.display = 'flex';
}

function closeModal() {
    document.getElementById('modal').style.display = 'none';
}

function submitModalInput() {
    const inputText = document.getElementById('modal-input').value;
    closeModal();

    currentAction = inputText;
}

// Сохранение своего действия
function saveCustomAction() {
    socket.emit('save_custom_action');
}

// Загрузка своего действия
function loadCustomAction() {
    socket.emit('load_custom_action');
}

socket.on('custom_action_content', function(content) {
    alert(`Ваше действие: ${content}`);
});

// Сохранение заметки
function saveNote() {
    const content = document.getElementById('editor').innerHTML;
    socket.emit('save_note', content);
}

// Загрузка заметки
function loadNote() {
    socket.emit('load_note');
}
