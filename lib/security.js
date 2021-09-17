import path from 'path'
import Discord from 'discord.js'
import config from './config.js'
import { log } from './common.js'
import { filteredWordsDb } from './db.js'

let messageCache = []

const allowedExtensions = [
  // Text
  '.txt',
  '.log',
  // Audio
  '.aif',
  '.cda',
  '.mid',
  '.midi',
  '.mp3',
  '.mpa',
  '.ogg',
  '.wav',
  '.wma',
  // Video that apparently fails when checked against size
  '.mkv'
]

function hasPermissions (member) {
  return member && member.permissions.has(Discord.Permissions.FLAGS.MANAGE_MESSAGES)
}

function sendDM (author, message) {
  return author.createDM().then(channel => channel.send(message))
}

const recentlyDeletedMessages = new Map()
const lastMessageDeletions = new Map()
const pendingDeletions = new Map()

// returns true if the user has had a deleted message recently
function deleteMessage (message) {
  const now = Date.now()

  recentlyDeletedMessages.set(message.id, now)

  let pending = pendingDeletions.get(message.channel.id)
  if (pending === undefined) {
    pending = [message]
    pendingDeletions.set(message.channel.id, pending)
    async function cleanup () {
      for (;pending.length > 0;) {
        const todo = pending.splice(0, pending.length)
        try {
          if (todo.length === 1) {
            await todo[0].delete()
          } else {
            await message.channel.bulkDelete(todo)
          }
        } catch (e) {
          log.warn(`unable to delete messages ${todo.map(m => m.id)}`, e)
        }
      }
      pendingDeletions.delete(message.channel.id)
    }
    cleanup()
  } else {
    pending.push(message)
  }

  const lastDeletion = lastMessageDeletions.get(message.author.id)
  lastMessageDeletions.set(message.author.id, now)
  return lastDeletion && lastDeletion > now - 10_000
}

function isOurDeletion (messageID) {
  return !!recentlyDeletedMessages.get(messageID)
}

function pruneDeletedMessages () {
  const oldest = Date.now() - 10_000
  for (const [id, time] of recentlyDeletedMessages) {
    if (time < oldest) {
      recentlyDeletedMessages.delete(id)
    }
  }
}

function deleteMessages (messages, client) {
  messages.forEach((message) => {
    const channel = client.channels.cache.get(message.channelID)

    if (channel) {
      const msg = channel.messages.cache.get(message.messageID)
      if (msg && msg.deletable) {
        deleteMessage(msg)

        const index = messageCache.indexOf(message)

        if (index > -1) {
          messageCache.splice(index, 1)
        }
      }
    }
  })
}

function buildUserDetail (user) {
  return `[ <@${user.id}> \`${user.id}\` ] **${user.username}#${user.discriminator}**`
}

function buildMessageDetail (message) {
  let messageDetail = ''

  let messageContent = message.cleanContent
  if (messageContent) {
    messageContent = messageContent.length > 500 ? messageContent.substring(0, 500) + '...' : messageContent
    messageDetail += `\n**Message:** ${messageContent}`
  }

  const messageAttachments = message.attachments.map(a => a.url)
  if (messageAttachments.length > 0) {
    messageDetail += `\n**Attachments:** ${messageAttachments}`
  }

  const channel = message.channel
  if (channel) {
    messageDetail += `\n**Channel:** ${channel.toString()}`
  }

  return messageDetail
}

function proccessFilters (message, client) {
  if (message.author.bot) {
    return false
  }

  const filteredResult = messageFilter(message, client)

  if (!filteredResult) {
    return true
  }

  if (deleteMessage(message)) {
    return false
  }

  const logs = message.guild.channels.cache.find(c => c.name === config.channels.moderationLogs)

  if (!logs) {
    return false
  }

  const messageDetail = `message was filtered.\n**Reason:** ${filteredResult}.` + buildMessageDetail(message)

  logs.send(`${buildUserDetail(message.author)}'s ${messageDetail}`)
    .then(() => sendDM(message.author, `Your ${messageDetail}`))
    .catch(log.debug)

  return false
}

function messageFilter (message, client) {
  if (hasPermissions(message.member) || !message.guild) {
    return false
  }

  const logMsg = spamFilter(message, client)
  if (logMsg) {
    return logMsg
  }

  if (message.attachments.size > 0) {
    if (!(message.attachments.size === message.attachments.filter(a => {
      const isImage = a.width > 0 && a.height > 0
      const url = a.url.toLowerCase()
      const ext = path.extname(url)
      return isImage || allowedExtensions.includes(ext)
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

  return false
}

function spamFilter (message, client) {
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
  const member = message.guild.members.cache.get(message.author.id)

  if (!member) {
    return false
  }

  if (spamMatches.length >= config.spam.kickThreshold) {
    deleteMessages(spamMatches, client)
    const reason = `Spammed ${spamMatches.length} messages in a row`
    member.kick(reason)
    return `:foot: Kicked. ${reason}`
  }

  if (spamMatches.length >= config.spam.muteThreshold) {
    deleteMessages(spamMatches, client)
    assignRole(member, message.guild.roles, config.roles.muted)
    return `:mute: Muted. Spammed ${spamMatches.length} messages in a row`
  }

  if (spamMatches.length >= config.spam.banThreshold) {
    deleteMessages(spamMatches, client)
    const reason = `Spammed ${spamMatches.length} messages in a row`
    member.ban(reason)
    return `:hammer: Banned. ${reason}`
  }

  if (duplicateMatches.length >= config.spam.maxDuplicatesKick) {
    deleteMessages([...duplicateMatches, ...spamOtherDuplicates], client)
    const reason = `Spammed ${duplicateMatches.length} same messages in a row`
    member.kick(reason)
    return `:foot: Kicked. ${reason}`
  }

  if (duplicateMatches.length >= config.spam.maxDuplicatesMute) {
    deleteMessages([...duplicateMatches, ...spamOtherDuplicates], client)
    assignRole(member, message.guild.roles, config.roles.muted)
    return `:mute: Muted. Spammed ${duplicateMatches.length} same messages in a row`
  }

  if (duplicateMatches.length >= config.spam.maxDuplicatesBan) {
    deleteMessages([...duplicateMatches, ...spamOtherDuplicates], client)
    const reason = `Spammed ${duplicateMatches.length} same messages in a row`
    member.ban(reason)
    return `:hammer: Banned. ${reason}`
  }

  return false
}

function resetMessageCache () {
  messageCache = []
  return Promise.resolve()
}

function assignRole (member, allRoles, roleToGive) {
  const roleName = roleToGive.toLowerCase()
  const foundRole = member.roles.cache.find(r => r.name.toLowerCase() === roleName)
  const hasSkippedRole = member.roles.cache.find(r => config.roles.roleAssignmentIgnore.includes(r.name.toLowerCase()))

  if (!hasSkippedRole && !foundRole) {
    const role = allRoles.cache.find(r => r.name.toLowerCase() === roleName)
    if (role) {
      log.debug(`Assigning '${roleToGive}' role to user ${member.user.username}`)
      return member.roles.add(role).catch(e => log.warn(e))
    }
  }
}

function removeRole (member, allRoles, roleToRemove) {
  const roleName = roleToRemove.toLowerCase()
  const foundRole = member.roles.cache.find(r => r.name.toLowerCase() === roleName)

  if (foundRole) {
    const role = allRoles.cache.find(r => r.name.toLowerCase() === roleName)
    if (role) {
      log.debug(`Removing '${roleToRemove}' role from user ${member.user.username}`)
      return member.roles.remove(role).catch(e => log.warn(e))
    }
  }
}

export {
  proccessFilters,
  resetMessageCache,
  assignRole,
  removeRole,
  buildUserDetail,
  buildMessageDetail,
  isOurDeletion,
  pruneDeletedMessages
}
