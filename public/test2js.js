const { text2voice } = require('nayan-server')
const text = 'Привет мир';
const name = 'Tanisha';
const file = "nayan.mp3"
text2voice(text, name, file).then(data => {
    console.log(data)
})
