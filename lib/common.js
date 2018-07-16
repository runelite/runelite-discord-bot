const {RichEmbed} = require('discord.js')
const log = require('loglevel')
const config = require('./config')
log.setLevel(config.logLevel)

function createEmbed () {
  return new RichEmbed()
    .setThumbnail(config.logoUrl)
    .setColor(0xec644b)
    .setFooter('RuneLite Bot', config.logoUrl)
}

module.exports = {
  log,
  createEmbed
}
