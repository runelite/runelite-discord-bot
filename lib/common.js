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
    .setFooter('RuneLite Bot', config.logoUrl)
}

function sendStream (channel, member, streamerId) {
  const headers = {
    headers: {
      'Client-ID': config.twitchClientId
    }
  }

  return fetch(`https://api.twitch.tv/helix/users?login=${streamerId}`, headers)
    .then(res => res.json())
    .then(users => {
      const user = users.data[0]

      return fetch(`https://api.twitch.tv/helix/streams?user_id=${user.id}`, headers)
        .then(res => res.json())
        .then(streams => {
          const stream = streams.data[0]
          return fetch(`https://api.twitch.tv/helix/games?id=${stream.game_id}`, headers)
            .then(res => res.json())
            .then(games => {
              const game = games.data[0]

              if (game.name.toLowerCase().indexOf('runescape') === -1) {
                return Promise.reject(new Error(`Invalid game or stream: ${game.name}`))
              }

              const image = stream.thumbnail_url
                .replace('{width}', '1280')
                .replace('{height}', '720')

              const channelUrl = `https://twitch.tv/${streamerId}`

              const embed = createEmbed()
                .setColor(6570406)
                .setAuthor(member.displayName, member.user.displayAvatarURL, channelUrl)
                .setDescription(user.description)
                .setThumbnail(user.profile_image_url)
                .setTitle(`${stream.title}`)
                .setURL(channelUrl)
                .setImage(image)

              return channel.send({ embed })
            })
        })
    })
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
