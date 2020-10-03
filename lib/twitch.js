const fetch = require('node-fetch')
const config = require('./config')
const { createEmbed, log } = require('./common')

const streamingUsers = new Map()

function parseStreamerId (url) {
  if (!url) {
    return ''
  }

  return url.replace(/https?:\/\/.*twitch.tv\//, '').trim()
}

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

  if (!user) {
    return Promise.resolve(new Error(`Invalid game or stream for user name: ${streamerId}`))
  }

  const streams = await fetch(`https://api.twitch.tv/helix/streams?user_id=${user.id}`, headers).then(res => res.json())
  const stream = streams.data[0]

  if (!stream) {
    return Promise.resolve(new Error(`Invalid game or stream for user: ${streamerId}`))
  }

  const games = await fetch(`https://api.twitch.tv/helix/games?id=${stream.game_id}`, headers).then(res => res.json())
  const game = games.data[0]

  if (!game || game.name.toLowerCase().indexOf('runescape') === -1) {
    return Promise.resolve(new Error(`Invalid game or stream: ${game.name}`))
  }

  const image = stream.thumbnail_url
    .replace('{width}', '1280')
    .replace('{height}', '720')

  const channelUrl = `https://twitch.tv/${streamerId}`

  const embed = createEmbed()
    .setColor(6570406)
    .setAuthor(member.name || user.display_name, member.avatar || user.profile_image_url, channelUrl)
    .setDescription(user.description)
    .setThumbnail(user.profile_image_url)
    .setTitle(`${stream.title}`)
    .setURL(channelUrl)
    .setImage(image)

  log.debug(`Sending stream for streamer ${streamerId}`)
  return channel.send({ embed })
}

function updateStream (member, oldUrl, newUrl) {
  const streamerUrl = newUrl || oldUrl || ''
  const streamerId = parseStreamerId(streamerUrl)

  if (!streamerId || streamerId.length === 0) {
    return
  }

  if (newUrl) {
    streamingUsers.set(streamerId, {
      'name': member.displayName,
      'avatar': member.user.displayAvatarURL
    })
  } else {
    streamingUsers.delete(streamerId)
  }
}

async function updateStreams (client) {
  log.debug('Updating streams...')
  const channel = client.channels.find(c => c.name === config.channels.streams)

  if (!channel) {
    return
  }

  const messagesRaw = await channel.fetchMessages()
  const filteredMessages = messagesRaw.filter(m => m.author.bot && m.author.id === client.user.id)

  const activeMessages = await Promise.all(filteredMessages.map(m => {
    const streamerId = parseStreamerId(m.embeds[0].url)

    if (!streamerId || streamerId.length === 0) {
      return Promise.resolve(null)
    }

    if (!streamingUsers.has(streamerId)) {
      return m.delete().then(() => null)
    }

    return Promise.resolve(streamerId)
  }))

  const messages = activeMessages.filter(m => m != null)

  return Promise.all(Array.from(streamingUsers.keys()).map(k => {
    const v = streamingUsers.get(k)

    if (messages.indexOf(k) === -1) {
      return sendStream(channel, v, k)
    }

    return Promise.resolve()
  })).catch(log.debug)
}

module.exports = {
  sendStream,
  updateStream,
  updateStreams
}
