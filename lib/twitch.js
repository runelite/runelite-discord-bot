const fetch = require('node-fetch')
const config = require('./config')
const { createEmbed } = require('./common')

const streamerMessages = new Map()

async function sendStream (channel, member, streamerId) {
  const token = await fetch(`https://id.twitch.tv/oauth2/token?client_id=${config.twitchClientId}&client_secret=${config.twitchClientSecret}&grant_type=client_credentials`, {
    method: 'POST'
  }).then(res => res.json())

  const headers = {
    headers: {
      'Client-ID': config.twitchClientId,
      'Authorization': `Bearer ${token.access_token}`
    }
  }

  const users = await fetch(`https://api.twitch.tv/helix/users?login=${streamerId}`, headers).then(res => res.json())
  const user = users.data[0]

  const streams = await fetch(`https://api.twitch.tv/helix/streams?user_id=${user.id}`, headers).then(res => res.json())
  const stream = streams.data[0]
  const games = await fetch(`https://api.twitch.tv/helix/games?id=${stream.game_id}`, headers).then(res => res.json())
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
}

async function updateStream (member, streamerId, url) {
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

  const m = await sendStream(channel, member, streamerId)

  // Prevent sync issues
  const oldMessage = streamerMessages.get(streamerId)
  if (oldMessage) {
    oldMessage.delete()
  }

  streamerMessages.set(streamerId, m)
}

module.exports = {
  sendStream,
  updateStream
}
