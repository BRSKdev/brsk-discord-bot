const { REST, Routes } = require("discord.js");
const { SlashCommandBuilder } = require("@discordjs/builders");
const {
  DISCORD_APPLICATION_ID,
  DISCORD_BOT_TOKEN,
  GUILD_ID,
  shopItems,
} = require("../config");

const commands = [
  new SlashCommandBuilder().setName("brsk").setDescription("Brrrsk!💨"),
  new SlashCommandBuilder()
    .setName("mode")
    .addStringOption((option) =>
      option
        .setName("mode")
        .setDescription("Choose the game mode")
        .addChoices(
          { name: "Easy (1-12) [10 XP] - for 3 Tokens", value: "easy" },
          { name: "Medium (1-40) [25 XP] - for 2 Tokens", value: "medium" },
          { name: "Hard (1-88) [50 XP] - for 1 Token", value: "hard" }
        )
        .setRequired(true)
    )
    .setDescription("Choose the game mode"),
  new SlashCommandBuilder()
    .setName("try")
    .addStringOption((option) =>
      option
        .setName("number")
        .setDescription("The number to guess")
        .setRequired(true)
    )
    .setDescription("Guess the random number."),
  new SlashCommandBuilder().setName("help").setDescription("Help"),
  new SlashCommandBuilder()
    .setName("shop")
    .setDescription("Shop")
    .addStringOption((option) =>
      option
        .setName("item")
        .setDescription("The item to buy")
        .setRequired(true)
        .addChoices(
          ...Object.entries(shopItems).map(([name, price]) => ({
            name: `${name} (${price} Tokens)`,
            value: name,
          }))
        )
    ),
  new SlashCommandBuilder().setName("points").setDescription("See your XP"),
  new SlashCommandBuilder()
    .setName("tokens")
    .setDescription("See your current token status"),
  new SlashCommandBuilder()
    .setName("daily")
    .setDescription("Claim your daily tokens"),
  new SlashCommandBuilder()
    .setName("convert")
    .setDescription("Convert XP to Tokens")
    .addIntegerOption((option) =>
      option
        .setName("amount")
        .setDescription("Amount of XP to convert")
        .setRequired(true)
    ),
  new SlashCommandBuilder()
    .setName("leaderboard")
    .setDescription("See the leaderboard")
    .addStringOption((option) =>
      option
        .setName("type")
        .setDescription("Type of leaderboard")
        .setRequired(true)
        .addChoices(
          { name: "XP", value: "xp" },
          { name: "Tokens", value: "tokens" },
          { name: "Level", value: "level" }
        )
    ),
].map((command) => command.toJSON());

const rest = new REST({ version: "10" }).setToken(DISCORD_BOT_TOKEN);

(async () => {
  try {
    console.log("Slash-Commands are being registered...");
    // server-specific commands (direkt)
    await rest.put(
      Routes.applicationGuildCommands(DISCORD_APPLICATION_ID, GUILD_ID),
      { body: commands }
    );

    /*
    // globale Commands (dauert ewig)
    await rest.put(
      Routes.applicationCommands(DISCORD_APPLICATION_ID),
      { body: commands }
    );
    */
    console.log("Slash-Commands updated!");
  } catch (error) {
    console.error("Error updating slash-commands:", error);
  }
})();
