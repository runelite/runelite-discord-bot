const fetch = require('node-fetch')
const Discord = require('discord.js')
const heapdump = require('heapdump')
const { log, sendDM, fetchAuditEntryFor } = require('./common')
const { updateStream, updateStreams } = require('./twitch')
const { fetchContributors } = require('./contributors')
const { fetchBlocked } = require('./blocked')
const { messageFilter, resetMessageCache, buildUserDetail, buildMessageDetail, deleteMessage, isOurDeletion, pruneDeletedMessages } = require('./security')
const config = require('./config')
const commands = require('./commands')
const notice = require('./notice')
const { filteredWordsDb } = require('./db')

const client = new Discord.Client({
  messageCacheMaxSize: 100,
  messageCacheLifetime: 60 * 30,
  messageSweepInterval: 60 * 5
})

function updateStatus () {
  return fetch('https://api.runelite.net/session/count')
    .then(res => res.json())
    .then(body => client.user.setActivity(`${body} players online`))
    .catch(e => log.debug(e))
}

function fetchAllContributors (client) {
  let contributorPromise = fetchContributors(config.github.pluginHubRepo, config.roles.pluginHubContributor, client.guilds, 0)

  for (const contributorRepo of config.github.contributorRepos) {
    const contrCallback = () => fetchContributors(contributorRepo, config.roles.contributor, client.guilds, 0)

    if (contributorPromise) {
      contributorPromise = contributorPromise.then(contrCallback)
    } else {
      contributorPromise = contrCallback()
    }
  }

  return contributorPromise
}

async function scheduleWithFixedDelay (client, promiseCreator, delay) {
  for (;;) {
    try {
      await promiseCreator()
    } catch (e) {
      log.warn('failure in scheduled task', e)
    }
    await new Promise(resolve => client.setTimeout(resolve, delay))
  }
}

client.on('ready', () => {
  log.info(`Logged in as ${client.user.tag}!`)
  if (filteredWordsDb.ls().length === 0) {
    log.info('Filling filtered words database with default data.')
    config.spam.filteredSwearWords.forEach(w => {
      filteredWordsDb.put(`\\b${w}\\b`, true)
    })
  }

  scheduleWithFixedDelay(client, updateStatus, 60000)
  scheduleWithFixedDelay(client, () => fetchAllContributors(client), 30 * 60000)
  scheduleWithFixedDelay(client, () => fetchBlocked(client.guilds), 60 * 60000)
  scheduleWithFixedDelay(client, () => resetMessageCache(), 30 * 60000)
  scheduleWithFixedDelay(client, () => pruneDeletedMessages(), 30_000)
  scheduleWithFixedDelay(client, () => updateStreams(client), 5 * 60000)
  scheduleWithFixedDelay(client, () => notice.cleanup(), 30_000)

  if (config.heapdumpEnabled) {
    let nextMBThreshold = 0

    scheduleWithFixedDelay(client, () => {
      const memMB = process.memoryUsage().rss / 1048576
      if (memMB > nextMBThreshold) {
        heapdump.writeSnapshot()
        nextMBThreshold += 100
      }
    }, 5 * 60000)
  }
})

client.on('message', message => {
  if (message.author.bot) {
    return
  }

  const filteredResult = messageFilter(message, client)

  if (filteredResult) {
    if (deleteMessage(message)) {
      return
    }

    const logs = message.guild.channels.cache.find(c => c.name === config.channels.moderationLogs)

    if (!logs) {
      return
    }

    const messageDetail = `message was filtered.\n**Reason:** ${filteredResult}.` + buildMessageDetail(message)

    logs.send(`${buildUserDetail(message.author)}'s ${messageDetail}`)
      .then(() => sendDM(message.author, `Your ${messageDetail}`))
      .catch(log.debug)

    return
  }

  if (!message.content.startsWith(config.prefix)) {
    notice.processMessage(message)
    return
  }

  const args = message.content.slice(config.prefix.length).trim().split(/ +/g)
  const command = args.shift().toLowerCase()
  log.debug('Received command', command, args)
  commands(message, command, args).catch(log.debug)
})

client.on('presenceUpdate', (oldPresence, newPresence) => {
  const newMember = newPresence.member

  if (!newMember.roles.cache.some(r => r.name.toLowerCase() === config.roles.streams.toLowerCase())) {
    return
  }

  const oldActivity = oldPresence && oldPresence.activities && oldPresence.activities.find(p => p.type === 'STREAMING')
  const oldUrl = oldActivity && oldActivity.url
  const newActivity = newPresence.activities && newPresence.activities.find(p => p.type === 'STREAMING')
  const newUrl = newActivity && newActivity.url

  updateStream(newMember, oldUrl, newUrl)
})

client.on('guildBanAdd', async (guild, user) => {
  const logs = guild.channels.cache.find(c => c.name === config.channels.moderationLogs)

  if (!logs) {
    return
  }

  const auditEntry = await fetchAuditEntryFor(guild, user, 'MEMBER_BAN_ADD')
  const executorMessage = auditEntry && auditEntry.executor.tag
    ? ` by **${auditEntry.executor.tag}**`
    : ''

  const reasonMessage = auditEntry && auditEntry.reason
    ? ` **Reason:** ${auditEntry.reason}`
    : ''

  logs.send(`:no_entry: ${buildUserDetail(user)} was banned${executorMessage}.${reasonMessage}`)
})

client.on('guildBanRemove', async (guild, user) => {
  const logs = guild.channels.cache.find(c => c.name === config.channels.moderationLogs)

  if (!logs) {
    return
  }

  const auditEntry = await fetchAuditEntryFor(guild, user, 'MEMBER_BAN_ADD')
  const executorMessage = auditEntry && auditEntry.executor.tag
    ? ` by **${auditEntry.executor.tag}**`
    : ''

  logs.send(`:ok: ${buildUserDetail(user)} was unbanned${executorMessage}.`)
})

client.on('guildMemberAdd', (member) => {
  const guild = member.guild
  const user = member.user
  const logs = guild.channels.cache.find(c => c.name === config.channels.serverLogs)

  if (!logs) {
    return
  }

  logs.send(`:metal: ${buildUserDetail(user)} joined the guild. (${guild.members.cache.size} members)`)
})

client.on('guildMemberRemove', async (member) => {
  const guild = member.guild
  const user = member.user
  const logs = guild.channels.cache.find(c => c.name === config.channels.serverLogs)

  if (!logs) {
    return
  }

  const modLogs = guild.channels.cache.find(c => c.name === config.channels.moderationLogs)

  if (modLogs) {
    const auditEntry = await fetchAuditEntryFor(guild, user, 'MEMBER_KICK')

    if (auditEntry) {
      const executorMessage = auditEntry.executor.tag
        ? ` by **${auditEntry.executor.tag}**`
        : ''

      const reasonMessage = auditEntry.reason
        ? ` **Reason:** ${auditEntry.reason}`
        : ''

      modLogs.send(`:foot: ${buildUserDetail(user)} was kicked from the guild${executorMessage}.${reasonMessage}`)
    }
  }

  logs.send(`:wave: ${buildUserDetail(user)} left the guild. (${guild.members.cache.size} members)`)
})

client.on('messageDelete', async (message) => {
  const user = message.author
  const guild = message.guild

  if (!guild || isOurDeletion(message.id)) {
    return
  }

  const logs = guild.channels.cache.find(c => c.name === config.channels.serverLogs)

  if (!logs) {
    return
  }

  const auditEntry = await fetchAuditEntryFor(guild, user, 'MESSAGE_DELETE')
  const extraMessage = auditEntry && auditEntry.executor.tag ? ` by **${auditEntry.executor.tag}**` : ''

  const messageDetail = buildMessageDetail(message)
  logs.send(`:wastebasket: ${buildUserDetail(user)}'s message was deleted${extraMessage}.${messageDetail}`, { allowedMentions: { users: [] } })
})

client.on('error', log.error)

client.login(config.discordToken.toString())
  .then(token => log.info('Successfully authenticated with token', token))
  .catch(err => log.error('Failed to authenticate with token', err))
