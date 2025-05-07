const { Client, GatewayIntentBits, Partials } = require("discord.js");
const { ask, synonym } = require("./chat-actions");
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
const leaderboard = [{ id: ADMIN_ID, points: 120 }];

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

client.once("ready", (c) => {
  console.log(`🟢 Logged in as ${c.user.tag}`);
});

client.on("messageCreate", async (message) => {
  // !ask command
  if (message.content.startsWith("!ask")) {
    const prompt = message.content.substring(5);
    if (prompt.trim() === "") {
      await message.reply("🤦🏻‍♂️ Enter a question then...");
      return;
    }

    message.channel.sendTyping();

    try {
      const response = await ask(prompt);
      await message.reply(response);
    } catch (error) {
      console.error("Error:", error);
      await message.reply("Oops! An error occurred. 💩");
    }
  }

  // !synonym command
  if (message.content.startsWith("!synonym")) {
    const prompt = message.content.substring(9);
    if (prompt.trim() === "") {
      await message.reply("🤦🏻‍♂️ Enter a word or phrase then...");
      return;
    }

    const response = await synonym(prompt);

    await message.reply(response);
  }
});

client.on("interactionCreate", async (interaction) => {
  if (!interaction.isCommand()) {
    return;
  }

  const { commandName } = interaction;

  // /brsk (ping-command)
  if (commandName === "brsk") {
    await interaction.reply("Brrrsk!💨");
  }

  // /mode command
  if (commandName === "mode") {
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
  }

  // /try (gambling command)
  if (commandName === "try") {
    if (!easyMode && !mediumMode && !hardMode) {
      await interaction.reply(
        "❌ No mode selected. Use the /mode command to select a mode."
      );
      return;
    }

    let randomNumber;

    if (easyMode) {
      randomNumber = getRandomNumber(1, 12);
    } else if (mediumMode) {
      randomNumber = getRandomNumber(1, 40);
    } else if (hardMode) {
      randomNumber = getRandomNumber(1, 88);
    }

    const guess = interaction.options.getString("number");

    if (isNaN(guess)) {
      await interaction.reply("❌ Please enter a number!");
      interaction.deleteReply();
      return;
    }

    const guessNumber = parseInt(guess);

    if (guessNumber === randomNumber) {
      await interaction.reply(
        `🎉 You won! The number was ${randomNumber}! [+${
          points[easyMode ? "easy" : mediumMode ? "medium" : "hard"]
        } points]`
      );
      addPoints(
        interaction.user.id,
        points[easyMode ? "easy" : mediumMode ? "medium" : "hard"]
      );
      setTimeout(() => {
        interaction.deleteReply();
      }, 5000);
    } else {
      await interaction.reply(
        `❌ Wrong! The number was ${randomNumber}. Try again!`
      );
      setTimeout(() => {
        interaction.deleteReply();
      }, 2000);
    }
  }

  // /shop command
  if (commandName === "shop") {
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
  }

  // /points command
  if (commandName === "points") {
    const user = leaderboard.find((user) => user.id === interaction.user.id);
    if (user) {
      await interaction.reply(`You have **${user.points} points**.`);
      setTimeout(() => {
        interaction.deleteReply();
      }, 2300);
    } else {
      await interaction.reply("You have no points yet.");
      setTimeout(() => {
        interaction.deleteReply();
      }, 2000);
    }
  }
});

// improved version for DM-handling
client.on("messageCreate", async (message) => {
  if (message.author.bot) return;
  if (!message.guild) {
    try {
      const content = message.content.toLowerCase();

      if (content === "!brsk") {
        await message.reply("Brrrsk!💨");
      } else if (content === "/points") {
        const user = leaderboard.find((user) => user.id === message.author.id);
        if (user) {
          await message.reply(`You have **${user.points} points**.`);
        } else {
          await message.reply("You have no points yet.");
        }
      } else if (content === "/shop") {
        const item = message.content.split(" ")[1];
        const result = buyItem(message.author.id, item);

        if (result.success) {
          await message.reply(`You've bought a ${result.itemName}!`);
        } else {
          await message.reply("You don't have enough points to buy this item.");
        }
      } else if (content === "/help") {
        await message.reply(
          "Commands:\n/points - Show your points\n/help - Show the help menu"
        );
      } else {
        await message.reply("Not a valid command.\nTry '/help'.");
      }
    } catch (error) {
      console.error("[ERROR]: ", error);
    }
  }
});

function getRandomNumber(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

client.login(DISCORD_BOT_TOKEN);
