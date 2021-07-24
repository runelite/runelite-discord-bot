const { log } = require('./common')
const config = require('./config')

const recentlyFlagged = new Map()

function isRecentlyFlagged (member) {
  return recentlyFlagged.has(member.id)
}

function addRecentlyFlagged (member) {
  recentlyFlagged.set(member.id, Date.now())
}

function pruneRecentlyFlagged () {
  const oldest = Date.now() - 20 * 60000
  for (const [id, time] of recentlyFlagged) {
    if (time < oldest) {
      recentlyFlagged.delete(id)
    }
  }
}

function flagMessageIfNeeded (message) {
  if (message.channel.name in config.channels.flagChannels && !isRecentlyFlagged(message.author)) {
    const tier = config.channels.flagChannels[message.channel.name]
    const checkedRoles = Object.keys(config.roles.flagRoles).filter(r => config.roles.flagRoles[r] <= tier)

    if (message.member.roles === undefined || message.member.roles.cache.every(r => checkedRoles.includes(r.name.toLowerCase()))) {
      const activity = message.author.presence.activities.find(p => p.applicationID === config.discordAppID)
      if (activity && activity.assets.largeText.endsWith('+')) {
        message.react('❗').catch(log.error)
        addRecentlyFlagged(message.author)
      }
    }
  }
}

module.exports = {
  flagMessageIfNeeded,
  pruneRecentlyFlagged
}
