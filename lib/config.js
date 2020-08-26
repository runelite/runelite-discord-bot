module.exports = {
  // Minimum level of messages that are logged to console
  logLevel: process.env.LOG_LEVEL || 'info',
  // Bot command prefix in Discord server
  prefix: '!',
  databases: {
    // Path to database holding custom commands
    commands: './db.json',
    // Path to database holding links between GitHub user id and Discord user id
    githubUsers: './gh_users.json'
  },
  // URL to icon that is used for bot custom embeds
  logoUrl: 'https://raw.githubusercontent.com/runelite/runelite.net/master/public/img/runelite_logo.png',
  // GitHub API token used to avoid rejection from GitHub API when request limit is reached
  githubToken: process.env.GITHUB_TOKEN,
  // This is token used for bot to login, must be from Discord Application who has bot enabled
  discordToken: process.env.DISCORD_TOKEN,
  // Used for getting information about streamer from Twitch API
  twitchClientId: process.env.TWITCH_CLIENT_ID,
  // Used for connecting Discord and GitHub accounts
  github: {
    clientId: process.env.GITHUB_AUTH_CLIENT_ID,
    clientSecret: process.env.GITHUB_AUTH_CLIENT_SECRET,
    organization: 'runelite',
    // GitHub repositories to fetch contributors from
    contributorRepos: [
      'runelite/runelite',
      'runelite/launcher',
      'runelite/runelite.net'
    ],
    // GitHub repository to fetch plugin hub contributors from
    pluginHubRepo: 'runelite/plugin-hub'
  },
  channels: {
    // Name of Discord channels where custom commands will be ignored
    noCustomCommands: ['development'],
    // Name of Discord channel where streamers will be announced
    streams: 'twitch',
    // Name of Discord channel where moderation logs will be sent (user ban/unban, user role change)
    moderationLogs: 'mod-logs',
    // Name of Discord channel where server logs will be sent (user join/leave)
    serverLogs: 'server-logs'
  },
  roles: {
    // Do not assign new roles to users with these roles
    roleAssignmentIgnore: [
      'not-in-development',
      'muted'
    ],
    // Name of Discord role that will be used to check if user can be announced in streamer channel
    streams: 'streamer',
    // Name of Discord role that will be given to users authed via GitHub
    verified: 'github-verified',
    // Name of Discord role that will be given to users that contributed to main github repo
    contributor: 'github-contributor',
    // Name of Discord role that will be given to users that contributed to plugin hub repo
    pluginHubContributor: 'pluginhub-contributor'
  }
}
