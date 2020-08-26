const { RichEmbed } = require('discord.js')
const log = require('loglevel')
const config = require('./config')
const githubUserDb = require('littledb')(config.databases.githubUsers)
const filteredWordsDb = require('littledb')(config.databases.filteredWords)

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

module.exports = {
  log,
  createEmbed,
  sendDM,
  githubUserDb,
  filteredWordsDb
}
