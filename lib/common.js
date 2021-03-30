const { Permissions, MessageEmbed } = require('discord.js')
const log = require('loglevel')
const config = require('./config')

log.setLevel(config.logLevel)

function createEmbed () {
  return new MessageEmbed()
    .setThumbnail(config.logoUrl)
    .setColor(0xec644b)
}

function sendDM (author, message) {
  return author.createDM().then(channel => channel.send(message))
}

function splitToChunks (array, parts) {
  const result = []
  for (let i = parts; i > 0; i--) {
    result.push(array.splice(0, Math.ceil(array.length / i)))
  }
  return result
}

async function fetchAuditEntryFor (guild, user, type) {
  if (!guild.me.hasPermission(Permissions.FLAGS.VIEW_AUDIT_LOG)) {
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

module.exports = {
  log,
  createEmbed,
  sendDM,
  splitToChunks,
  fetchAuditEntryFor
}
