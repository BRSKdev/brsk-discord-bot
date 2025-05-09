# BRSK Discord Bot

A versatile Discord bot featuring gambling games, token economy, and AI-powered interactions.

## Features

- **Token Economy:** Earn and spend tokens for various activities
- **Shop System:** Redeem tokens for rewards like gift cards
- **XP & Leveling:** Gain experience points to level up and earn rewards
- **Gambling:** Try your luck with number guessing games with different difficulty levels
- **AI Integration:** Chat with an AI model powered by a local Ollama server
- **Database Integration:** User data persists across bot restarts

## Installation

```bash
# Install dependencies
npm install

# Install nodemon globally (if not already installed)
npm install -g nodemon

# Run the bot
npm run start
```

## Configuration

1. Create a `config.js` file in the root directory:

```javascript
module.exports = {
  DISCORD_BOT_TOKEN: "your-discord-bot-token",
  DISCORD_APPLICATION_ID: "your-application-id",
  GUILD_ID: "your-server-id",
  GENERAL_CHANNEL_ID: "your-channel-id",
  OLLAMA_MODEL: "your-ai-model",
  OLLAMA_VISION_MODEL: "llama3.2-vision:11b",
  ADMIN_ID: "admin-user-id",
  // Database configuration
  DB: {
    TYPE: "sqlite", // or "mysql"
    FILENAME: "data/discord_bot.db", // For SQLite
    HOST: "localhost", // For MySQL
    USER: "root", // For MySQL
    PASSWORD: "", // For MySQL
    DATABASE: "discord_bot" // For MySQL
  },
  // Shop items
  shopItems: {
    "5€ Gift Google Play Card": 120,
    "10€ Gift Spotify Card": 160,
    "20€ Gift Amazon Card": 240,
    "50€ Gift Amazon Card": 400
  }
};
```

2. Create a `.env` file with the following values:

```env
DISCORD_APPLICATION_ID=*****...
DISCORD_BOT_TOKEN=*****...

# Database Configuration (optional, can be defined in config.js)
DB_TYPE=sqlite
# DB_HOST=hostname
# DB_USER=username
# DB_PASSWORD=password
# DB_DATABASE=database_name
```

## Commands

### Game Commands
- `/mode` - Select game difficulty (easy, medium, hard)
- `/try` - Guess a number based on current difficulty
  - Easy mode: costs 3 tokens (range 1-12)
  - Medium mode: costs 2 tokens (range 1-40)
  - Hard mode: costs 1 token (range 1-88)

### Economy Commands
- `/tokens` - Check your current token balance and XP
- `/daily` - Claim your daily token reward (3 tokens per day)
- `/convert <amount>` - Convert XP to tokens (50 XP = 1 token)
- `/shop` - Purchase items with tokens
- `/leaderboard <type>` - View leaderboard rankings (XP, tokens, or level)

### AI Commands
- `!ask` - Ask the AI a question
- `!synonym` - Get synonyms for a word or phrase
- `!see` - Analyze an image (must attach an image)

### Other Commands
- `/help` - Display a list of available commands
- `/brsk` - Simple ping command

## Token Economy

- **Earning Tokens:**
  - Daily login: 3 tokens per day
  - Level up: 5 token bonus
  - Converting XP: 50 XP = 1 token

- **Spending Tokens:**
  - Play games: 1-3 tokens based on difficulty
  - Shop purchases: Various token costs

## XP and Leveling

- **Earning XP:**
  - Winning games: XP varies based on difficulty
  - Easy win: 10 XP
  - Medium win: 25 XP
  - Hard win: 50 XP

- **Level Thresholds:**
  - Level 1: 0-99 XP
  - Level 2: 100-249 XP
  - Level 3: 250-499 XP
  - Level 4: 500-999 XP
  - Level 5+: +750 XP per level

## AI Integration

The bot connects to a local Ollama server for AI functionalities. Make sure the server is running and the specified model is available before using AI features.

## Database

The bot uses a database to store user data, transactions, and game results:
- Primary database: MySQL (if configured)
- Fallback: SQLite (local file-based database)


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
