const fetch = require('node-fetch')
const { RichEmbed } = require('discord.js')
const log = require('loglevel')
const config = require('./config')
const githubUserDb = require('littledb')(config.databases.githubUsers)
log.setLevel(config.logLevel)

function createEmbed () {
  return new RichEmbed()
    .setThumbnail(config.logoUrl)
    .setColor(0xec644b)
    .setFooter('RuneLitePlus Bot', config.logoUrl)
}

function sendStream (channel, member, streamerId) {
  const headers = {
    headers: {
      'Client-ID': config.twitchClientId
    }
  }

  return fetch(`https://api.twitch.tv/kraken/users/${streamerId}`, headers)
    .then(res => res.json())
    .then(userInfo => fetch(`https://api.twitch.tv/kraken/streams?channel=${streamerId}`, headers)
      .then(res => res.json())
      .then(body => {
        const stream = body.streams[0]

        if (!stream || stream.game.toLowerCase().indexOf('runescape') === -1) {
          return Promise.reject(new Error('Invalid game or stream'))
        }

        const image = stream.preview.template
          .replace('{width}', '1280')
          .replace('{height}', '720')

        const embed = createEmbed()
          .setColor(6570406)
          .setAuthor(member.displayName, member.user.displayAvatarURL, stream.channel.url)
          .setDescription(userInfo.bio)
          .setThumbnail(stream.channel.logo)
          .setTitle(`${stream.channel.status}`)
          .setURL(stream.channel.url)
          .setImage(image)

        return channel.send({ embed })
      }))
}

function sendDM (author, message) {
  return author.createDM().then(channel => channel.send(message))
}

module.exports = {
  log,
  createEmbed,
  sendStream,
  sendDM,
  githubUserDb
}
