const path = require("path");
const fs = require("fs");
const { DB } = require("../config");

// logger
function logDbOperation(message) {
  console.log(`[DB] ${message}`);
}

// init db
let db;
let dbType = DB.TYPE || "sqlite";

// init sqlite db function
function initSqliteDb() {
  try {
    const Database = require("better-sqlite3");

    const dbDirectory = path.dirname(path.resolve(DB.FILENAME));
    if (!fs.existsSync(dbDirectory)) {
      fs.mkdirSync(dbDirectory, { recursive: true });
    }

    db = new Database(DB.FILENAME);
    dbType = "sqlite";
    logDbOperation(`SQLite connected: ${DB.FILENAME}`);
    return true;
  } catch (error) {
    logDbOperation(`SQLite connection failed: ${error.message}`);
    return false;
  }
}

// init mysql db function
async function initMysqlDb() {
  try {
    // so we don't use mysql if host and database are not set
    if (!DB.HOST || !DB.DATABASE) {
      logDbOperation("MySQL not used. Using SQLite instead.");
      return false;
    }

    const mysql = require("mysql2/promise");

    // create mysql pool
    const pool = await mysql.createPool({
      host: DB.HOST,
      user: DB.USER,
      password: DB.PASSWORD,
      database: DB.DATABASE,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
    });

    // test connection
    const connection = await pool.getConnection();
    connection.release();

    db = pool;
    dbType = "mysql";
    logDbOperation(`MySQL connected: ${DB.HOST}/${DB.DATABASE}`);
    return true;
  } catch (error) {
    logDbOperation(`MySQL connection failed: ${error.message}`);
    return false;
  }
}

// create db based on config
async function initializeDatabase() {
  try {
    if (DB.TYPE === "mysql") {
      const mysqlSuccess = await initMysqlDb();
      if (!mysqlSuccess) {
        logDbOperation("Fallback to SQLite due to MySQL connection problems");
        initSqliteDb();
      }
    } else {
      // default sqlite
      initSqliteDb();
    }

    // create tables
    await createTables();

    // migrate lastDaily from date to timestamp
    await migrateLastDailyToTimestamp();
  } catch (error) {
    logDbOperation(`Database initialization failed: ${error.message}`);
    // if error, switch to sqlite
    if (dbType !== "sqlite") {
      logDbOperation("Switching to SQLite as fallback");
      initSqliteDb();
      await createTables();
    }
  }
}

// create tables
async function createTables() {
  try {
    if (dbType === "sqlite") {
      db.exec(`
        CREATE TABLE IF NOT EXISTS users (
          userId TEXT PRIMARY KEY,
          tokens INTEGER DEFAULT 0,
          xp INTEGER DEFAULT 0,
          lastDaily INTEGER DEFAULT NULL,
          level INTEGER DEFAULT 1
        )
      `);
      db.exec(`
        CREATE TABLE IF NOT EXISTS transactions (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          userId TEXT,
          amount INTEGER,
          type TEXT,
          timestamp TEXT DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (userId) REFERENCES users (userId)
        )
      `);
      logDbOperation("SQLite tables created successfully");
    } else if (dbType === "mysql") {
      await db.query(`
        CREATE TABLE IF NOT EXISTS users (
          userId VARCHAR(64) PRIMARY KEY,
          tokens INT DEFAULT 0,
          xp INT DEFAULT 0,
          lastDaily BIGINT DEFAULT NULL,
          level INT DEFAULT 1
        )
      `);
      await db.query(`
        CREATE TABLE IF NOT EXISTS transactions (
          id INT AUTO_INCREMENT PRIMARY KEY,
          userId VARCHAR(64),
          amount INT,
          type VARCHAR(64),
          timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (userId) REFERENCES users(userId)
        )
      `);
      logDbOperation("MySQL tables created successfully");
    }
  } catch (error) {
    logDbOperation(`Table creation failed: ${error.message}`);
    // switch to sqlite if mysql error
    if (dbType === "mysql") {
      logDbOperation("Switching to SQLite due to table creation error");
      dbType = "sqlite";
      initSqliteDb();
      createTables();
    } else {
      throw error;
    }
  }
}

// Level-Berechnung (datenbanktyp-unabhängig) - MUSS VOR den Action-Objekten definiert werden
function calculateLevel(xp) {
  if (xp < 100) return 1;
  if (xp < 250) return 2;
  if (xp < 500) return 3;
  if (xp < 1000) return 4;

  return Math.floor((xp - 1000) / 750) + 5;
}

// sqlite specific db functions
const sqliteActions = {
  getUser(userId) {
    try {
      const user = db
        .prepare("SELECT * FROM users WHERE userId = ?")
        .get(userId);
      if (!user) {
        db.prepare("INSERT INTO users (userId) VALUES (?)").run(userId);
        return this.getUser(userId);
      }
      return user;
    } catch (error) {
      logDbOperation(
        `Fehler beim Abrufen des Benutzers (SQLite): ${error.message}`
      );
      throw error;
    }
  },

  updateTokens(userId, amount, transactionType) {
    try {
      const user = this.getUser(userId);

      db.prepare("UPDATE users SET tokens = tokens + ? WHERE userId = ?").run(
        amount,
        userId
      );

      db.prepare(
        "INSERT INTO transactions (userId, amount, type) VALUES (?, ?, ?)"
      ).run(userId, amount, transactionType);

      return this.getUser(userId);
    } catch (error) {
      logDbOperation(
        `Fehler beim Aktualisieren der Tokens (SQLite): ${error.message}`
      );
      throw error;
    }
  },

  claimDaily(userId) {
    try {
      const user = this.getUser(userId);
      const now = Date.now(); // Aktueller Timestamp in Millisekunden
      const dayInMs = 24 * 60 * 60 * 1000; // 24 Stunden in Millisekunden

      // Stelle sicher, dass lastDaily ein Number ist
      const lastDailyTimestamp = user.lastDaily ? Number(user.lastDaily) : null;

      // Prüfe, ob 24 Stunden seit dem letzten Claim vergangen sind
      if (lastDailyTimestamp && now - lastDailyTimestamp < dayInMs) {
        const timeLeft = this.getTimeLeftUntilNextClaim(lastDailyTimestamp);
        return {
          success: false,
          message: `You can claim your daily tokens again in ${timeLeft}.`,
        };
      }

      // Aktualisiere Tokens und lastDaily Timestamp
      db.prepare(
        "UPDATE users SET tokens = tokens + 3, lastDaily = ? WHERE userId = ?"
      ).run(now, userId);

      db.prepare(
        "INSERT INTO transactions (userId, amount, type) VALUES (?, ?, ?)"
      ).run(userId, 3, "daily");

      return {
        success: true,
        tokens: this.getUser(userId).tokens,
      };
    } catch (error) {
      logDbOperation(`Error claiming daily tokens (SQLite): ${error.message}`);
      throw error;
    }
  },

  convertXpToTokens(userId, xpAmount) {
    try {
      const user = this.getUser(userId);

      if (user.xp < xpAmount) {
        return { success: false, message: "Nicht genügend XP verfügbar." };
      }

      const tokenAmount = Math.floor(xpAmount / 50);

      if (tokenAmount <= 0) {
        return {
          success: false,
          message: "Du musst mindestens 50 XP umwandeln.",
        };
      }

      db.prepare(
        "UPDATE users SET tokens = tokens + ?, xp = xp - ? WHERE userId = ?"
      ).run(tokenAmount, xpAmount, userId);

      db.prepare(
        "INSERT INTO transactions (userId, amount, type) VALUES (?, ?, ?)"
      ).run(userId, tokenAmount, "xp_convert");

      return {
        success: true,
        xpSpent: xpAmount,
        tokensGained: tokenAmount,
        newTokens: this.getUser(userId).tokens,
      };
    } catch (error) {
      logDbOperation(`Fehler beim Umwandeln von XP (SQLite): ${error.message}`);
      throw error;
    }
  },

  addXp(userId, amount) {
    try {
      const user = this.getUser(userId);
      let levelUp = false;

      db.prepare("UPDATE users SET xp = xp + ? WHERE userId = ?").run(
        amount,
        userId
      );

      const updatedUser = this.getUser(userId);
      const newLevel = calculateLevel(updatedUser.xp);

      if (newLevel > user.level) {
        db.prepare("UPDATE users SET level = ? WHERE userId = ?").run(
          newLevel,
          userId
        );
        levelUp = true;

        this.updateTokens(userId, 5, "level_up_bonus");
      }

      return {
        xpGained: amount,
        newXp: updatedUser.xp,
        levelUp,
        newLevel: newLevel,
      };
    } catch (error) {
      logDbOperation(`Error adding XP (SQLite): ${error.message}`);
      throw error;
    }
  },

  calculateLevel,

  getTopUsers(sortBy = "xp", limit = 3) {
    try {
      if (!["xp", "tokens", "level"].includes(sortBy)) {
        sortBy = "xp";
      }

      return db
        .prepare(
          `SELECT userId, tokens, xp, level FROM users ORDER BY ${sortBy} DESC LIMIT ?`
        )
        .all(limit);
    } catch (error) {
      logDbOperation(
        `Fehler beim Abrufen der Top-Benutzer (SQLite): ${error.message}`
      );
      throw error;
    }
  },

  spendTokensForGame(userId, difficulty) {
    try {
      const tokensRequired = {
        easy: 3,
        medium: 2,
        hard: 1,
      };

      if (!tokensRequired[difficulty]) {
        return { success: false, message: "Ungültige Schwierigkeit." };
      }

      const cost = tokensRequired[difficulty];
      const user = this.getUser(userId);

      if (user.tokens < cost) {
        return {
          success: false,
          message: `Nicht genügend Tokens. Du benötigst ${cost} Tokens, hast aber nur ${user.tokens}.`,
        };
      }

      db.prepare("UPDATE users SET tokens = tokens - ? WHERE userId = ?").run(
        cost,
        userId
      );

      db.prepare(
        "INSERT INTO transactions (userId, amount, type) VALUES (?, ?, ?)"
      ).run(userId, -cost, `game_${difficulty}`);

      return {
        success: true,
        tokensCost: cost,
        tokensRemaining: this.getUser(userId).tokens,
      };
    } catch (error) {
      logDbOperation(
        `Fehler beim Ausgeben von Tokens (SQLite): ${error.message}`
      );
      throw error;
    }
  },

  // Helper function to get next claim time
  getNextClaimTime(lastClaimTimestamp) {
    const now = Date.now();
    const nextClaimTime = Number(lastClaimTimestamp) + 24 * 60 * 60 * 1000;
    const timeLeftMs = nextClaimTime - now;

    if (isNaN(timeLeftMs)) {
      return "24:00"; // Default if calculation fails
    }

    const hours = Math.floor(timeLeftMs / (1000 * 60 * 60));
    const minutes = Math.floor((timeLeftMs % (1000 * 60 * 60)) / (1000 * 60));

    // Format as HH:MM
    return `${hours.toString().padStart(2, "0")}:${minutes
      .toString()
      .padStart(2, "0")}`;
  },

  getTimeLeftUntilNextClaim(lastDailyTimestamp) {
    try {
      const now = Date.now();
      const nextClaimTime = Number(lastDailyTimestamp) + 24 * 60 * 60 * 1000;
      const timeLeftMs = nextClaimTime - now;

      if (isNaN(timeLeftMs)) {
        return "24:00"; // Standard, falls Berechnung fehlschlägt
      }

      const hours = Math.floor(timeLeftMs / (1000 * 60 * 60));
      const minutes = Math.floor((timeLeftMs % (1000 * 60 * 60)) / (1000 * 60));

      // Format als HH:MM
      return `${hours.toString().padStart(2, "0")}:${minutes
        .toString()
        .padStart(2, "0")}`;
    } catch (error) {
      logDbOperation(`Error calculating time left: ${error.message}`);
      return "24:00"; // Standard-Fallback
    }
  },
};

// MySQL-specific DB functions
const mysqlActions = {
  async getUser(userId) {
    try {
      const [rows] = await db.query("SELECT * FROM users WHERE userId = ?", [
        userId,
      ]);

      if (rows.length === 0) {
        await db.query("INSERT INTO users (userId) VALUES (?)", [userId]);
        const [newUser] = await db.query(
          "SELECT * FROM users WHERE userId = ?",
          [userId]
        );
        return newUser[0];
      }

      return rows[0];
    } catch (error) {
      logDbOperation(`MySQL user error: ${error.message}`);

      if (this.isConnectionError(error)) {
        logDbOperation("MySQL connection lost, switching to SQLite");
        dbType = "sqlite";
        initSqliteDb();
        await createTables();
        return sqliteActions.getUser(userId);
      }

      throw error;
    }
  },

  isConnectionError(error) {
    return (
      error.code === "ECONNREFUSED" ||
      error.code === "PROTOCOL_CONNECTION_LOST" ||
      error.message.includes("connect")
    );
  },

  async updateTokens(userId, amount, transactionType) {
    try {
      await this.getUser(userId);

      await db.query("UPDATE users SET tokens = tokens + ? WHERE userId = ?", [
        amount,
        userId,
      ]);

      await db.query(
        "INSERT INTO transactions (userId, amount, type) VALUES (?, ?, ?)",
        [userId, amount, transactionType]
      );

      const [rows] = await db.query("SELECT * FROM users WHERE userId = ?", [
        userId,
      ]);
      return rows[0];
    } catch (error) {
      logDbOperation(`MySQL token update error: ${error.message}`);

      if (this.isConnectionError(error)) {
        dbType = "sqlite";
        initSqliteDb();
        await createTables();
        return sqliteActions.updateTokens(userId, amount, transactionType);
      }

      throw error;
    }
  },

  async claimDaily(userId) {
    try {
      const user = await this.getUser(userId);
      const now = Date.now(); // Current timestamp in milliseconds
      const dayInMs = 24 * 60 * 60 * 1000; // 24 hours in milliseconds

      // Make sure lastDaily is a number
      const lastDailyTimestamp = user.lastDaily ? Number(user.lastDaily) : null;

      // Check if 24 hours have passed since last claim
      if (lastDailyTimestamp && now - lastDailyTimestamp < dayInMs) {
        const timeLeft = this.getTimeLeftUntilNextClaim(lastDailyTimestamp);
        return {
          success: false,
          message: `You can claim your daily tokens again in ${timeLeft}.`,
        };
      }

      // Update tokens and lastDaily timestamp
      await db.query(
        "UPDATE users SET tokens = tokens + 3, lastDaily = ? WHERE userId = ?",
        [now, userId]
      );

      await db.query(
        "INSERT INTO transactions (userId, amount, type) VALUES (?, ?, ?)",
        [userId, 3, "daily"]
      );

      const [rows] = await db.query("SELECT * FROM users WHERE userId = ?", [
        userId,
      ]);
      return {
        success: true,
        tokens: rows[0].tokens,
      };
    } catch (error) {
      logDbOperation(`MySQL daily claim error: ${error.message}`);

      if (this.isConnectionError(error)) {
        dbType = "sqlite";
        initSqliteDb();
        await createTables();
        return sqliteActions.claimDaily(userId);
      }

      throw error;
    }
  },

  getTimeLeftUntilNextClaim(lastClaimTimestamp) {
    try {
      const now = Date.now();
      const nextClaimTime = Number(lastClaimTimestamp) + 24 * 60 * 60 * 1000;
      const timeLeftMs = nextClaimTime - now;

      if (isNaN(timeLeftMs)) {
        return "24:00"; // Default if calculation fails
      }

      const hours = Math.floor(timeLeftMs / (1000 * 60 * 60));
      const minutes = Math.floor((timeLeftMs % (1000 * 60 * 60)) / (1000 * 60));

      // Format as HH:MM
      return `${hours.toString().padStart(2, "0")}:${minutes
        .toString()
        .padStart(2, "0")}`;
    } catch (error) {
      logDbOperation(`Error calculating time left: ${error.message}`);
      return "24:00"; // Default fallback
    }
  },

  async convertXpToTokens(userId, xpAmount) {
    try {
      const user = await this.getUser(userId);

      if (user.xp < xpAmount) {
        return { success: false, message: "Not enough XP available." };
      }

      const tokenAmount = Math.floor(xpAmount / 50);

      if (tokenAmount <= 0) {
        return { success: false, message: "You must convert at least 50 XP." };
      }

      await db.query(
        "UPDATE users SET tokens = tokens + ?, xp = xp - ? WHERE userId = ?",
        [tokenAmount, xpAmount, userId]
      );

      await db.query(
        "INSERT INTO transactions (userId, amount, type) VALUES (?, ?, ?)",
        [userId, tokenAmount, "xp_convert"]
      );

      const [rows] = await db.query("SELECT * FROM users WHERE userId = ?", [
        userId,
      ]);
      return {
        success: true,
        xpSpent: xpAmount,
        tokensGained: tokenAmount,
        newTokens: rows[0].tokens,
      };
    } catch (error) {
      logDbOperation(`MySQL XP conversion error: ${error.message}`);

      if (this.isConnectionError(error)) {
        dbType = "sqlite";
        initSqliteDb();
        await createTables();
        return sqliteActions.convertXpToTokens(userId, xpAmount);
      }

      throw error;
    }
  },

  async addXp(userId, amount) {
    try {
      const user = await this.getUser(userId);
      let levelUp = false;

      await db.query("UPDATE users SET xp = xp + ? WHERE userId = ?", [
        amount,
        userId,
      ]);

      const [rows] = await db.query("SELECT * FROM users WHERE userId = ?", [
        userId,
      ]);
      const updatedUser = rows[0];
      const newLevel = calculateLevel(updatedUser.xp);

      if (newLevel > user.level) {
        await db.query("UPDATE users SET level = ? WHERE userId = ?", [
          newLevel,
          userId,
        ]);
        levelUp = true;

        await this.updateTokens(userId, 5, "level_up_bonus");
      }

      return {
        xpGained: amount,
        newXp: updatedUser.xp,
        levelUp,
        newLevel: newLevel,
      };
    } catch (error) {
      logDbOperation(`MySQL add XP error: ${error.message}`);

      if (this.isConnectionError(error)) {
        dbType = "sqlite";
        initSqliteDb();
        await createTables();
        return sqliteActions.addXp(userId, amount);
      }

      throw error;
    }
  },

  calculateLevel,

  async getTopUsers(sortBy = "xp", limit = 3) {
    try {
      if (!["xp", "tokens", "level"].includes(sortBy)) {
        sortBy = "xp";
      }

      const [rows] = await db.query(
        `SELECT userId, tokens, xp, level FROM users ORDER BY ${sortBy} DESC LIMIT ?`,
        [limit]
      );

      return rows;
    } catch (error) {
      logDbOperation(`MySQL leaderboard error: ${error.message}`);

      if (this.isConnectionError(error)) {
        dbType = "sqlite";
        initSqliteDb();
        await createTables();
        return sqliteActions.getTopUsers(sortBy, limit);
      }

      throw error;
    }
  },

  async spendTokensForGame(userId, difficulty) {
    try {
      const tokensRequired = {
        easy: 3,
        medium: 2,
        hard: 1,
      };

      if (!tokensRequired[difficulty]) {
        return {
          success: false,
          message:
            "Invalid game mode.\nPlease choose 'easy', 'medium' or 'hard' mode.",
        };
      }

      const cost = tokensRequired[difficulty];
      const user = await this.getUser(userId);

      if (user.tokens < cost) {
        return {
          success: false,
          message: `Not enough tokens.\nYou need ${cost} Tokens, but you only have ${user.tokens}.`,
        };
      }

      await db.query("UPDATE users SET tokens = tokens - ? WHERE userId = ?", [
        cost,
        userId,
      ]);

      await db.query(
        "INSERT INTO transactions (userId, amount, type) VALUES (?, ?, ?)",
        [userId, -cost, `game_${difficulty}`]
      );

      const [rows] = await db.query("SELECT * FROM users WHERE userId = ?", [
        userId,
      ]);
      return {
        success: true,
        tokensCost: cost,
        tokensRemaining: rows[0].tokens,
      };
    } catch (error) {
      logDbOperation(`MySQL spend tokens error: ${error.message}`);

      if (this.isConnectionError(error)) {
        dbType = "sqlite";
        initSqliteDb();
        await createTables();
        return sqliteActions.spendTokensForGame(userId, difficulty);
      }

      throw error;
    }
  },
};

// uniform api for all db types
const dbActions = {
  async getUser(userId) {
    return dbType === "mysql"
      ? await mysqlActions.getUser(userId)
      : sqliteActions.getUser(userId);
  },

  async updateTokens(userId, amount, transactionType) {
    return dbType === "mysql"
      ? await mysqlActions.updateTokens(userId, amount, transactionType)
      : sqliteActions.updateTokens(userId, amount, transactionType);
  },

  async claimDaily(userId) {
    return dbType === "mysql"
      ? await mysqlActions.claimDaily(userId)
      : sqliteActions.claimDaily(userId);
  },

  async convertXpToTokens(userId, xpAmount) {
    return dbType === "mysql"
      ? await mysqlActions.convertXpToTokens(userId, xpAmount)
      : sqliteActions.convertXpToTokens(userId, xpAmount);
  },

  async addXp(userId, amount) {
    return dbType === "mysql"
      ? await mysqlActions.addXp(userId, amount)
      : sqliteActions.addXp(userId, amount);
  },

  calculateLevel,

  async getTopUsers(sortBy = "xp", limit = 3) {
    return dbType === "mysql"
      ? await mysqlActions.getTopUsers(sortBy, limit)
      : sqliteActions.getTopUsers(sortBy, limit);
  },

  async spendTokensForGame(userId, difficulty) {
    return dbType === "mysql"
      ? await mysqlActions.spendTokensForGame(userId, difficulty)
      : sqliteActions.spendTokensForGame(userId, difficulty);
  },

  // Add testing function
  async testConnection() {
    try {
      if (dbType === "sqlite") {
        const result = db.prepare("SELECT 1 as test").get();
        return {
          success: true,
          message: `SQLite connected successfully`,
        };
      } else if (dbType === "mysql") {
        const [result] = await db.query("SELECT 1 as test");
        return {
          success: true,
          message: `MySQL connected to ${DB.HOST}/${DB.DATABASE}`,
        };
      }
    } catch (error) {
      return {
        success: false,
        message: `Connection test failed: ${error.message}`,
      };
    }
  },
};

// Add this to your initializeDatabase function
async function migrateLastDailyToTimestamp() {
  try {
    logDbOperation("Migrating lastDaily from date to timestamp...");

    if (dbType === "sqlite") {
      // Prüfen, ob Migration notwendig ist (falls Benutzer im Textformat existieren)
      const needsMigration = db
        .prepare(
          "SELECT COUNT(*) as count FROM users WHERE lastDaily IS NOT NULL AND typeof(lastDaily) = 'text'"
        )
        .get();

      if (needsMigration.count > 0) {
        // Alle Benutzer mit Textdaten abrufen
        const users = db
          .prepare(
            "SELECT userId, lastDaily FROM users WHERE lastDaily IS NOT NULL AND typeof(lastDaily) = 'text'"
          )
          .all();

        for (const user of users) {
          // YYYY-MM-DD in Timestamp umwandeln
          if (user.lastDaily) {
            const dateTimestamp = new Date(user.lastDaily).getTime();
            if (!isNaN(dateTimestamp)) {
              db.prepare("UPDATE users SET lastDaily = ? WHERE userId = ?").run(
                dateTimestamp,
                user.userId
              );
            } else {
              // Bei ungültigem Datum auf null setzen
              db.prepare(
                "UPDATE users SET lastDaily = NULL WHERE userId = ?"
              ).run(user.userId);
            }
          }
        }

        logDbOperation(
          `Migrated ${needsMigration.count} users' lastDaily values to timestamps`
        );
      }
    } else if (dbType === "mysql") {
      // Ähnliche Migration für MySQL
      const [needsMigration] = await db.query(
        "SELECT COUNT(*) as count FROM users WHERE lastDaily IS NOT NULL"
      );

      if (needsMigration[0].count > 0) {
        const [users] = await db.query(
          "SELECT userId, lastDaily FROM users WHERE lastDaily IS NOT NULL"
        );

        for (const user of users) {
          if (user.lastDaily) {
            const dateTimestamp = new Date(user.lastDaily).getTime();
            if (!isNaN(dateTimestamp)) {
              await db.query(
                "UPDATE users SET lastDaily = ? WHERE userId = ?",
                [dateTimestamp, user.userId]
              );
            } else {
              await db.query(
                "UPDATE users SET lastDaily = NULL WHERE userId = ?",
                [user.userId]
              );
            }
          }
        }

        logDbOperation(
          `Migrated ${needsMigration[0].count} users' lastDaily values to timestamps`
        );
      }
    }
  } catch (error) {
    logDbOperation(`Error migrating lastDaily values: ${error.message}`);
  }
}

// initialize db on import
(async () => {
  await initializeDatabase();
})();

module.exports = dbActions;
