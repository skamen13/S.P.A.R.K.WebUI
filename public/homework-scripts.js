document.addEventListener('DOMContentLoaded', function() {
    const socket = io();
    const stepsContainer = document.getElementById('steps-container');
    let currentStepElement = null;

    socket.on('next-homework-step', function(stepData) {
        // Создаем новый элемент для следующего шага
        const stepElement = document.createElement('div');
        stepElement.className = 'step';
        stepElement.innerHTML = `
            <h2>${stepData.title}</h2>
            <p class="animated-text"></p>
        `;

        stepsContainer.appendChild(stepElement);
        currentStepElement = stepElement;
    });

    socket.on('next-homework-token', function(token) {
        if (currentStepElement) {
            const textElement = currentStepElement.querySelector('.animated-text');
            animateToken(textElement, token);
        }
    });

    function animateToken(element, token) {
        const span = document.createElement('span');
        span.innerHTML = token;
        element.appendChild(span);

        // Анимация появления токена
        span.style.opacity = 0;
        span.style.transform = 'translateY(-10px)';
        setTimeout(() => {
            span.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
            span.style.opacity = 1;
            span.style.transform = 'translateY(0)';
        }, 50);
    }

    socket.emit("math-homework-search", "https://firebasestorage.googleapis.com/v0/b/source-410210.appspot.com/o/images%2F1725542508849.jpg?alt=media&token=6e79a912-8eff-4dae-a1fb-d3f1de719046");
});
