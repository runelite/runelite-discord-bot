export default {
  // Minimum level of messages that are logged to console
  logLevel: process.env.LOG_LEVEL || 'info',
  // Bot command prefix in Discord server
  prefix: '!',
  databases: {
    // Path to database holding custom commands
    commands: './db.json',
    // Path to database holding links between GitHub user id and Discord user id
    githubUsers: './gh_users.json',
    // Path to database holding list of filtered words
    filteredWords: './filtered_words.json',
    // Path to database holding list of persisted roles for users
    roles: './roles.json'
  },
  // URL to icon that is used for bot custom embeds
  logoUrl: 'https://raw.githubusercontent.com/runelite/runelite.net/master/public/img/runelite_logo.png',
  // GitHub API token used to avoid rejection from GitHub API when request limit is reached
  githubToken: process.env.GITHUB_TOKEN,
  // This is token used for bot to login, must be from Discord Application who has bot enabled
  discordToken: process.env.DISCORD_TOKEN,
  // Used for getting information about streamer from Twitch API
  twitchClientId: process.env.TWITCH_CLIENT_ID,
  twitchClientSecret: process.env.TWITCH_CLIENT_SECRET,
  // Discord Application ID for RuneLite
  discordAppID: '409416265891971072',
  // Bad IDs to flag
  badAppIDs: [],
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
    serverLogs: 'server-logs',
    // Name of Discord channel where bot DMs will be forwarded
    modMail: 'mod-mail',
    // Name of channels where notices will be posted
    notices: ['runelite', 'support'],
    // Names of channels to flag users in, and the tier that roles will be checked against
    flagChannels: { runelite: 1, general: 1, support: 2 }
  },
  roles: {
    // Do not assign new roles to users with these roles and persist the roles for rejoins
    roleAssignmentBad: [
      'not-in-development',
      'muted'
    ],
    // Do not assign bad roles to users with these roles
    roleAssignmentGood: [
      'admin',
      'contributor',
      'moderator',
      'bot'
    ],
    // Name of Discord role that will be used to mute people
    muted: 'muted',
    // Name of Discord role that will be used to check if user can be announced in streamer channel
    streams: 'streamer',
    // Name of Discord role that will be given to users authed via GitHub
    verified: 'github-verified',
    // Name of Discord role that will be given to users that contributed to main github repo
    contributor: 'github-contributor',
    // Name of Discord role that will be given to users that contributed to plugin hub repo
    pluginHubContributor: 'pluginhub-contributor',
    // Names of the roles to be checked for flagging, and the channel tier required to be considered
    flagRoles: { patreon: 1, '@everyone': 1, 'github-verified': 2, 'github-contributor': 2 }
  },
  spam: {
    // Amount of time (in milliseconds) in which messages are considered spam
    maxInterval: 500,
    // Amount of time (ms) in which duplicate messages are considered spam
    maxDuplicatesInterval: 60000,
    // Amount of time (ms) in which banned words messages are considered bad
    maxBannedWordsInterval: 60000,
    // Amount of messages that will cause a kick
    kickThreshold: 5,
    // Amount of messages that will cause a mute
    muteThreshold: 10,
    // Amount of messages that will cause a ban
    banThreshold: 15,
    // List of filtered words to auto-delete
    filteredWords: [
      'discord.gg',
      'twitch.tv'
    ],
    // List of filtered swear words to auto-delete (selected from https://en.wikipedia.org/wiki/List_of_ethnic_slurs), these words are checked against word boundaries
    filteredSwearWords: [
      'chink',
      'coon',
      'dyke',
      'fag',
      'faggot',
      'homo',
      'jizz',
      'nazi',
      'niglet',
      'nig-nog',
      'nignog',
      'nigger',
      'niger',
      'nig',
      'nigga',
      'queer',
      'tranny',
      'slut',
      'twat',
      'whore'
    ]
  }
}
