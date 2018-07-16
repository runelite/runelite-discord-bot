module.exports = {
  // Minimum level of messages that are logged to console
  logLevel: 'info',
  // Bot command prefix in Discord server
  prefix: '!',
  // Path to database holding custom commands
  databasePath: './db',
  // Name of Discord role that will be used to check if user can be announced
  streamerRole: 'streamer',
  // Name of Discord channel where streamers will be announced
  streamerChannel: 'twitch',
  // URL to icon that is used for bot custom embeds
  logoUrl: 'https://raw.githubusercontent.com/runelite/runelite.net/master/public/img/runelite_logo.png',
  // GitHub API token used to avoid rejection from GitHub API when request limit is reached
  githubToken: process.env.GITHUB_TOKEN,
  // This is token used for bot to login, must be from Discord Application who has bot enabled
  discordToken: process.env.DISCORD_TOKEN,
  // Used for getting information about streamer from Twitch API
  twitchClientId: process.env.TWITCH_CLIENT_ID
}
