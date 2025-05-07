const axios = require("axios");
const { OLLAMA_MODEL } = require("../config");

async function ask(prompt) {
  try {
    const response = await axios.post("http://localhost:11434/api/generate", {
      model: OLLAMA_MODEL,
      prompt: prompt,
      stream: false,
      system: "You are a helpful assistant bro. Use emojis and slang.",
      options: {
        temperature: 0.7,
        top_p: 0.9,
        max_tokens: 750,
      },
    });

    if (response.status === 200) {
      return response.data.response;
    } else {
      return `Error: ${response.status} - ${response.statusText}`;
    }
  } catch (error) {
    console.error("Ollama Error:", error.message);
    return `Error: ${error.message}`;
  }
}

async function synonym(prompt) {
  try {
    const response = await axios.post("http://localhost:11434/api/generate", {
      model: OLLAMA_MODEL,
      prompt: prompt,
      stream: false,
      system:
        "Please give me a list of synonyms for the word or phrase in english.",
      options: {
        temperature: 0.7,
        top_p: 0.9,
        max_tokens: 200,
      },
    });

    if (response.status === 200) {
      return response.data.response;
    } else {
      return `Error: ${response.status} - ${response.statusText}`;
    }
  } catch (error) {
    console.error("Ollama Error:", error.message);
    return `Error: ${error.message}`;
  }
}

module.exports = { ask, synonym };
