const algorithmia = require('algorithmia')
const algorithmiaApiKey = require('../credentials/algorithmia.json').apiKey
const sentenceBoundaryDetection = require('sbd')
const watsonApiKey = require('../credentials/watson-nlu.json').apikey
const NaturalLanguageUnderstandingV1 = require('watson-developer-cloud/natural-language-understanding/v1.js')
const nlu = new NaturalLanguageUnderstandingV1({
    iam_apikey: watsonApiKey,
    version: '2018-04-05',
    url: 'https://gateway.watsonplatform.net/natural-language-understanding/api/'
})
const state = require('./state.js')
async function robot(){
    console.log('> [Robo de texto] Iniciando...')
    const content = state.load()
    await fetchContentFromWikipedia(content)
    sanitizeContent(content)
    breakContentIntoSentences(content)
    limitMaximumSentences(content)
    await fetchKeywordsOfAllSentences(content)
    state.save(content)
     async function fetchContentFromWikipedia(content){
        console.log('> [Robo de texto] Buscando conteudo na Wikipedia')
        const algorithmiaAuthenticated = algorithmia(algorithmiaApiKey)
        const wikipediaAlgorithm = algorithmiaAuthenticated.algo('web/WikipediaParser/0.1.2')
        const wikipediaResponse = await wikipediaAlgorithm.pipe({
            'lang': content.lang, 
            'articleName': content.searchTerm
        })
        const wikipediaContent = wikipediaResponse.get()
        content.sourceContentOriginal = wikipediaContent.content
        console.log('> [Robo de texto] Busca concluida!')
    }
    function sanitizeContent(content){
        const withoutBlankLinesAndMarkdown = removeBlankLinesAndMarkdown(content.sourceContentOriginal)
        const withoutDatesInParentheses = removeDatesInParentheses(withoutBlankLinesAndMarkdown)
        content.sourceContentSanitized = withoutDatesInParentheses 
        function removeBlankLinesAndMarkdown(text){
            const allLines = text.split('\n')
            const withoutBlankLinesAndMarkdown = allLines.filter((line) => {
                if(line.trim().length===0 || line.trim().startsWith('=')){
                    return false
                }
                return true
            })
            return withoutBlankLinesAndMarkdown.join(' ')
        }
    }
    function removeDatesInParentheses(text){
        return text.replace(/\((?:\([^()]*\)|[^()])*\)/gm, '').replace(/  /g,' ')
    }
    function breakContentIntoSentences(content){
        content.sentences =[]
        const sentences = sentenceBoundaryDetection.sentences(content.sourceContentSanitized)
        
        sentences.forEach((sentence) =>{
            content.sentences.push({
                text: sentence,
                keywords: [],
                images: []
            })
        })
    }
    function limitMaximumSentences(content){
        content.sentences = content.sentences.slice(0, content.maximumSentences)
    }
    async function fetchKeywordsOfAllSentences(content){
        console.log('> [Robo de texto] Iniciando busca por palavras chaves no Watson')
        for(const sentence of content.sentences){
            console.log(`> [Robo de texto] Expressao: "${sentence.text}"`)
            sentence.keywords = await fetchWatsonAndReturnKeywords(sentence.text)
            console.log(`> [Robo de texto] Palavras chaves: ${sentence.keywords.join(', ')}\n`)
        }
    }
    async function fetchWatsonAndReturnKeywords(sentence){
        return new Promise((resolve, reject)=>{
            nlu.analyze({
                text: sentence,
                features: {
                    keywords: {}
                }
            }, (error, response)=> {
                if (error ){
                    reject(error)
                    return
                }
                const keywords = response.keywords.map((keyword)=>{
                    return keyword.text
                })
                resolve(keywords)
            })
        })
    }
}
module.exports = robot