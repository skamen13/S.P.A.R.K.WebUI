const Replicate = require("replicate");

const replicate = new Replicate({
    auth: "r8_IkewuSLcJryKovh0pwmjuYsMc4sBWcg0ftCs6",
});

const input = {
    prompt: "Реши задачу: Анне Александровне в подарок необходимо купить пять ода-\nкоробок конфет. В магазине «Сладость. одна коробка\nконфет стоит 350 р.,\nно сейчас там проходит акция: три ко-\nробки но цене двух. В магазине «Джем» каждая коробка стоит\n360 р. но при покупке больще четырех коробок действует скид-\nка 30% на всю покупку. В каком магазине покупка будет более\nСколько рублей ври этом сможет сэкономить Анна"
};

async function MAIN(){
    const options = {
        method: 'POST',
        headers: {
            Authorization: 'Bearer fw_3ZFaMhuSegnGwyonwuvFWWmv',
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            model: "accounts/fireworks/models/llama-v3p1-405b-instruct",
            max_tokens: 16384,
            top_p: 1,
            top_k: 40,
            presence_penalty: 0,
            frequency_penalty: 0,
            temperature: 0.6,
            messages: [
                {
                    role: "user",
                    content: "Реши задачу: Анне Александровне в подарок необходимо купить пять ода-\nкоробок конфет. В магазине «Сладость. одна коробка\nконфет стоит 350 р.,\nно сейчас там проходит акция: три ко-\nробки но цене двух. В магазине «Джем» каждая коробка стоит\n360 р. но при покупке больще четырех коробок действует скид-\nка 30% на всю покупку. В каком магазине покупка будет более\nСколько рублей ври этом сможет сэкономить Анна"
                }
            ]
        })    };

    fetch('https://api.fireworks.ai/inference/v1/chat/completions', options)
        .then(response => response.json())
        .then(response => console.log(response.choices[0].message.content))
        .catch(err => console.error(err));
}


MAIN();
