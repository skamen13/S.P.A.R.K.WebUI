const { getJson } = require("serpapi");

getJson({
    q: "the common ratio of gp 931 is",
    location: "Austin, Texas, United States",
    api_key: "a793622bcb1ebda9c86764b5e85637fc99d6fd3d75c4fdb052709ab6b327236d"
}).then(r => console.log(r));
