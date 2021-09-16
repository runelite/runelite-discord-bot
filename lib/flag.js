import { log } from './common.js'
import config from './config.js'

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
  if (isRecentlyFlagged(message.author)) {
    return
  }

  if (!message.member.presence) {
    return
  }

  // Flag fake
  if (message.channel.name in config.channels.flagChannels) {
    const tier = config.channels.flagChannels[message.channel.name]
    const checkedRoles = Object.keys(config.roles.flagRoles).filter(r => config.roles.flagRoles[r] <= tier)

    if (message.member.roles === undefined || message.member.roles.cache.every(r => checkedRoles.includes(r.name.toLowerCase()))) {
      const activity = message.member.presence.activities.find(p => p.applicationId === config.discordAppID)
      if (activity && activity.assets.largeText.endsWith('+')) {
        message.react('❗').catch(log.error)
        addRecentlyFlagged(message.member)
      }
    }
  }

  // Flag bad
  const activity = message.member.presence.activities.some(p => config.badAppIDs.includes(p.applicationId))
  if (activity) {
    message.react('💩').catch(log.error)
    addRecentlyFlagged(message.member)
  }
}

export {
  flagMessageIfNeeded,
  pruneRecentlyFlagged
}
