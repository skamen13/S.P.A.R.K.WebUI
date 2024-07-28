const socket = io();
let messageElement;

const input = document.getElementById('message-input');
const sendButton = document.getElementById('send-button');
const micButton = document.getElementById('mic-button');
const visualizerContainer = document.getElementById('visualizer-container');
const visualizer = document.getElementById('visualizer');
const chatHistory = document.getElementById('chat-history');

let audioContext, analyser, dataArray, source;

socket.on('ai_answer_chunk', (msg) => {
    displayMessage(msg, 'ai', false);
});

socket.on('ai_answer', (msg) => {
    displayMessage(msg, 'ai');
});

socket.on('user_input_bubble', (msg) => {
    displayMessage(msg, 'user');
});

input.addEventListener('input', () => {
    if (input.value.trim() === '') {
        sendButton.style.display = 'none';
        micButton.style.display = 'block';
    } else {
        sendButton.style.display = 'block';
        micButton.style.display = 'none';
    }
});

micButton.addEventListener('click', () => {
    if (visualizerContainer.style.display === 'none') {
        startVisualizer();
    } else {
        stopVisualizer();
    }
});

sendButton.addEventListener('click', () => {
    sendMessage();
});

input.addEventListener('keypress', (event) => {
    if (event.key === 'Enter') {
        sendMessage();
    }
});

function startVisualizer() {
    visualizerContainer.style.display = 'block';
    input.style.display = 'none';
    micButton.textContent = '❌';

    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    analyser = audioContext.createAnalyser();
    analyser.fftSize = 256;
    const bufferLength = analyser.frequencyBinCount;
    dataArray = new Uint8Array(bufferLength);

    navigator.mediaDevices.getUserMedia({ audio: true })
        .then(stream => {
            source = audioContext.createMediaStreamSource(stream);
            source.connect(analyser);
            drawVisualizer();
        })
        .catch(err => console.log(err));
}

function stopVisualizer() {
    visualizerContainer.style.display = 'none';
    input.style.display = 'block';
    micButton.textContent = '🎤';

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
    const colors = ['rgb(0,119,0)', 'rgb(0,80,173)', 'rgb(199,5,59)']; // Цвета для каждой линии

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

function sendMessage() {
    const message = input.value.trim();
    if (message) {
        displayMessage(message, 'user');
        socket.emit('question', message);
        input.value = '';
        sendButton.style.display = 'none';
        micButton.style.display = 'block';
    }
}

function displayMessage(message, sender, newMessage = true) {
    if (newMessage) {
        messageElement = document.createElement('div');
        messageElement.classList.add('message', sender);
        const result = removeTextInAsterisks(message);
        messageElement.textContent = result.cleanedText;
        chatHistory.appendChild(messageElement);
        chatHistory.scrollTop = chatHistory.scrollHeight;
    } else {
        const result = removeTextInAsterisks(message);
        messageElement.textContent = result.cleanedText;
        chatHistory.scrollTop = chatHistory.scrollHeight;
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
        cleanedText: cleanedText,
        removedTexts: matches
    };
}
