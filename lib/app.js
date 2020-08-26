const fetch = require('node-fetch')
const Discord = require('discord.js')
const { log } = require('./common')
const { updateStream } = require('./twitch')
const { fetchContributors } = require('./contributors')
const { fetchBlocked } = require('./blocked')
const { messageFilter } = require('./security')
const config = require('./config')
const commands = require('./commands')
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
  scheduleWithFixedDelay(client, updateStatus, 60000)
  scheduleWithFixedDelay(client, () => fetchAllContributors(client), 30 * 60000)
  scheduleWithFixedDelay(client, () => fetchBlocked(client.guilds), 60 * 60000)
})

client.on('message', message => {
  if (message.author.bot) {
    return
  }

  if (messageFilter(message)) {
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
  if (!newMember.roles.some(r => r.name.toLowerCase() === config.roles.streams.toLowerCase())) {
    return
  }

  const oldUrl = oldMember.presence && oldMember.presence.game && oldMember.presence.game.streaming && oldMember.presence.game.url
  const newUrl = newMember.presence && newMember.presence.game && newMember.presence.game.streaming && newMember.presence.game.url
  const streamerUrl = newUrl || oldUrl || ''
  const streamerId = streamerUrl.replace('https://www.twitch.tv/', '')

  updateStream(newMember, streamerId, newUrl)
})

client.on('guildBanAdd', (guild, user) => {
  const logs = guild.channels.find(c => c.name === config.channels.moderationLogs)

  if (!logs) {
    return
  }

  logs.send(`:no_entry: **${user.username}#${user.discriminator}** was banned`)
})

client.on('guildBanRemove', (guild, user) => {
  const logs = guild.channels.find(c => c.name === config.channels.moderationLogs)

  if (!logs) {
    return
  }

  logs.send(`:ok: **${user.username}#${user.discriminator}** was unbanned`)
})

client.on('guildMemberAdd', (member) => {
  const guild = member.guild
  const user = member.user
  const logs = guild.channels.find(c => c.name === config.channels.serverLogs)

  if (!logs) {
    return
  }

  logs.send(`:metal: **${user.username}#${user.discriminator}'s** joined the guild.`)
})

client.on('guildMemberRemove', (member) => {
  const guild = member.guild
  const user = member.user
  const logs = guild.channels.find(c => c.name === config.channels.serverLogs)

  if (!logs) {
    return
  }

  logs.send(`:wave: **${user.username}#${user.discriminator}'s** left the guild.`)
})

client.on('messageDelete', (message) => {
  const guild = message.guild
  const user = message.author
  const logs = guild.channels.find(c => c.name === config.channels.serverLogs)

  if (!logs) {
    return
  }

  logs.send(`:wastebasket: **${user.username}#${user.discriminator}'s** message was deleted: ${message.content}`)
})

client.on('error', log.error)

client.login(config.discordToken.toString())
  .then(token => log.info('Successfully authenticated with token', token))
  .catch(err => log.error('Failed to authenticate with token', err))
