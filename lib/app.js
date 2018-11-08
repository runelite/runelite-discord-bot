const fetch = require('node-fetch')
const Discord = require('discord.js')
const { log, sendStream } = require('./common')
const config = require('./config')
const commands = require('./commands')
const client = new Discord.Client()
const streamerMessages = new Map()

function updateStatus () {
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
    .then(body => client.user.setActivity(`${body} players online`))
    .catch(e => log.debug(e))
}

client.on('ready', () => {
  log.info(`Logged in as ${client.user.tag}!`)
  updateStatus()
  client.setInterval(updateStatus, 60000)
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
  const streamerUrl = newUrl || oldUrl || ''
  const streamerId = streamerUrl.replace('https://www.twitch.tv/', '')
  const message = streamerMessages.get(streamerId)

  if (!newUrl || message) {
    if (!newUrl) {
      message.delete()
      streamerMessages.delete(streamerId)
    }

    return
  }

  const channel = client.channels.find(c => c.name === config.streamerChannel)

  if (!channel) {
    return
  }

  return sendStream(channel, newMember, streamerId)
    .then(m => streamerMessages.set(streamerId, m))
    .catch(e => log.warn(e))
})

client.on('error', log.error)

client.login(config.discordToken)
  .then(token => log.info('Successfully authenticated with token', token))
  .catch(err => log.error('Failed to authenticate with token', err))
