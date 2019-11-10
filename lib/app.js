const fetch = require('node-fetch')
const Discord = require('discord.js')
const { log, sendStream } = require('./common')
const { fetchContributors } = require('./contributors')
const config = require('./config')
const commands = require('./commands')
const filter = require('./filter')
const client = new Discord.Client()
const streamerMessages = new Map()

function updateStatus () {
  return fetch(`https://api.runelite.net/session/count`)
    .then(res => res.json())
    .then(body => client.user.setActivity(`${body} players online`))
    .catch(e => log.debug(e))
}

function fetchAllContributors (client) {
  var contributorPromise = null

  for (let contributorRepo of config.contributorRepos) {
    const contrCallback = () => fetchContributors(contributorRepo, client.guilds, 0)

    if (contributorPromise) {
      contributorPromise = contributorPromise.then(contrCallback)
    } else {
      contributorPromise = contrCallback()
    }
  }

  return contributorPromise
}

function scheduleWithFixedDelay (client, promiseCreator, delay) {
  return promiseCreator()
    .then(() => client
      .setTimeout(() => scheduleWithFixedDelay(client, promiseCreator, delay), delay))
}

client.on('ready', () => {
  log.info(`Logged in as ${client.user.tag}!`)
  scheduleWithFixedDelay(client, updateStatus, 60000)
  scheduleWithFixedDelay(client, () => fetchAllContributors(client), 30 * 60000)
})

client.on('message', message => {
  if (message.author.bot) {
    return
  }

  if (filter(message)) {
    message.delete()
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

  if (!streamerId || streamerId.trim().length === 0) {
    return
  }

  const message = streamerMessages.get(streamerId)

  if (message || !newUrl) {
    if (message && !newUrl) {
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
    .then(m => {
      // Prevent sync issues
      const message = streamerMessages.get(streamerId)
      if (message) {
        message.delete()
      }

      streamerMessages.set(streamerId, m)
    })
    .catch(e => log.warn(e))
})

client.on('error', log.error)

client.login(config.discordToken)
  .then(token => log.info('Successfully authenticated with token', token))
  .catch(err => log.error('Failed to authenticate with token', err))
