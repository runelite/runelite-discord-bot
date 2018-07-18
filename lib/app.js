const fetch = require('node-fetch')
const {Client} = require('discord.js')
const {log, createEmbed} = require('./common')
const config = require('./config')
const commands = require('./commands')
const client = new Client()
const streamerMessages = new Map()

client.on('ready', () => {
  log.info(`Logged in as ${client.user.tag}!`)

  client.setInterval(() => {
    fetch('https://api.github.com/repos/runelite/runelite/tags', {
      headers: {
        Authorization: `token ${config.githubToken}`
      }
    }).then(res => res.json())
      .then(body => {
        const release = body[0]
        const version = release.name.substring(
          release.name.lastIndexOf('-') + 1,
          release.name.length)

        return fetch(`https://api.runelite.net/runelite-${version}/session/count`)
      })
      .then(res => res.json())
      .then(body => {
        log.debug('Updating user activity with players online', body)
        return client.user.setActivity(`${body} players online`)
      })
      .catch(e => log.debug(e))
  }, 60000)
})

client.on('message', message => {
  if (message.author.bot) {
    return
  }

  if (!message.content.startsWith(config.prefix)) {
    return
  }

  const args = message.content.slice(config.prefix.length).trim().split(/ +/g)
  const command = args.shift().toLowerCase()
  log.debug('Received command', command, args)
  commands(message, command, args)
})

client.on('presenceUpdate', (oldMember, newMember) => {
  if (!newMember.roles.some(r => r.name.toLowerCase() === config.streamerRole.toLowerCase())) {
    return
  }

  const oldUrl = oldMember.presence && oldMember.presence.game && oldMember.presence.game.streaming && oldMember.presence.game.url
  const newUrl = newMember.presence && newMember.presence.game && newMember.presence.game.streaming && newMember.presence.game.url
  const channel = client.channels.find('name', config.streamerChannel)
  const streamerUrl = newUrl || oldUrl || ''
  const streamerId = streamerUrl.replace('https://www.twitch.tv/', '')
  const message = streamerMessages.get(streamerId)

  if (message) {
    log.debug(`${streamerId} changed streaming status.`)
    message.delete()
  }

  if (!newUrl) {
    return
  }

  fetch(`https://api.twitch.tv/kraken/streams?channel=${streamerId}`, {
    headers: {
      'Client-ID': config.twitchClientId
    }
  }).then(res => res.json())
    .then(body => {
      const stream = body.streams[0]

      if (stream.game.toLowerCase().indexOf('runescape') === -1) {
        return
      }

      const embed = createEmbed()
        .setColor(6570406)
        .setTitle(stream.channel.status)
        .setURL(stream.channel.url)
        .setThumbnail(stream.channel.logo)
        .setAuthor(`${stream.channel.display_name} is now Live on Twitch!`, null, stream.channel.url)
        .setImage(`${stream.preview.medium}`)

      return channel.send({embed})
    })
    .then(m => {
      log.debug(`${streamerId} started streaming.`)
      streamerMessages.set(streamerId, m)
    })
    .catch(e => log.debug(e))
})

client.on('error', log.error)

client.login(config.discordToken)
  .then(token => log.info('Successfully authenticated with token', token))
  .catch(err => log.error('Failed to authenticate with token', err))
