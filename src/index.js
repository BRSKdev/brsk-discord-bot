const {
  Client,
  GatewayIntentBits,
  Partials,
  MessageFlags,
} = require("discord.js");
const { ask, synonym, seeImage } = require("./chat-actions");
const dbActions = require("./db-actions");
const {
  DISCORD_BOT_TOKEN,
  GUILD_ID,
  GENERAL_CHANNEL_ID,
  ADMIN_ID,
  shopItems,
} = require("../config");

// to be used for the /try command
let easyMode = false;
let mediumMode = false;
let hardMode = false;

const points = {
  easy: 10,
  medium: 25,
  hard: 50,
};

// leaderboard
const leaderboard = [];

// to add points to the leaderboard
const addPoints = (userId, points) => {
  const user = leaderboard.find((user) => user.id === userId);
  if (user) {
    user.points += points;
  } else {
    leaderboard.push({ id: userId, points });
  }
};

// to buy items from the shop
const buyItem = (userId, item) => {
  const user = leaderboard.find((user) => user.id === userId);
  if (!user) return false;

  const shopItem = Object.keys(shopItems).find(
    (key) => key.toLowerCase() === item.toLowerCase()
  );

  if (shopItem && user.points >= shopItems[shopItem]) {
    user.points -= shopItems[shopItem];
    return { success: true, itemName: shopItem };
  }

  return { success: false };
};

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages,
  ],
  partials: [Partials.Channel, Partials.Message, Partials.User],
});

// Cache for user requests
const userCache = new Map();
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes in milliseconds

// Improved function to create user with caching
async function ensureUserExists(userId) {
  // Check if the user is in the cache and the cache is not expired
  const cachedUser = userCache.get(userId);
  if (cachedUser && Date.now() - cachedUser.timestamp < CACHE_DURATION) {
    return cachedUser.data;
  }

  // Fetch from database and cache the result
  try {
    const user = await dbActions.getUser(userId);
    userCache.set(userId, {
      data: user,
      timestamp: Date.now(),
    });
    return user;
  } catch (error) {
    console.error(`Failed to create/get user ${userId}: ${error.message}`);
    return null;
  }
}

// Delete expired cache entries regularly
setInterval(() => {
  const now = Date.now();
  for (const [userId, entry] of userCache.entries()) {
    if (now - entry.timestamp > CACHE_DURATION) {
      userCache.delete(userId);
    }
  }
}, 10 * 60 * 1000); // Run every 10 minutes

client.once("ready", async (c) => {
  console.log(`🟢 Logged in as ${c.user.tag}`);
  await migrateOldPointsSystem();
});

client.on("messageCreate", async (message) => {
  // Skip messages from bots to avoid loops
  if (message.author.bot) return;

  // Create user in database whenever they send a message the bot processes
  try {
    await dbActions.getUser(message.author.id);
  } catch (error) {
    console.error(`Error creating user from message: ${error.message}`);
  }

  // handle direct messages
  if (!message.guild) {
    handleDirectMessage(message, await ensureUserExists(message.author.id));
    return;
  }

  // handle server messages
  if (message.content.startsWith("!ask")) {
    handleAskCommand(message, await ensureUserExists(message.author.id));
  } else if (message.content.startsWith("!synonym")) {
    handleSynonymCommand(message, await ensureUserExists(message.author.id));
  } else if (message.content.startsWith("!see")) {
    await handleSeeCommand(message, await ensureUserExists(message.author.id));
  }
});

// Command-Handler in separate functions for better code readability
async function handleAskCommand(message, user) {
  const prompt = message.content.substring(5);
  if (prompt.trim() === "") {
    await message.reply("🤦🏻‍♂️ Enter a question then...");
    return;
  }

  message.channel.sendTyping();

  try {
    // award XP for using the AI function
    await dbActions.addXp(message.author.id, 2);

    const response = await ask(prompt);
    await message.reply(response);
  } catch (error) {
    console.error("Error:", error);
    await message.reply("Oops! An error occurred. 💩");
  }
}

async function handleSynonymCommand(message, user) {
  const prompt = message.content.substring(9);
  if (prompt.trim() === "") {
    await message.reply("🤦🏻‍♂️ Enter a word or phrase then...");
    return;
  }

  try {
    // award XP for using the AI function
    await dbActions.addXp(message.author.id, 3);

    const response = await synonym(prompt);
    await message.reply(response);
  } catch (error) {
    console.error("Error:", error);
    await message.reply("Oops! An error occurred. 💩");
  }
}

async function handleSeeCommand(message, user) {
  try {
    // Check if there's an image attachment
    const attachment = message.attachments.first();
    if (!attachment) {
      await message.reply(
        "🖼️ You need to attach an image you want to analyze."
      );
      return;
    }

    // Check if the attachment is an image
    const imageTypes = ["image/jpeg", "image/png", "image/gif", "image/webp"];
    if (!imageTypes.some((type) => attachment.contentType?.startsWith(type))) {
      await message.reply(
        "❌ The attached file is not a supported image format (JPEG, PNG, GIF, WEBP)."
      );
      return;
    }

    // Get the prompt (everything after !see)
    const prompt =
      message.content.substring(4).trim() || "What is in this image?";

    // Send typing indicator
    message.channel.sendTyping();

    // Process the image
    const response = await seeImage(prompt, attachment.url);

    // Award XP for using the AI function
    await dbActions.addXp(message.author.id, 5); // More XP for image analysis

    // Send the response
    await message.reply(response);
  } catch (error) {
    console.error("Error in !see command:", error);
    await message.reply(
      "Oops! An error occurred while processing the image. 💩"
    );
  }
}

async function handleDirectMessage(message, user) {
  try {
    const content = message.content.toLowerCase();

    if (content === "!brsk") {
      await message.reply("Brrrsk!💨");
    } else if (content === "/tokens") {
      await message.reply(
        `You have **${user.tokens} tokens** and **${user.xp} XP** (Level ${user.level}).`
      );
    } else if (content === "/daily") {
      const result = await dbActions.claimDaily(message.author.id);
      if (result.success) {
        await message.reply(
          `🎁 You've received your 3 daily tokens! You now have **${result.tokens} tokens**.`
        );
      } else {
        await message.reply(`❌ ${result.message}`);
      }
    } else if (content === "/help") {
      await message.reply(
        "🎮 **BRSK Discord Bot** 🤖\n\n" +
          "A Discord Bot for Gaming, AI interactions and more!\n\n" +
          "**🎲 Game Commands:**\n" +
          "`/mode` - Select a difficulty (Easy, Medium, Hard)\n" +
          "`/try` - Guess the number and win tokens\n\n" +
          "**💰 Economy Commands:**\n" +
          "`/tokens` - Show your token balance\n" +
          "`/points` - Show your XP\n" +
          "`/daily` - Claim your daily tokens\n" +
          "`/convert` - Convert XP to tokens\n" +
          "`/shop` - Buy rewards with tokens\n" +
          "`/leaderboard` - Show the leaderboard\n\n" +
          "**🤖 AI Commands:**\n" +
          "`!ask` - Ask a question\n" +
          "`!synonym` - Find synonyms for a word\n" +
          "`!see` - Analyze an image with AI\n\n" +
          "**ℹ️ Other Commands:**\n" +
          "`/help` - Show this help\n" +
          "`/brsk` - Ping Command\n\n" +
          "**🔗 Links:**\n" +
          "GitHub: https://github.com/BRSKdev/brsk-discord-bot"
      );
    } else if (content.startsWith("!ask")) {
      await handleAskCommand(message, user);
    } else {
      await message.reply("Not a valid command.\nTry '/help'.");
    }
  } catch (error) {
    console.error("[ERROR]: ", error);
    await message.reply("An error occurred processing your request.");
  }
}

client.on("interactionCreate", async (interaction) => {
  if (!interaction.isCommand()) {
    return;
  }

  // create user once per interaction
  const user = await ensureUserExists(interaction.user.id);
  if (!user) {
    await interaction.reply({
      content: "Error creating user profile. Please try again.",
      flags: [MessageFlags.Ephemeral],
    });
    return;
  }

  const { commandName } = interaction;

  // Command-Handler with access to user data
  try {
    if (commandName === "tokens") {
      try {
        // force refresh the user data
        const user = await dbActions.getUser(interaction.user.id, true);

        await interaction.reply({
          content: `🪙 **${user.tokens} tokens**`,
          flags: [MessageFlags.Ephemeral],
        });
      } catch (error) {
        console.error(`Error in /tokens command: ${error.message}`);
        await interaction.reply({
          content: "There was an error processing your request.",
          flags: [MessageFlags.Ephemeral],
        });
      }
    } else if (commandName === "daily") {
      const result = await dbActions.claimDaily(interaction.user.id);

      if (result.success) {
        await interaction.reply({
          content: `🎁 You've received your 3 daily tokens! You now have **${result.tokens} tokens**.`,
          flags: [MessageFlags.Ephemeral],
        });
      } else {
        await interaction.reply({
          content: `❌ ${result.message}`,
          flags: [MessageFlags.Ephemeral],
        });
      }
    } else if (commandName === "brsk") {
      await interaction.reply("Brrrsk!💨");
    } else if (commandName === "help") {
      await interaction.reply({
        content:
          "This is the AI powered BRSK Discord Bot.\n\n" +
          "**SLASH COMMANDS**\n\n" +
          "/mode - Select game difficulty (easy, medium, hard)\n" +
          "/try - Guess a number based on current difficulty\n" +
          "/tokens - Check your current tokens and XP\n" +
          "/daily - Claim your daily token reward\n" +
          "/convert <amount> - Convert XP to tokens\n" +
          "/shop - Purchase items with tokens\n" +
          "/leaderboard <type> - View rankings (XP, tokens, level)\n" +
          "/brsk - Simple ping command\n\n" +
          "**TEXT COMMANDS**\n\n" +
          "!ask <question> - Ask the AI a question\n" +
          "!synonym <word> - Get synonyms for a word or phrase\n" +
          "!see <prompt> - Analyze an attached image\n\n" +
          "Need more help? Go to GitHub: https://github.com/BRSKdev/brsk-dircord-bot",
        flags: [MessageFlags.Ephemeral],
      });
    } else if (commandName === "mode") {
      const mode = interaction.options.getString("mode");

      easyMode = false;
      mediumMode = false;
      hardMode = false;

      if (mode === "easy") {
        easyMode = true;
        await interaction.reply("Easy mode selected 😊");
      } else if (mode === "medium") {
        mediumMode = true;
        await interaction.reply("Medium mode selected 😎");
      } else if (mode === "hard") {
        hardMode = true;
        await interaction.reply("Hard mode selected 😈");
      }
      setTimeout(() => {
        interaction.deleteReply();
      }, 3200);
    } else if (commandName === "try") {
      try {
        if (!easyMode && !mediumMode && !hardMode) {
          await interaction.reply({
            content:
              "❌ No mode selected. Use the /mode command to select a mode.",
            flags: [MessageFlags.Ephemeral],
          });
          return;
        }

        // determine current difficulty
        const difficulty = easyMode ? "easy" : mediumMode ? "medium" : "hard";

        // check token costs
        const tokenCosts = {
          easy: 3,
          medium: 2,
          hard: 1,
        };

        // spend tokens for the game
        const spendResult = await dbActions.spendTokensForGame(
          interaction.user.id,
          difficulty
        );

        if (!spendResult.success) {
          await interaction.reply({
            content: `${spendResult.message} Playing ${difficulty} mode costs ${tokenCosts[difficulty]} tokens.`,
            flags: [MessageFlags.Ephemeral],
          });
          return;
        }

        // generate random number based on difficulty
        let randomNumber;
        let maxNumber;

        if (easyMode) {
          maxNumber = 12;
          randomNumber = getRandomNumber(1, maxNumber);
        } else if (mediumMode) {
          maxNumber = 40;
          randomNumber = getRandomNumber(1, maxNumber);
        } else if (hardMode) {
          maxNumber = 88;
          randomNumber = getRandomNumber(1, maxNumber);
        }

        const guess = interaction.options.getString("number");

        if (isNaN(guess)) {
          await interaction.reply({
            content: "❌ Please enter a number!",
            flags: [MessageFlags.Ephemeral],
          });
          return;
        }

        const guessNumber = parseInt(guess);

        if (guessNumber === randomNumber) {
          // award XP for winning
          const xpPoints = points[difficulty];
          const xpResult = await dbActions.addXp(interaction.user.id, xpPoints);

          let message = `🎉 You won! The number was ${randomNumber}! [+${xpPoints} XP]`;

          if (xpResult.levelUp) {
            message += `\n🎊 Level up! You're now level ${xpResult.newLevel}! [+5 tokens bonus]`;
          }

          message += `\n\nThis ${difficulty} game cost you ${tokenCosts[difficulty]} tokens. You have ${spendResult.tokensRemaining} tokens left.`;

          await interaction.reply({
            content: message,
            flags: [MessageFlags.Ephemeral],
          });
        } else {
          await interaction.reply({
            content: `❌ Wrong! The number was ${randomNumber}. Try again!\n\nThis ${difficulty} game cost you ${tokenCosts[difficulty]} tokens. You have ${spendResult.tokensRemaining} tokens left.`,
            flags: [MessageFlags.Ephemeral],
          });
        }
      } catch (error) {
        console.error(`Error in /try command: ${error.message}`);
        await interaction.reply({
          content: "There was an error processing your request.",
          flags: [MessageFlags.Ephemeral],
        });
      }
    } else if (commandName === "shop") {
      const item = interaction.options.getString("item");
      const result = buyItem(interaction.user.id, item);

      if (result.success) {
        await interaction.reply(
          `You've bought a ${result.itemName}!\n*The gift card will be sent to your DMs.*`
        );
        const user = await client.users.fetch(interaction.user.id);
        user.send(
          `You've bought a ${result.itemName}!\n\n*Code: ${Math.random()
            .toString(36)
            .substring(2, 15)}*`
        );
        setTimeout(() => {
          interaction.deleteReply();
        }, 2300);
      } else {
        await interaction.reply(
          "You don't have enough points to buy this item.\n\n*Use the /points command to see your points.*"
        );
        setTimeout(() => {
          interaction.deleteReply();
        }, 2000);
      }
    } else if (commandName === "points") {
      try {
        const dbUser = await dbActions.getUser(interaction.user.id);
        await interaction.reply({
          content: `You have **${dbUser.xp} XP**.`,
          flags: [MessageFlags.Ephemeral],
        });
      } catch (error) {
        console.error(`Error in /points command: ${error.message}`);

        // fallback on old system if DB is not available
        const user = leaderboard.find(
          (user) => user.id === interaction.user.id
        );
        if (user) {
          await interaction.reply({
            content: `You have **${user.points} points** (Legacy-System).`,
            flags: [MessageFlags.Ephemeral],
          });
        } else {
          await interaction.reply({
            content: "You have no points yet.",
            flags: [MessageFlags.Ephemeral],
          });
        }
      }
    } else if (commandName === "convert") {
      try {
        const amount = interaction.options.getInteger("amount");

        if (!amount || amount <= 0) {
          await interaction.reply({
            content: "❌ Please specify a valid positive amount.",
            flags: [MessageFlags.Ephemeral],
          });
          return;
        }

        const result = await dbActions.convertXpToTokens(
          interaction.user.id,
          amount
        );

        if (result.success) {
          // Cache für diesen Benutzer löschen
          invalidateUserCache(interaction.user.id);

          await interaction.reply({
            content: `✅ You've converted **${result.xpSpent} XP** into **${result.tokensGained} tokens**. You now have **${result.newTokens} tokens**.`,
            flags: [MessageFlags.Ephemeral],
          });
        } else {
          await interaction.reply({
            content: `❌ ${result.message}`,
            flags: [MessageFlags.Ephemeral],
          });
        }
      } catch (error) {
        console.error(`Error in /convert command: ${error.message}`);
        await interaction.reply({
          content: "There was an error processing your request.",
          flags: [MessageFlags.Ephemeral],
        });
      }
    } else if (commandName === "leaderboard") {
      try {
        const type = interaction.options.getString("type") || "xp"; // "xp", "tokens", or "level"

        if (type !== "xp" && type !== "tokens" && type !== "level") {
          await interaction.reply({
            content: "❌ Please choose 'xp', 'tokens', or 'level' as the type.",
            flags: [MessageFlags.Ephemeral],
          });
          return;
        }

        const topUsers = await dbActions.getTopUsers(type, 5); // top 5 users
        let leaderboardText = `🏆 **${type.toUpperCase()} Leaderboard** 🏆\n\n`;

        if (topUsers.length === 0) {
          leaderboardText += "No entries yet.";
        } else {
          for (let i = 0; i < topUsers.length; i++) {
            const user = topUsers[i];
            const member = await interaction.guild.members
              .fetch(user.userId)
              .catch(() => null);
            const username = member ? member.user.username : "Unknown User";

            leaderboardText += `**${i + 1}.** ${username}: **${
              user[type]
            }** ${type}\n`;
          }
        }

        await interaction.reply({
          content: leaderboardText,
          flags: [MessageFlags.Ephemeral],
        });
      } catch (error) {
        console.error(`Error in /leaderboard command: ${error.message}`);
        await interaction.reply({
          content: "There was an error processing your request.",
          flags: [MessageFlags.Ephemeral],
        });
      }
    }
  } catch (error) {
    console.error(`Error in /${commandName} command: ${error.message}`);
    await interaction.reply({
      content: "There was an error processing your request.",
      flags: [MessageFlags.Ephemeral],
    });
  }
});

function getRandomNumber(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// Helper for migrations - run at start
async function migrateOldPointsSystem() {
  try {
    console.log("Starting legacy points system migration...");
    for (const user of leaderboard) {
      const dbUser = await dbActions.getUser(user.id);

      // Only migrate if the user has no tokens yet
      if (dbUser.tokens === 0 && user.points > 0) {
        await dbActions.updateTokens(user.id, user.points, "legacy_migration");
        console.log(`Migrated user ${user.id} with ${user.points} points`);
      }
    }
    console.log("[INFO] Legacy data migration completed");
  } catch (error) {
    console.error("Migration error:", error);
  }
}

function invalidateUserCache(userId) {
  userCache.delete(userId);
}

(async () => {
  try {
    const connectionTest = await dbActions.testConnection();
    if (connectionTest.success) {
      console.log(`✅ Database: ${connectionTest.message}`);
    } else {
      console.warn(`⚠️ Database: ${connectionTest.message}`);
    }
  } catch (error) {
    console.error(`❌ Database error: ${error.message}`);
  }
})();

client.login(DISCORD_BOT_TOKEN);
