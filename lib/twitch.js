const fetch = require('node-fetch')
const config = require('./config')
const { createEmbed, log } = require('./common')

const streamerMessages = new Map()

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

function updateStream (member, streamerId, url) {
  if (!streamerId || streamerId.trim().length === 0) {
    return
  }

  const message = streamerMessages.get(streamerId)

  if (message || !url) {
    if (message && !url) {
      message.delete()
      streamerMessages.delete(streamerId)
    }

    return
  }

  const channel = member.client.channels.find(c => c.name === config.channels.streams)

  if (!channel) {
    return
  }

  return sendStream(channel, member, streamerId)
    .then(m => {
      // Prevent sync issues
      const message = streamerMessages.get(streamerId)
      if (message) {
        message.delete()
      }

      streamerMessages.set(streamerId, m)
    })
    .catch(e => log.warn(e))
}

module.exports = {
  sendStream,
  updateStream
}
