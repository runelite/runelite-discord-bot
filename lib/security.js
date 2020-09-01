const Discord = require('discord.js')
const config = require('./config')
const { log, createEmbed, sendDM, filteredWordsDb } = require('./common')
let messageCache = []

function canExecuteCustomCommand (message) {
  return hasPermissions(message.member) || (message.channel && !config.channels.noCustomCommands.includes(message.channel.name))
}

function hasPermissions (member) {
  return member && member.hasPermission(Discord.Permissions.FLAGS.MANAGE_MESSAGES)
}

function hasAdminPermissions (member) {
  return member && member.hasPermission(Discord.Permissions.FLAGS.MANAGE_GUILD)
}

function noPermissions (message) {
  const errorMessage = message.member
    ? 'You can\'t run this command'
    : 'You need to be in a guild channel for this command to work'

  const place = message.channel && message.member ? ' inside ' + message.channel : ''

  return sendDM(message.author, {
    embed: createEmbed()
      .setTitle('Failed to execute command')
      .setDescription(errorMessage + place)
      .addField('Command', message.content)
      .setColor(0xFF0000)
  }).catch(() => message.channel.send(errorMessage + ' here'))
}

function deleteMessages (messages, client) {
  messages.forEach((message) => {
    const channel = client.channels.get(message.channelID)
    if (channel) {
      const msg = channel.messages.get(message.messageID)
      if (msg && msg.deletable) {
        msg.delete().catch(log.debug)

        const index = messageCache.indexOf(message)

        if (index > -1) {
          messageCache.splice(index, 1)
        }
      }
    }
  })
}

function buildUserDetail (user) {
  return `[<@${user.id}> \`${user.id}\`] **${user.username}#${user.discriminator}**`
}

function buildMessageDetail (message) {
  let messageDetail = ''

  const messageContent = message.cleanContent
  if (messageContent) {
    messageDetail += `\n**Message:** ${messageContent}`
  }

  const messageAttachments = message.attachments.map(a => a.filename)
  if (messageAttachments.length > 0) {
    messageDetail += `\n**Attachments:** ${messageAttachments}`
  }

  const channel = message.channel
  if (channel) {
    messageDetail += `\n**Channel:** ${message.guild.channels.get(channel.id).toString()}`
  }

  return messageDetail
}

function messageFilter (message, client) {
  if (hasPermissions(message.member) || !message.guild) {
    return false
  }

  if (message.attachments.size > 0) {
    if (!(message.attachments.size === message.attachments.filter(a => {
      const isImage = a.width > 0 && a.height > 0
      const isText = a.url.endsWith('.txt') || a.url.endsWith('.log')
      return isImage || isText
    }).size)) {
      return ':paperclip: Filtered attachment type'
    }
  }

  const messageContent = message.content.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  const filteredWord =
    config.spam.filteredWords.find(w => messageContent.includes(w)) ||
    filteredWordsDb.ls().find(w => messageContent.match(new RegExp(w, 'g')))

  if (filteredWord) {
    return `:speak_no_evil: Filtered word: \`${filteredWord}\``
  }

  const currentMessage = {
    messageID: message.id,
    guildID: message.guild.id,
    authorID: message.author.id,
    channelID: message.channel.id,
    content: message.content,
    sentTimestamp: message.createdTimestamp
  }

  messageCache.push(currentMessage)

  const cachedMessages = messageCache.filter((m) => m.authorID === message.author.id && m.guildID === message.guild.id)
  const duplicateMatches = cachedMessages.filter((m) => m.content === message.content && (m.sentTimestamp > (currentMessage.sentTimestamp - config.spam.maxDuplicatesInterval)))

  const spamOtherDuplicates = []
  if (duplicateMatches.length > 0) {
    let rowBroken = false
    cachedMessages.sort((a, b) => b.sentTimestamp - a.sentTimestamp).forEach(element => {
      if (rowBroken) {
        return
      }

      if (element.content !== duplicateMatches[0].content) {
        rowBroken = true
      } else {
        spamOtherDuplicates.push(element)
      }
    })
  }

  const spamMatches = cachedMessages.filter((m) => m.sentTimestamp > (Date.now() - config.spam.maxInterval))
  const member = message.guild.members.get(message.author.id)

  if (spamMatches.length >= config.spam.kickThreshold) {
    deleteMessages(spamMatches, client)
    member.kick()
    return `:foot: Kicked. Spammed ${spamMatches.length} messages in a row`
  }

  if (spamMatches.length >= config.spam.muteThreshold) {
    deleteMessages(spamMatches, client)
    assignRole(member, message.guild.roles, config.roles.muted)
    return `:mute: Muted. Spammed ${spamMatches.length} messages in a row`
  }

  if (spamMatches.length >= config.spam.banThreshold) {
    deleteMessages(spamMatches, client)
    member.ban()
    return `:hammer: Banned. Spammed ${spamMatches.length} messages in a row`
  }

  if (duplicateMatches.length >= config.spam.maxDuplicatesKick) {
    deleteMessages([...duplicateMatches, ...spamOtherDuplicates], client)
    member.kick()
    return `:foot: Kicked. Spammed ${duplicateMatches.length} same messages in a row`
  }

  if (duplicateMatches.length >= config.spam.maxDuplicatesMute) {
    deleteMessages([...duplicateMatches, ...spamOtherDuplicates], client)
    assignRole(member, message.guild.roles, config.roles.muted)
    return `:mute: Muted. Spammed ${duplicateMatches.length} same messages in a row`
  }

  if (duplicateMatches.length >= config.spam.maxDuplicatesBan) {
    deleteMessages([...duplicateMatches, ...spamOtherDuplicates], client)
    member.ban()
    return `:hammer: Banned. Spammed ${duplicateMatches.length} same messages in a row`
  }

  return false
}

function resetMessageCache () {
  messageCache = []
  return Promise.resolve()
}

function assignRole (member, allRoles, roleToGive) {
  const roleName = roleToGive.toLowerCase()
  const foundRole = member.roles.find(r => r.name.toLowerCase() === roleName)
  const hasSkippedRole = member.roles.find(r => config.roles.roleAssignmentIgnore.includes(r.name.toLowerCase()))

  if (!hasSkippedRole && !foundRole) {
    const role = allRoles.find(r => r.name.toLowerCase() === roleName)
    if (role) {
      log.debug(`Assigning '${roleToGive}' role to user ${member.user.username}`)
      return member.addRole(role).catch(e => log.warn(e))
    }
  }
}

module.exports = {
  canExecuteCustomCommand,
  hasPermissions,
  hasAdminPermissions,
  noPermissions,
  messageFilter,
  resetMessageCache,
  assignRole,
  buildUserDetail,
  buildMessageDetail
}
