const socket = io();
let messageElement;

let isAnswerReady = false;
let isConversationMode = false;
let lastAnswer = "";

const input = document.getElementById('message-input');
const sendButton = document.getElementById('send-button');
const visualizerContainer = document.getElementById('visualizer-container');
const visualizer = document.getElementById('visualizer');
const chatHistory = document.getElementById('chat-history');
const subtitleContainer = document.getElementById('subtitle-container');
const subtitleText = document.getElementById('subtitle-text');

let audioContext, analyser, dataArray, source;

socket.on('ai_answer_chunk', (msg) => {
    displayMessage(msg, 'ai', false);
});

socket.on('ai_answer', (msg) => {
    displayMessage(msg, 'ai');
});

socket.on('ai_answer-ready', async (msg) => {
    isAnswerReady = true;
    await displayMessage(msg, 'ai', false, true);
    console.log("answer is ready for tts")
});

socket.on('user_input_bubble', (msg) => {
    isAnswerReady = false;
    displayMessage(msg, 'user');
});



sendButton.addEventListener('click', async () => {
    await sendMessage();
});

input.addEventListener('keypress', async (event) => {
    if (event.key === 'Enter') {
        await sendMessage();
    }
});

function startVisualizer() {
    isConversationMode = true;
    socket.emit('set-conversational-mode', isConversationMode);
    visualizerContainer.style.display = 'block';
    input.style.display = 'none';

    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    analyser = audioContext.createAnalyser();
    analyser.fftSize = 256;
    const bufferLength = analyser.frequencyBinCount;
    dataArray = new Uint8Array(bufferLength);

    navigator.mediaDevices.getUserMedia({ audio: true })
        .then(stream => {
            source = audioContext.createMediaStreamSource(stream);
            source.connect(analyser);

        })
        .catch(err => console.log(err));
}

function stopVisualizer() {
    isConversationMode = false;
    socket.emit('set-conversational-mode', isConversationMode);
    visualizerContainer.style.display = 'none';
    input.style.display = 'block';

    if (audioContext) {
        audioContext.close();
    }
}

function drawVisualizer() {
    const canvasCtx = visualizer.getContext('2d');
    const WIDTH = visualizer.width;
    const HEIGHT = visualizer.height;

    let maxAmplitude = 0;
    const smoothingFactor = 0.3; // Коэффициент сглаживания для автоматической регулировки
    const strengthFactors = [0.5, 2.5, 1.5]; // Переменные для регулировки силы колебаний для каждой линии
    const colors = ['rgb(97,0,119)', 'rgb(0,80,173)', 'rgb(5,199,176)']; // Цвета для каждой линии

    function draw() {
        requestAnimationFrame(draw);

        analyser.getByteTimeDomainData(dataArray);

        // Найти текущую максимальную амплитуду
        let currentMax = 0;
        for (let i = 0; i < dataArray.length; i++) {
            if (dataArray[i] > currentMax) {
                currentMax = dataArray[i];
            }
        }

        // Постепенно обновляем maxAmplitude для сглаживания резких изменений
        maxAmplitude = smoothingFactor * maxAmplitude + (1 - smoothingFactor) * currentMax;

        canvasCtx.fillStyle = '#333';
        canvasCtx.fillRect(0, 0, WIDTH, HEIGHT);

        const sliceWidth = WIDTH * 1.0 / dataArray.length;

        strengthFactors.forEach((strengthFactor, index) => {
            canvasCtx.lineWidth = 8;
            canvasCtx.strokeStyle = colors[index];
            canvasCtx.beginPath();

            let x = 0;

            for (let i = 0; i < dataArray.length; i++) {
                const v = dataArray[i] * strengthFactor;
                const y = v + HEIGHT / 2 * - strengthFactor;

                if (i === 0) {
                    canvasCtx.moveTo(x, y);
                } else {
                    canvasCtx.lineTo(x, y);
                }

                x += sliceWidth;
            }

            canvasCtx.stroke();
        });
    }

    draw();
}

async function sendMessage() {
    let message = input.value.trim();
    if (message) {
        displayMessage(message, 'user');
        socket.emit('question', message);
        input.value = '';
        sendButton.style.display = 'none';
    }
}

async function displayMessage(message, sender, newMessage = true, isFinal = false) {
    if (newMessage) {
        messageElement = document.createElement('div');
        messageElement.classList.add('message', sender);
        let result = removeTextInAsterisks(message);
        if (isFinal) result = await processText(message);
        messageElement.textContent = result.cleanedText;
        chatHistory.appendChild(messageElement);
        lastAnswer = result.cleanedText
        chatHistory.scrollTop = chatHistory.scrollHeight;
    } else {
        let result = removeTextInAsterisks(message);
        if (isFinal) result = await processText(message);
        messageElement.textContent = result.cleanedText;
        chatHistory.scrollTop = chatHistory.scrollHeight;
        lastAnswer = result.cleanedText
    }
}

function removeTextInAsterisks(input) {
    const regex = /\*(.*?)\*/g;
    const matches = [];
    let match;

    while ((match = regex.exec(input)) !== null) {
        matches.push(match[1]);
    }

    const cleanedText = input.replace(regex, '');

    return {
        cleanedText: input,
        removedTexts: matches
    };
}


function showUserSubtitle(text) {
    subtitleText.style.color = '#3a96ff';
    subtitleText.textContent = text;
    subtitleContainer.classList.remove('hidden');
    subtitleContainer.classList.add('fadeIn');
    setTimeout(() => {
        subtitleContainer.classList.remove('fadeIn');
    }, 300); // Длительность анимации
}

function showSparkSubtitle(text) {
    subtitleText.style.color = '#ffa43a';
    subtitleText.textContent = text;
    subtitleContainer.classList.remove('hidden');
    subtitleContainer.classList.add('fadeIn');
    setTimeout(() => {
        subtitleContainer.classList.remove('fadeIn');
    }, 300); // Длительность анимации
}

function hideSubtitle() {
    subtitleContainer.classList.add('hidden');
}

showUserSubtitle("Пример субтитра");

async function searchQuestion(question) {
    // Формируем URL для запроса в Google
    const url = `https://www.google.com/search?q=${encodeURIComponent(question)}`;

    try {
        // Делаем запрос к Google
        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            }
        });

        // Проверяем успешность запроса
        if (response.ok) {
            const text = await response.text();
            const parser = new DOMParser();
            const doc = parser.parseFromString(text, 'text/html');

            // Извлекаем цитаты из результатов поиска
            const snippets = doc.querySelectorAll('.BNeawe.s3v9rd.AP7Wnd');

            // Если найдены цитаты, возвращаем первую
            if (snippets.length > 0) {
                return snippets[0].textContent;
            } else {
                return "Ответ не найден";
            }
        } else {
            return "Ошибка при выполнении запроса";
        }
    } catch (error) {
        return `Ошибка: ${error.message}`;
    }
}


async function processText(text) {
    // Удаляем все слова в звёздочках и скобках
    text = text.replace(/(\*.*?\*)|(\(.*?\))|(\[.*?\])/g, "");

    // Удаляем все звёздочки, кавычки и скобки
    text = text.replace(/[\*"'\(\)\[\]]/g, "");

    // Переводим текст на русский язык
    text = await translateToRussian(text);

    return {
        cleanedText: text
    };
}

async function translateToRussian(text) {
    const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=en|ru`;

    try {
        const response = await fetch(url);
        const data = await response.json();
        return data.responseData.translatedText;
    } catch (error) {
        console.error("Ошибка перевода:", error);
        return text; // Возвращаем оригинальный текст в случае ошибки
    }
}
