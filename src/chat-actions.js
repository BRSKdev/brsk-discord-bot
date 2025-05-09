const axios = require("axios");
const fs = require("fs");
const path = require("path");
const { OLLAMA_MODEL, OLLAMA_VISION_MODEL } = require("../config");

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

/**
 * Analyzes an image with a given prompt
 * @param {string} prompt - The prompt for image analysis
 * @param {string} imageUrl - The URL of the image to analyze
 * @returns {Promise<string>} The AI's response
 */
async function seeImage(prompt, imageUrl) {
  try {
    // Create a temporary directory if it doesn't exist
    const tempDir = path.join(__dirname, "../temp");
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    // Download the image to a temporary file
    const imagePath = path.join(tempDir, `image_${Date.now()}.jpg`);
    const imageResponse = await axios({
      method: "GET",
      url: imageUrl,
      responseType: "stream",
    });

    // Save the image to a file
    const writer = fs.createWriteStream(imagePath);
    imageResponse.data.pipe(writer);

    // Wait for the image to be saved
    await new Promise((resolve, reject) => {
      writer.on("finish", resolve);
      writer.on("error", reject);
    });

    // Read the saved image and convert to base64
    const imageBuffer = fs.readFileSync(imagePath);
    const base64Image = imageBuffer.toString("base64");

    // Get the MIME type based on file extension
    const mime = imageUrl.toLowerCase().endsWith(".png")
      ? "image/png"
      : "image/jpeg";

    console.log(`Processing image: ${imagePath} (${imageBuffer.length} bytes)`);

    // Send request to Ollama
    const response = await axios.post("http://localhost:11434/api/generate", {
      model: OLLAMA_VISION_MODEL,
      prompt: prompt || "What is in this image?",
      images: [base64Image],
      stream: false,
      system:
        "You are a helpful assistant for image analysis. Use emojis and descriptive language.",
      options: {
        temperature: 0.7,
        top_p: 0.9,
        max_tokens: 750,
      },
    });

    // Clean up the temporary file
    fs.unlinkSync(imagePath);

    if (response.status === 200) {
      return response.data.response;
    } else {
      return `Error: ${response.status} - ${response.statusText}`;
    }
  } catch (error) {
    console.error("Ollama Vision Error:", error.message);
    return `Error: ${error.message}`;
  }
}

module.exports = { ask, synonym, seeImage };
