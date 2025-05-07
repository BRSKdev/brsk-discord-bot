# BRSK Discord Bot

A Discord bot featuring gambling games and AI-powered interactions.

## Features

- **Gambling:** Try your luck with number guessing games in various difficulty levels
- **AI Integration:** Chat with an ai model powered by a local Ollama server
- **Shop System:** Earn points and redeem them for rewards
- **Expanding Functionality:** New features added regularly

## Installation

```bash
# Install dependencies
npm install

# Install nodemon
npm npm install -g nodemon

```

## Configuration

1. Create a `config.js` file in the root directory:

```javascript
const dotenv = require("dotenv");

dotenv.config();

// discord bot
const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
const DISCORD_APPLICATION_ID = process.env.DISCORD_APPLICATION_ID;

// guilds and channels
const GUILD_ID = "102374...",
const GENERAL_CHANNEL_ID = "1023747...";

// admin id for special commands
const ADMIN_ID = "9863354...";

// ollama model
const OLLAMA_MODEL = "llama3:latest";

// shop items
const shopItems = {
  "5€ Gift Google Play Card": 120,
  "10€ Gift Spotify Card": 160,
  "20€ Gift Amazon Card": 240,
  "50€ Gift Amazon Card": 400,
};

module.exports = {
  DISCORD_APPLICATION_ID,
  DISCORD_BOT_TOKEN,
  GUILD_ID,
  GENERAL_CHANNEL_ID,
  ADMIN_ID,
  OLLAMA_MODEL,
  shopItems
};

```

2. Create a `.env` file with the following values:

```env
DISCORD_APPLICATION_ID=*****...
DISCORD_BOT_TOKEN=*****...
```

## Start the bot

```
# Run the bot
npm run start
```

## Commands

- `/help` - Show available commands and usage
- `/mode` - Select game difficulty (easy, medium, hard)
- `/try` - Guess a number based on current difficulty
- `/points` - Check your current points
- `/shop` - Purchase items with earned points
- `!ask` - Ask the AI a question
- `!synonym` - Get synonyms for a given word or phrase

## AI Integration

The bot connects to a local Ollama server for AI functionalities. Make sure the server is running and the specified model is available before using AI features.


## License

MIT License

Copyright (c) 2023-2024 ManyakBot

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
