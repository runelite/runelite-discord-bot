const { RichEmbed } = require('discord.js')
const log = require('loglevel')
const config = require('./config')

log.setLevel(config.logLevel)

function createEmbed () {
  return new RichEmbed()
    .setThumbnail(config.logoUrl)
    .setColor(0xec644b)
    .setFooter('RuneLite Bot', config.logoUrl)
}

function sendDM (author, message) {
  return author.createDM().then(channel => channel.send(message))
}

function splitToChunks (array, parts) {
  let result = []
  for (let i = parts; i > 0; i--) {
    result.push(array.splice(0, Math.ceil(array.length / i)))
  }
  return result
}

async function fetchAuditEntryFor (guild, user, type) {
  const auditLogs = await guild.fetchAuditLogs({
    limit: 1,
    type: 'MEMBER_BAN_ADD'
  })

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
