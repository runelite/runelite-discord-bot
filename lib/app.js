import fetch from 'node-fetch'
import { Client, Intents } from 'discord.js'
import { log, fetchAuditEntryFor, limitStrTo } from './common.js'
import { fetchAllContributors } from './contributors.js'
import { fetchBlocked } from './blocked.js'
import { cleanup, processModMail, processModMailReply, processModMailTyping } from './modmail.js'
import {
  processFilters,
  resetMessageCache,
  buildUserDetail,
  buildMessageDetail,
  isOurDeletion,
  pruneDeletedMessages,
  ensureRoles, hasPermissions, withoutMentions, initFilters, isAttachmentOk
} from './security.js'
import { flagMessageIfNeeded, pruneRecentlyFlagged } from './flag.js'
import config from './config.js'
import notice from './notice.js'
import { commandsDb, roleDb } from './db.js'
import { addCommand, createCommand, findCommand, initCommands } from './commands.js'

const client = new Client({
  partials: ['USER', 'CHANNEL', 'GUILD_MEMBER', 'MESSAGE', 'REACTION'],
  intents: [
    Intents.FLAGS.GUILDS,
    Intents.FLAGS.GUILD_MEMBERS,
    Intents.FLAGS.GUILD_BANS,
    Intents.FLAGS.GUILD_PRESENCES,
    Intents.FLAGS.GUILD_MESSAGES,
    Intents.FLAGS.GUILD_MESSAGE_REACTIONS,
    Intents.FLAGS.DIRECT_MESSAGES,
    Intents.FLAGS.DIRECT_MESSAGE_TYPING,
    Intents.FLAGS.GUILD_INTEGRATIONS
  ]
})

function isInvalidMessage (message) {
  return !message.author || message.author.bot || message.system
}

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

  initFilters()
  client.guilds.cache.forEach(g => initCommands(client.user.id, g))
  scheduleWithFixedDelay(updateStatus, 60000)
  scheduleWithFixedDelay(() => fetchAllContributors(client.guilds), 30 * 60000)
  scheduleWithFixedDelay(() => fetchBlocked(client.guilds), 60 * 60000)
  scheduleWithFixedDelay(() => resetMessageCache(), 30 * 60000)
  scheduleWithFixedDelay(() => pruneDeletedMessages(), 10_000)
  scheduleWithFixedDelay(() => pruneRecentlyFlagged(), 5 * 60000)
  scheduleWithFixedDelay(() => notice.cleanup(), 30_000)
  scheduleWithFixedDelay(() => cleanup(), 30_000)
})

client.on('interactionCreate', async interaction => {
  const command = await findCommand(interaction.commandName)

  if (!command) {
    return
  }

  if (interaction.isAutocomplete()) {
    if (command.complete) {
      return interaction.respond(await command.complete(interaction, client.user.id))
    }

    return
  }

  if (!interaction.isCommand() && !interaction.isContextMenu()) {
    return
  }

  if (command.protected && !hasPermissions(interaction.member)) {
    return interaction.reply({ content: ':no_entry: No permissions', ephemeral: true })
  }

  await interaction.deferReply({ ephemeral: command.ephemeral || false })

  try {
    await command.execute(interaction, client.user.id)
  } catch (e) {
    await interaction.followUp({ content: `Unexpected exception occurred: ${e.toString()}`, ephemeral: true })
  }
})

client.on('messageCreate', async message => {
  if (isInvalidMessage(message)) {
    return
  }

  if (message.channel.type === 'DM') {
    processModMail(message, client.guilds)
    return
  }

  if (!message.guild || !message.member) {
    return
  }

  if (message.channel.type === 'GUILD_PUBLIC_THREAD') {
    return processModMailReply(message)
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

  if (!command) {
    return
  }

  if (hasPermissions(message.member)) {
    if (command === 'notice') {
      const value = args.join(' ').trim()

      if (!value) {
        if (notice.hasRequiredFields()) {
          return message.channel.send({ embeds: [notice.getEmbed()] })
        }
      } else {
        notice.setDescription(value)
        return message.channel.send('Notice `description` updated.')
      }

      return
    } else if (command === 'command') {
      const name = args.shift()

      if (!name) {
        return
      }

      const value = args.join(' ').trim()

      if (!value) {
        return
      }

      const regex = /^[\w-]{1,32}$/

      if (!name.match(regex)) {
        return message.channel.send(`Failed to add command. \`${name}\` must match regex \`${regex}\``)
      }

      commandsDb.put(name, value)

      await addCommand(client.user.id, message.guild, createCommand(name, value))
      return message.channel.send(`Successfully added command \`${name}\``)
    } else if (command === 'cfpurge') {
      const arg = args.shift()
      if (!arg) {
        return
      }

      const zoneid = config.cfpurge.zoneId
      const token = config.cfpurge.token
      const body = {
        files: [arg]
      }
      const response = await fetch(`https://api.cloudflare.com/client/v4/zones/${zoneid}/purge_cache`, {
        method: 'POST',
        body: JSON.stringify(body),
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        }
      })
      const json = await response.json()
      let msg
      if (json.success) {
        msg = 'Successfully purged ' + arg
      } else {
        msg = 'Error purging ' + arg + ': ' + JSON.stringify(json)
      }
      return message.channel.send(msg)
    }
  }

  const keys = commandsDb.ls().sort().sort((a, b) => a.length - b.length)

  for (const key of keys) {
    if (key.toLowerCase().indexOf(command) !== -1) {
      const prefix = command.length === key.length ? '' : `**${key}**: `
      return message.channel.send(`${prefix}${commandsDb.get(key)}`)
    }
  }

  return message.channel.send(`**!${command}** command not found!`)
})

client.on('typingStart', typing => {
  if (typing.channel.type === 'DM') {
    processModMailTyping(typing, client.guilds)
  }
})

client.on('messageUpdate', (oldMessage, newMessage) => {
  if (!newMessage.author || newMessage.author.bot || !newMessage.guild) {
    return
  }

  processFilters(newMessage, client, true)
  onMessageEdit(oldMessage, newMessage)
})

function onMessageEdit (oldMessage, newMessage) {
  const lastTime = oldMessage.createdTimestamp || newMessage.createdTimestamp
  const recentTime = newMessage.editedTimestamp

  if (!recentTime || !lastTime || (recentTime - lastTime < config.channels.editThreshold)) {
    return
  }

  const user = newMessage.author
  const guild = newMessage.guild
  if (!guild) {
    return
  }

  const logs = guild.channels.cache.find(c => c.name === config.channels.serverLogs)
  if (!logs) {
    return
  }

  const channel = newMessage.channel
  if (!channel || !config.channels.editChannels.some(c => c === channel.name)) {
    return
  }

  let messageDetail = `\n**Channel:** ${channel.toString()}`

  const oldContent = oldMessage.cleanContent
  if (oldContent) {
    messageDetail += `\n**Old Message:** ${limitStrTo(oldContent, 300)}`
  }

  const newContent = newMessage.cleanContent
  if (newContent) {
    messageDetail += `\n**New Message:** ${limitStrTo(newContent, 300)}`
  }

  messageDetail += `\n${newMessage.url}`

  logs.send(withoutMentions(`:pencil: ${buildUserDetail(user)}'s message was modified: ${messageDetail}`))
}

client.on('guildBanAdd', async (guildBan) => {
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

  const reasonMessage = auditEntry && auditEntry.reason
    ? `\n**Reason:** ${auditEntry.reason}`
    : ''

  await logs.send(`:no_entry: ${buildUserDetail(user)} was banned${executorMessage}.${reasonMessage}`)
})

client.on('guildBanRemove', async (guildBan) => {
  const guild = guildBan.guild
  const user = guildBan.user
  const logs = guild.channels.cache.find(c => c.name === config.channels.moderationLogs)

  if (!logs) {
    return
  }

  const auditEntry = await fetchAuditEntryFor(guild, user, 'MEMBER_BAN_REMOVE')
  const executorMessage = auditEntry && auditEntry.executor.tag
    ? ` by **${auditEntry.executor.tag}**`
    : ''

  await logs.send(`:ok: ${buildUserDetail(user)} was unbanned${executorMessage}.`)
})

client.on('guildMemberAdd', async (member) => {
  const guild = member.guild
  const user = member.user
  await ensureRoles(member, guild.roles)

  const logs = guild.channels.cache.find(c => c.name === config.channels.serverLogs)

  if (!logs) {
    return
  }

  await logs.send(`:metal: ${buildUserDetail(user)} joined the guild. (${guild.memberCount} members)`)
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
        ? `\n**Reason:** ${auditEntry.reason}`
        : ''

      await modLogs.send(`:foot: ${buildUserDetail(user)} was kicked from the guild${executorMessage}.${reasonMessage}`)
    }
  }

  await logs.send(`:wave: ${buildUserDetail(user)} left the guild. (${guild.memberCount} members)`)
})

async function onMessageDelete (message) {
  if (isInvalidMessage(message)) {
    return
  }

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
  const extraMessage = auditEntry && auditEntry.executor.tag && auditEntry.extra.channel.name === message.channel.name ? ` by **${auditEntry.executor.tag}**` : ''

  const messageDetail = buildMessageDetail(message)
  const attachments = message.attachments.filter(isAttachmentOk).map(a => a)
  const logMessage = await logs.send(withoutMentions(`:wastebasket: ${buildUserDetail(user)}'s message was deleted${extraMessage}.${messageDetail}`, attachments))

  if (!attachments) {
    await logMessage.suppressEmbeds(true)
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
    await logs.send(withoutMentions(`:person_running: ${buildUserDetail(user)}'s roles were updated${extraMessage}. Roles removed: ${roleStr}.`))
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
    await logs.send(withoutMentions(`:person_doing_cartwheel: ${buildUserDetail(user)}'s roles were updated${extraMessage}. Roles added: ${roleStr}.`))
  } else if (oldMember.communicationDisabledUntil !== newMember.communicationDisabledUntil) {
    const modLogs = guild.channels.cache.find(c => c.name === config.channels.moderationLogs)

    if (!modLogs) {
      return
    }

    const auditEntry = await fetchAuditEntryFor(guild, user, 'MEMBER_UPDATE')

    if (!auditEntry) {
      return
    }

    const timeoutMessage = newMember.communicationDisabledUntil
      ? `was timed out until **<t:${Math.floor(newMember.communicationDisabledUntil.getTime() / 1000)}>**`
      : 'is no longer timed out'

    const executorMessage = auditEntry && auditEntry.executor.tag
      ? ` by **${auditEntry.executor.tag}**`
      : ''

    const reasonMessage = auditEntry && auditEntry.reason
      ? `\n**Reason:** ${auditEntry.reason}`
      : ''

    await modLogs.send(withoutMentions(`:timer: ${buildUserDetail(user)} ${timeoutMessage}${executorMessage}.${reasonMessage}`))
  }
})

client.on('warn', log.warn)
client.on('error', log.error)
client.login(config.discordToken.toString())
  .then(token => log.info('Successfully authenticated with token', token))
  .catch(err => log.error('Failed to authenticate with token', err))
