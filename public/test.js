const axios = require('axios');

const fs = require('fs');
const path = require('path');

// helper function to help you convert your local images into base64 format
async function toB64(imgPath) {
    const data = fs.readFileSync(path.resolve(imgPath));
    return Buffer.from(data).toString('base64');
}

const api_key = "SG_699bf3899a9c9d5c";
const url = "https://api.segmind.com/v1/llava-13b";

const data = {
    "messages": [
        {
            "role": "user",
            "content" : "tell me a joke on cats"
        },
        {
            "role": "assistant",
            "content" : "here is a joke about cats..."
        },
        {
            "role": "user",
            "content" : "now a joke on dogs"
        },
    ]
};

(async function() {
    try {
        const response = await axios.post(url, data, { headers: { 'x-api-key': api_key } });
        console.log('Answer:', response.data.choices[0].message.get(''));
    } catch (error) {
        console.error('Error:', error.response.data);
    }
})();
