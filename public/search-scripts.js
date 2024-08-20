const socket = io();
let lastLoadingAnimation;

const infoLength = document.getElementById('info-length');
const infoLengthValue = document.getElementById('info-length-value');
socket.on('search_answer', (msg) => {
    const responseDiv = document.getElementById('response');
    lastLoadingAnimation.style.display = 'none';
    responseDiv.innerHTML = '';
    responseDiv.innerText = msg;
});

document.getElementById('search-button').addEventListener('click', () => {
    // Логика для обработки поиска
    const query = document.getElementById('search-input').value;
    const responseDiv = document.getElementById('response');
    const loadingAnimation = document.createElement('div');

    loadingAnimation.className = 'loading-animation';
    loadingAnimation.innerHTML = '<div></div><div></div><div></div>';

    responseDiv.innerHTML = ''; // Очищаем ответ
    responseDiv.appendChild(loadingAnimation);
    loadingAnimation.style.display = 'inline-block';

    lastLoadingAnimation = loadingAnimation;

    socket.emit("smart-search", {query: query, infoLength: infoLength.value})
});

const settingsIcon = document.getElementById('settings-icon');
const settingsPanel = document.getElementById('settings-panel');

settingsIcon.addEventListener('click', () => {
    if (settingsPanel.classList.contains('show')) {
        settingsPanel.classList.remove('show');
        settingsIcon.style.transform = 'rotate(0deg)';
    } else {
        settingsPanel.classList.add('show');
        settingsIcon.style.transform = 'rotate(-90deg)';
    }
});

infoLength.addEventListener('input', () => {
    infoLengthValue.textContent = infoLength.value;
});

socket.emit("login", "dev")
