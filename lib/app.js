const fetch = require('node-fetch')
const Discord = require('discord.js')
const { log, sendDM } = require('./common')
const { updateStream } = require('./twitch')
const { fetchContributors } = require('./contributors')
const { fetchBlocked } = require('./blocked')
const { messageFilter, resetMessageCache, buildUserDetail, buildMessageDetail } = require('./security')
const config = require('./config')
const commands = require('./commands')
const { filteredWordsDb } = require('./db')
const client = new Discord.Client()

function updateStatus () {
  return fetch(`https://api.runelite.net/session/count`)
    .then(res => res.json())
    .then(body => client.user.setActivity(`${body} players online`))
    .catch(e => log.debug(e))
}

function fetchAllContributors (client) {
  let contributorPromise = fetchContributors(config.github.pluginHubRepo, config.roles.pluginHubContributor, client.guilds, 0)

  for (let contributorRepo of config.github.contributorRepos) {
    const contrCallback = () => fetchContributors(contributorRepo, config.roles.contributor, client.guilds, 0)

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
  if (filteredWordsDb.ls().length === 0) {
    log.info(`Filling filtered words database with default data.`)
    config.spam.filteredSwearWords.forEach(w => {
      filteredWordsDb.put(`\\b${w}\\b`, true)
    })
  }

  scheduleWithFixedDelay(client, updateStatus, 60000)
  scheduleWithFixedDelay(client, () => fetchAllContributors(client), 30 * 60000)
  scheduleWithFixedDelay(client, () => fetchBlocked(client.guilds), 60 * 60000)
  scheduleWithFixedDelay(client, () => resetMessageCache(), 60 * 60000)
})

client.on('message', message => {
  if (message.author.bot) {
    return
  }

  const filteredResult = messageFilter(message, client)

  if (filteredResult) {
    const logs = message.guild.channels.find(c => c.name === config.channels.moderationLogs)

    if (!logs) {
      return
    }

    const messageDetail = `message was filtered.\n**Reason:** ${filteredResult}.` + buildMessageDetail(message)

    logs.send(`${buildUserDetail(message.author)}'s ${messageDetail}`)
      .then(() => sendDM(message.author, `Your ${messageDetail}`))
      .then(() => message.deletable && message.delete())
      .catch(log.debug)

    return
  }

  if (!message.content.startsWith(config.prefix)) {
    return
  }

  const args = message.content.slice(config.prefix.length).trim().split(/ +/g)
  const command = args.shift().toLowerCase()
  log.debug('Received command', command, args)
  commands(message, command, args).catch(log.debug)
})

client.on('presenceUpdate', (oldMember, newMember) => {
  if (!newMember.roles.some(r => r.name.toLowerCase() === config.roles.streams.toLowerCase())) {
    return
  }

  const oldUrl = oldMember.presence && oldMember.presence.game && oldMember.presence.game.streaming && oldMember.presence.game.url
  const newUrl = newMember.presence && newMember.presence.game && newMember.presence.game.streaming && newMember.presence.game.url
  const streamerUrl = newUrl || oldUrl || ''
  const streamerId = streamerUrl.replace('https://www.twitch.tv/', '')

  updateStream(newMember, streamerId, newUrl).catch(log.debug)
})

client.on('guildBanAdd', (guild, user) => {
  const logs = guild.channels.find(c => c.name === config.channels.moderationLogs)

  if (!logs) {
    return
  }

  logs.send(`:no_entry: ${buildUserDetail(user)} was banned`)
})

client.on('guildBanRemove', (guild, user) => {
  const logs = guild.channels.find(c => c.name === config.channels.moderationLogs)

  if (!logs) {
    return
  }

  logs.send(`:ok: ${buildUserDetail(user)} was unbanned`)
})

client.on('guildMemberAdd', (member) => {
  const guild = member.guild
  const user = member.user
  const logs = guild.channels.find(c => c.name === config.channels.serverLogs)

  if (!logs) {
    return
  }

  logs.send(`:metal: ${buildUserDetail(user)} joined the guild.`)
})

client.on('guildMemberRemove', (member) => {
  const guild = member.guild
  const user = member.user
  const logs = guild.channels.find(c => c.name === config.channels.serverLogs)

  if (!logs) {
    return
  }

  logs.send(`:wave: ${buildUserDetail(user)} left the guild.`)
})

client.on('messageDelete', (message) => {
  const user = message.author
  const guild = message.guild

  if (!guild) {
    return
  }

  const logs = guild.channels.find(c => c.name === config.channels.serverLogs)

  if (!logs) {
    return
  }

  const messageDetail = buildMessageDetail(message)
  logs.send(`:wastebasket: ${buildUserDetail(user)}'s message was deleted.${messageDetail}`)
})

client.on('error', log.error)

client.login(config.discordToken.toString())
  .then(token => log.info('Successfully authenticated with token', token))
  .catch(err => log.error('Failed to authenticate with token', err))
