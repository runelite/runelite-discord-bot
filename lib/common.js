const {RichEmbed} = require('discord.js')
const logdriver = require('log-driver')
const config = require('./config')
const log = logdriver({level: config.logLevel})

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
