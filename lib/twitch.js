import fetch from 'node-fetch'
import config from './config.js'
import { createEmbed, log } from './common.js'

const streamingUsers = new Map()

function parseStreamerId (url) {
  if (!url || !url.match(/.*twitch.tv\/.*/)) {
    return ''
  }

  return url.replace(/.*twitch.tv\//, '').trim()
}

async function sendStream (channel, member) {
  const token = await fetch(`https://id.twitch.tv/oauth2/token?client_id=${config.twitchClientId}&client_secret=${config.twitchClientSecret}&grant_type=client_credentials`, {
    method: 'POST'
  }).then(res => res.json())

  const headers = {
    headers: {
      'Client-ID': config.twitchClientId,
      Authorization: `Bearer ${token.access_token}`
    }
  }

  const users = await fetch(`https://api.twitch.tv/helix/users?login=${member.id}`, headers).then(res => res.json())
  const user = users.data[0]

  if (!user) {
    return Promise.resolve(new Error(`Invalid game or stream for user name: ${member.id}`))
  }

  const streams = await fetch(`https://api.twitch.tv/helix/streams?user_id=${user.id}`, headers).then(res => res.json())
  const stream = streams.data[0]

  if (!stream) {
    return Promise.resolve(new Error(`Invalid game or stream for user: ${member.id}`))
  }

  const games = await fetch(`https://api.twitch.tv/helix/games?id=${stream.game_id}`, headers).then(res => res.json())
  const game = games.data[0]

  if (!game || game.name.toLowerCase().indexOf('runescape') === -1) {
    return Promise.resolve(new Error(`Invalid game or stream: ${game.name}`))
  }

  const image = stream.thumbnail_url
    .replace('{width}', '1280')
    .replace('{height}', '720')

  const channelUrl = `https://twitch.tv/${member.id}`

  const embed = createEmbed()
    .setColor(6570406)
    .setAuthor({
      name: member.name || user.display_name,
      url: channelUrl,
      iconURL: member.avatar || user.profile_image_url
    })
    .setDescription(user.description)
    .setThumbnail(user.profile_image_url)
    .setTitle(`${stream.title}`)
    .setURL(channelUrl)
    .setImage(image)

  log.info(`Sending stream for streamer ${member.id}`)
  return channel.send({ embeds: [embed] })
}

function updateStream (member, streamerUrl) {
  const streamerId = parseStreamerId(streamerUrl)

  if (!streamerId) {
    streamingUsers.delete(member.id)
    return
  }

  streamingUsers.set(member.id, {
    id: streamerId,
    name: member.displayName,
    avatar: member.user.displayAvatarURL()
  })
}

async function updateStreams (channels) {
  log.info('Updating streams...')
  const channel = channels.cache.find(c => c.name === config.channels.streams)

  if (!channel) {
    return
  }

  const messagesRaw = await channel.messages.fetch()
  const filteredMessages = messagesRaw.filter(m => m.author.bot)
  const messages = filteredMessages.map(m => {
    const streamerId = parseStreamerId(m.embeds[0].url)

    if (!streamerId) {
      return null
    }

    if (!Array.from(streamingUsers.values()).find(u => u.id === streamerId)) {
      m.delete()
      return null
    }

    return streamerId
  }).filter(m => m != null)

  return Promise.all(Array.from(streamingUsers.keys()).map(k => {
    const v = streamingUsers.get(k)

    if (messages.indexOf(v.id) === -1) {
      return sendStream(channel, v)
    }

    return Promise.resolve()
  })).catch(log.warn)
}

export {
  sendStream,
  updateStream,
  updateStreams
}
