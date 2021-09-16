import { Permissions, MessageEmbed } from 'discord.js'
import log from 'loglevel'
import config from './config.js'

log.setLevel(config.logLevel)

function createEmbed () {
  return new MessageEmbed()
    .setThumbnail(config.logoUrl)
    .setColor(0xec644b)
}

async function fetchAuditEntryFor (guild, user, type) {
  if (!guild.me.permissions.has([Permissions.FLAGS.VIEW_AUDIT_LOG])) {
    log.warn(`User ${guild.me.user.tag} is missing VIEW_AUDIT_LOG permission.`)
    return null
  }

  const auditLogs = await guild.fetchAuditLogs({
    limit: 1,
    type: type
  }).catch(log.debug)

  if (!auditLogs) {
    return null
  }

  const entries = auditLogs.entries.filter(e => e.target.id === user.id)
  return entries.first()
}

function getUserFromMention (users, mention) {
  if (!mention) return

  if (mention.startsWith('<@') && mention.endsWith('>')) {
    mention = mention.slice(2, -1)

    if (mention.startsWith('!')) {
      mention = mention.slice(1)
    }

    return users.cache.get(mention)
  }
}

export {
  log,
  createEmbed,
  fetchAuditEntryFor,
  getUserFromMention
}
