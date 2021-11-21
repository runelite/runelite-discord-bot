import fetch from 'node-fetch'
import { Client, Intents } from 'discord.js'
import { log, fetchAuditEntryFor } from './common.js'
import { updateStream, updateStreams } from './twitch.js'
import { fetchAllContributors } from './contributors.js'
import { fetchBlocked } from './blocked.js'
import {
  processFilters,
  resetMessageCache,
  buildUserDetail,
  buildMessageDetail,
  isOurDeletion,
  pruneDeletedMessages,
  ensureRoles
} from './security.js'
import { flagMessageIfNeeded, pruneRecentlyFlagged } from './flag.js'
import config from './config.js'
import notice from './notice.js'
import { commandsDb, filteredWordsDb, roleDb } from './db.js'
import { findCommand, initCommands } from './commands.js'

const client = new Client({
  intents: [
    Intents.FLAGS.GUILDS,
    Intents.FLAGS.GUILD_MEMBERS,
    Intents.FLAGS.GUILD_BANS,
    Intents.FLAGS.GUILD_PRESENCES,
    Intents.FLAGS.GUILD_MESSAGES,
    Intents.FLAGS.GUILD_MESSAGE_REACTIONS,
    Intents.FLAGS.DIRECT_MESSAGES,
    Intents.FLAGS.GUILD_INTEGRATIONS
  ]
})

function updateStatus () {
  return fetch('https://api.runelite.net/session/count')
    .then(res => res.json())
    .then(body => client.user.setActivity(`${body} players online`))
    .catch(e => log.debug(e))
}

async function scheduleWithFixedDelay (promiseCreator, delay) {
  for (;;) {
    try {
      await promiseCreator()
    } catch (e) {
      log.warn('failure in scheduled task', e)
    }
    await new Promise(resolve => setTimeout(resolve, delay))
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

  client.guilds.cache.forEach(g => initCommands(client.user.id, g))

  scheduleWithFixedDelay(updateStatus, 60000)
  scheduleWithFixedDelay(() => fetchAllContributors(client), 30 * 60000)
  scheduleWithFixedDelay(() => fetchBlocked(client.guilds), 60 * 60000)
  scheduleWithFixedDelay(() => resetMessageCache(), 30 * 60000)
  scheduleWithFixedDelay(() => pruneDeletedMessages(), 10_000)
  scheduleWithFixedDelay(() => pruneRecentlyFlagged(), 5 * 60000)
  scheduleWithFixedDelay(() => updateStreams(client), 5 * 60000)
  scheduleWithFixedDelay(() => notice.cleanup(), 30_000)
})

client.on('interactionCreate', async interaction => {
  if (!interaction.isCommand() && !interaction.isContextMenu()) {
    return
  }

  const command = findCommand(interaction.commandName)

  if (!command) {
    return
  }

  await interaction.deferReply({
    ephemeral: command.ephemeral || false
  })

  try {
    await command.execute(interaction, client.user.id)
  } catch (e) {
    log.debug(e)
  }
})

client.on('messageCreate', message => {
  if (message.author.bot || !message.guild || !message.member) {
    return
  }

  if (!processFilters(message, client)) {
    return
  }

  if (!message.content.startsWith(config.prefix)) {
    flagMessageIfNeeded(message)
    notice.processMessage(message)
    return
  }

  const args = message.content.slice(config.prefix.length).trim().split(/ +/g)
  const command = args.shift().toLowerCase()
  const keys = commandsDb.ls().sort().sort((a, b) => a.length - b.length)

  for (const key of keys) {
    if (key.toLowerCase().indexOf(command.toLowerCase()) !== -1) {
      const prefix = command.length === key.length ? '' : `**${key}**: `
      return message.channel.send(`${prefix}${commandsDb.get(key)}`).catch(log.debug)
    }
  }

  return message.channel.send(`**!${command}** command not found!`).catch(log.debug)
})

client.on('messageUpdate', (oldMessage, newMessage) => {
  if (newMessage.author.bot || !newMessage.guild) {
    return
  }

  processFilters(newMessage, client, true)
})

client.on('presenceUpdate', (oldPresence, newPresence) => {
  const newMember = newPresence.member

  if (!newMember || !newMember.roles.cache.some(r => r.name.toLowerCase() === config.roles.streams.toLowerCase())) {
    return
  }

  const oldActivity = oldPresence && oldPresence.activities && oldPresence.activities.find(p => p.type === 'STREAMING')
  const oldUrl = oldActivity && oldActivity.url
  const newActivity = newPresence.activities && newPresence.activities.find(p => p.type === 'STREAMING')
  const newUrl = newActivity && newActivity.url

  updateStream(newMember, oldUrl, newUrl)
})

client.on('guildBanAdd', async (guildBan) => {
  const guild = guildBan.guild
  const user = guildBan.user
  const logs = guild.channels.cache.find(c => c.name === config.channels.moderationLogs)

  if (!logs) {
    return
  }

  try {
    const auditEntry = await fetchAuditEntryFor(guild, user, 'MEMBER_BAN_ADD')
    const executorMessage = auditEntry && auditEntry.executor.tag
      ? ` by **${auditEntry.executor.tag}**`
      : ''

    const reasonMessage = auditEntry && auditEntry.reason
      ? `\n**Reason:** ${auditEntry.reason}`
      : ''

    await logs.send(`:no_entry: ${buildUserDetail(user)} was banned${executorMessage}.${reasonMessage}`)
  } catch (e) {
    log.debug(e)
  }
})

client.on('guildBanRemove', async (guildBan) => {
  const guild = guildBan.guild
  const user = guildBan.user
  const logs = guild.channels.cache.find(c => c.name === config.channels.moderationLogs)

  if (!logs) {
    return
  }

  const auditEntry = await fetchAuditEntryFor(guild, user, 'MEMBER_BAN_ADD')
  const executorMessage = auditEntry && auditEntry.executor.tag
    ? ` by **${auditEntry.executor.tag}**`
    : ''

  return logs.send(`:ok: ${buildUserDetail(user)} was unbanned${executorMessage}.`).catch(log.debug)
})

client.on('guildMemberAdd', (member) => {
  const guild = member.guild
  const user = member.user
  ensureRoles(member, guild.roles)

  const logs = guild.channels.cache.find(c => c.name === config.channels.serverLogs)

  if (!logs) {
    return
  }

  return logs.send(`:metal: ${buildUserDetail(user)} joined the guild. (${guild.members.cache.size} members)`).catch(log.debug)
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
    try {
      const auditEntry = await fetchAuditEntryFor(guild, user, 'MEMBER_KICK')

      if (auditEntry) {
        const executorMessage = auditEntry.executor.tag
          ? ` by **${auditEntry.executor.tag}**`
          : ''

        const reasonMessage = auditEntry.reason
          ? `\n**Reason:** ${auditEntry.reason}`
          : ''

        await modLogs.send(`:foot: ${buildUserDetail(user)} was kicked from the guild${executorMessage}.${reasonMessage}`).catch(log.debug)
      }
    } catch (e) {
      log.debug(e)
    }
  }

  return logs.send(`:wave: ${buildUserDetail(user)} left the guild. (${guild.members.cache.size} members)`).catch(log.debug)
})

async function onMessageDelete (message) {
  const user = message.author
  const guild = message.guild

  if (!guild || isOurDeletion(message.id)) {
    return
  }

  const logs = guild.channels.cache.find(c => c.name === config.channels.serverLogs)

  if (!logs) {
    return
  }

  try {
    const auditEntry = await fetchAuditEntryFor(guild, user, 'MESSAGE_DELETE')
    const extraMessage = auditEntry && auditEntry.executor.tag ? ` by **${auditEntry.executor.tag}**` : ''

    const messageDetail = buildMessageDetail(message)
    await logs.send(`:wastebasket: ${buildUserDetail(user)}'s message was deleted${extraMessage}.${messageDetail}`, { allowedMentions: { users: [] } })
  } catch (e) {
    log.debug(e)
  }
}

client.on('messageDelete', onMessageDelete)

client.on('messageDeleteBulk', async (messages) => {
  for (const msg of [...messages.values()].reverse()) {
    await onMessageDelete(msg)
  }
})

client.on('guildMemberUpdate', async (oldMember, newMember) => {
  const user = newMember.user
  const guild = newMember.guild

  if (!user || !guild) {
    return
  }

  const logs = guild.channels.cache.find(c => c.name === config.channels.serverLogs)

  if (!logs) {
    return
  }

  if (oldMember.roles.cache.size > newMember.roles.cache.size) {
    const auditEntry = await fetchAuditEntryFor(guild, user, 'MEMBER_ROLE_UPDATE')

    if (!auditEntry) {
      return
    }

    const roleChanges = auditEntry.changes.flatMap(c => c.new)

    // Remove stored persisted role if needed
    for (const role of roleChanges) {
      if (config.roles.roleAssignmentBad.includes(role.name)) {
        let roles = roleDb.get(user.id) || []
        roles = roles.filter(r => r !== role.name)
        roleDb.put(user.id, [...new Set(roles)])
      }
    }

    const roleStr = roleChanges.map(c => `**${c.name}**`).join(', ')
    const extraMessage = auditEntry.executor.tag ? ` by **${auditEntry.executor.tag}**` : ''
    await logs.send(`:person_running: ${buildUserDetail(user)}'s roles were updated${extraMessage}. Roles removed: ${roleStr}.`, { allowedMentions: { users: [] } })
  } else if (oldMember.roles.cache.size < newMember.roles.cache.size) {
    const auditEntry = await fetchAuditEntryFor(guild, user, 'MEMBER_ROLE_UPDATE')

    if (!auditEntry) {
      return
    }

    const roleChanges = auditEntry.changes.flatMap(c => c.new)

    // Persist roles if needed
    for (const role of roleChanges) {
      if (config.roles.roleAssignmentBad.includes(role.name)) {
        const roles = roleDb.get(user.id) || []
        roles.push(role.name)
        roleDb.put(user.id, [...new Set(roles)])
      }
    }

    const roleStr = roleChanges.map(c => `**${c.name}**`).join(', ')
    const extraMessage = auditEntry.executor.tag ? ` by **${auditEntry.executor.tag}**` : ''
    await logs.send(`:person_doing_cartwheel: ${buildUserDetail(user)}'s roles were updated${extraMessage}. Roles added: ${roleStr}.`, { allowedMentions: { users: [] } })
  }
})

client.on('error', log.warn)

client.login(config.discordToken.toString())
  .then(token => log.info('Successfully authenticated with token', token))
  .catch(err => log.error('Failed to authenticate with token', err))
