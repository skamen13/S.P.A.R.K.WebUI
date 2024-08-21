const { googleSearch } = require('@nrjdalal/google-parser')

async function Main (){
    const response = await googleSearch({ query: 'ai' })
    console.log(response)
}
Main()
