import path from 'path'
import Discord from 'discord.js'
import config from './config.js'
import { limitStrTo, log } from './common.js'
import { filteredWordsDb, roleDb } from './db.js'

let messageCache = []
const recentlyDeletedMessages = new Map()
const lastMessageDeletions = new Map()
const pendingDeletions = new Map()

function hasPermissions (member) {
  return member && member.permissions.has(Discord.Permissions.FLAGS.MANAGE_MESSAGES)
}

function sendDM (user, message) {
  return user.createDM().then(channel => channel.send(message))
}

function withoutMentions (message, files = []) {
  return {
    content: message,
    allowedMentions: {
      parse: []
    },
    files
  }
}

function initFilters () {
  log.info('Filling filtered words database with default data.')
  config.spam.defaultFilter.forEach(w => filteredWordsDb.put(w, true))
}

function deleteMessage (message) {
  const now = Date.now()
  const recentlyDeleted = hasRecentlyDeletedMessage(message.author.id)

  recentlyDeletedMessages.set(message.id, now)
  lastMessageDeletions.set(message.author.id, now)

  let pending = pendingDeletions.get(message.channel.id)
  if (pending === undefined) {
    pending = [message]
    pendingDeletions.set(message.channel.id, pending)
    async function cleanup () {
      for (;pending.length > 0;) {
        let todo = pending.splice(0, pending.length)
        // Remove duplicate messages
        todo = todo.filter((v, i, a) => a.findIndex(t => (t.id === v.id)) === i)

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

  return recentlyDeleted
}

function isOurDeletion (messageID) {
  return !!recentlyDeletedMessages.get(messageID)
}

function hasRecentlyDeletedMessage (authorID) {
  return !!lastMessageDeletions.get(authorID)
}

function pruneDeletedMessages () {
  const oldest = Date.now() - 10_000
  for (const [id, time] of recentlyDeletedMessages) {
    if (time < oldest) {
      recentlyDeletedMessages.delete(id)
    }
  }

  for (const [id, time] of lastMessageDeletions) {
    if (time < oldest) {
      lastMessageDeletions.delete(id)
    }
  }
}

function deleteMessages (messages, client) {
  if (!messages) {
    return false
  }

  const recentlyDeleted = hasRecentlyDeletedMessage(messages[0].authorID)

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

  return recentlyDeleted
}

function buildUserDetail (user, withMention = true) {
  let out = `**${user.username}#${user.discriminator}**`

  if (withMention) {
    out = `[ <@${user.id}> \`${user.id}\` ] ${out}`
  }

  return out
}

function buildMessageDetail (message) {
  let messageDetail = ''

  const channel = message.channel
  if (channel) {
    messageDetail += `\n**Channel:** ${channel.toString()}`
  }

  const messageAttachments = message.attachments.map(a => a.name)
  if (messageAttachments.length > 0) {
    messageDetail += `\n**Attachments:** ${messageAttachments.join(', ')}`
  }

  const messageContent = message.cleanContent
  if (messageContent) {
    messageDetail += `\n**Message:** ${limitStrTo(messageContent, 300)}`
  }

  return messageDetail
}

function processFilters (message, client, isEdit = false) {
  try {
    const filteredResult = messageFilter(message, client, isEdit)

    if (!filteredResult) {
      return true
    }

    if (!filteredResult.log) {
      return false
    }

    const logs = message.guild.channels.cache.find(c => c.name === config.channels.moderationLogs)

    if (!logs) {
      return false
    }

    const messageDetail = `message was filtered.\n**Reason:** ${filteredResult.reason}.` + buildMessageDetail(message)
    const dmMessageDetail = filteredResult.dmReason
      ? `message was filtered.\n**Reason:** ${filteredResult.reason}.` + buildMessageDetail(message)
      : messageDetail

    const attachments = message.attachments.filter(isAttachmentOk).map(a => a)

    logs.send(withoutMentions(`${buildUserDetail(message.author)}'s ${messageDetail}`, attachments))
      .then((m) => !attachments ? m.suppressEmbeds(true) : Promise.resolve())
      .then(() => filteredResult.dm && sendDM(message.author, `Your ${dmMessageDetail}`))
      .catch(log.debug)
  } catch (e) {
    log.debug(e)
  }

  return false
}

function filterResponse (reason, recentlyDeletedMessage, dm = false, dmReason = '') {
  return { reason, log: !recentlyDeletedMessage, dm, dmReason }
}

function messageContentFilter (messageContent) {
  return filteredWordsDb.ls().find(w => messageContent.match(new RegExp(w, 'g')))
}

function messageFilter (message, client, isEdit) {
  if (hasPermissions(message.member)) {
    return false
  }

  if (message.attachments.size > 0) {
    if (!(message.attachments.size === message.attachments.filter(isAttachmentOk).size)) {
      return filterResponse(':paperclip: Filtered attachment', deleteMessage(message), true)
    }
  }

  const currentMessage = {
    messageID: message.id,
    guildID: message.guild.id,
    authorID: message.author.id,
    channelID: message.channel.id,
    content: message.cleanContent.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''),
    sentTimestamp: message.createdTimestamp
  }

  if (isEdit) {
    const oldMessage = messageCache.find(m => m.messageID === currentMessage.messageID)

    if (oldMessage) {
      oldMessage.content = currentMessage.content
    }
  } else {
    messageCache.push(currentMessage)
  }

  const cachedMessages = messageCache.filter((m) => m.authorID === message.author.id && m.guildID === message.guild.id)
  const duplicateMatches = cachedMessages.filter((m) => m.content !== '' && m.content === message.content && (m.sentTimestamp > (currentMessage.sentTimestamp - config.spam.maxDuplicatesInterval)))
  const bannedWordMatches = cachedMessages.filter((m) => (m.sentTimestamp > (currentMessage.sentTimestamp - config.spam.maxBannedWordsInterval)) && messageContentFilter(m.content))

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

  if (bannedWordMatches.length >= config.spam.kickThreshold) {
    const recentlyDeleted = deleteMessages(bannedWordMatches, client)
    const reason = `Used ${bannedWordMatches.length} filtered expressions in a row`
    member.kick(reason)
    return filterResponse(`:foot: Kicked. ${reason}`, recentlyDeleted)
  }

  if (bannedWordMatches.length >= config.spam.muteThreshold) {
    const recentlyDeleted = deleteMessages(bannedWordMatches, client)
    assignRole(member, message.guild.roles, config.roles.muted)
    return filterResponse(`:mute: Muted. Used ${bannedWordMatches.length} filtered expressions in a row`, recentlyDeleted)
  }

  if (bannedWordMatches.length >= config.spam.banThreshold) {
    const recentlyDeleted = deleteMessages(bannedWordMatches, client)
    const reason = `Used ${bannedWordMatches.length} filtered expressions in a row`
    member.ban(reason)
    return filterResponse(`:hammer: Banned. ${reason}`, recentlyDeleted)
  }

  const filteredWord = messageContentFilter(currentMessage.content)

  if (filteredWord) {
    return filterResponse(`:speak_no_evil: Filtered expression: \`${filteredWord}\``, deleteMessage(message), true, ':speak_no_evil: Filtered expression')
  }

  if (isEdit) {
    return false
  }

  if (spamMatches.length >= config.spam.kickThreshold) {
    const recentlyDeleted = deleteMessages(spamMatches, client)
    const reason = `Spammed ${spamMatches.length} messages in a row`
    member.kick(reason)
    return filterResponse(`:foot: Kicked. ${reason}`, recentlyDeleted)
  }

  if (spamMatches.length >= config.spam.muteThreshold) {
    const recentlyDeleted = deleteMessages(spamMatches, client)
    assignRole(member, message.guild.roles, config.roles.muted)
    return filterResponse(`:mute: Muted. Spammed ${spamMatches.length} messages in a row`, recentlyDeleted)
  }

  if (spamMatches.length >= config.spam.banThreshold) {
    const recentlyDeleted = deleteMessages(spamMatches, client)
    const reason = `Spammed ${spamMatches.length} messages in a row`
    member.ban(reason)
    return filterResponse(`:hammer: Banned. ${reason}`, recentlyDeleted)
  }

  if (duplicateMatches.length >= config.spam.kickThreshold) {
    const recentlyDeleted = deleteMessages([...duplicateMatches, ...spamOtherDuplicates], client)
    const reason = `Spammed ${duplicateMatches.length} same messages in a row`
    member.kick(reason)
    return filterResponse(`:foot: Kicked. ${reason}`, recentlyDeleted)
  }

  if (duplicateMatches.length >= config.spam.muteThreshold) {
    const recentlyDeleted = deleteMessages([...duplicateMatches, ...spamOtherDuplicates], client)
    assignRole(member, message.guild.roles, config.roles.muted)
    return filterResponse(`:mute: Muted. Spammed ${duplicateMatches.length} same messages in a row`, recentlyDeleted)
  }

  if (duplicateMatches.length >= config.spam.banThreshold) {
    const recentlyDeleted = deleteMessages([...duplicateMatches, ...spamOtherDuplicates], client)
    const reason = `Spammed ${duplicateMatches.length} same messages in a row`
    member.ban(reason)
    return filterResponse(`:hammer: Banned. ${reason}`, recentlyDeleted)
  }

  return false
}

function isAttachmentOk (a) {
  const isImage = a.width > 0 && a.height > 0
  const url = a.url.toLowerCase()
  const ext = path.extname(url)
  return isImage || config.spam.allowedExtensions.includes(ext)
}

function resetMessageCache () {
  messageCache = []
  return Promise.resolve()
}

async function ensureRoles (member, allRoles) {
  const roles = roleDb.get(member.id)

  if (roles) {
    for (const role of roles) {
      await assignRole(member, allRoles, role)
    }
  }
}

async function assignRole (member, allRoles, roleToGive) {
  const roleName = roleToGive.toLowerCase()
  const hasRole = member.roles.cache.find(r => r.name.toLowerCase() === roleName)

  if (hasRole) {
    return `Cannot assign role ${roleToGive} to user ${member.toString()}, user already has the role.`
  }

  const isBadAndTargetGood = config.roles.roleAssignmentBad.includes(roleToGive) &&
    member.roles.cache.find(r => config.roles.roleAssignmentGood.includes(r.name.toLowerCase()))

  if (isBadAndTargetGood) {
    return `Cannot assign role ${roleToGive} to user ${member.toString()} because user has good role.`
  }

  const isNotBadAndTargetBad = !config.roles.roleAssignmentBad.includes(roleToGive) &&
    member.roles.cache.find(r => config.roles.roleAssignmentBad.includes(r.name.toLowerCase()))

  if (isNotBadAndTargetBad) {
    return `Cannot assign role ${roleToGive} to user ${member.toString()} because user has bad role.`
  }

  const role = allRoles.cache.find(r => r.name.toLowerCase() === roleName)
  if (role) {
    log.debug(`Assigning '${roleToGive}' role to user ${member.user.username}`)

    try {
      await member.roles.add(role)
      return ''
    } catch (e) {
      return `Cannot assign role ${roleToGive} to user ${member.toString()}, error: ${e.toString()}`
    }
  }

  return `Cannot assign role ${roleToGive} to user ${member.toString()}, role not found.`
}

async function removeRole (member, allRoles, roleToRemove) {
  const roleName = roleToRemove.toLowerCase()
  const foundRole = member.roles.cache.find(r => r.name.toLowerCase() === roleName)

  if (!foundRole) {
    return `Cannot remove role ${roleToRemove} from user ${member.toString()}, user already has the role.`
  }

  const role = allRoles.cache.find(r => r.name.toLowerCase() === roleName)
  if (role) {
    log.debug(`Removing '${roleToRemove}' role from user ${member.user.username}`)

    try {
      await member.roles.remove(role)
      return ''
    } catch (e) {
      return `Cannot remove role ${roleToRemove} from user ${member.toString()}, error: ${e.toString()}`
    }
  }

  return `Cannot remove role ${roleToRemove} from user ${member.toString()}, role not found.`
}

export {
  sendDM,
  withoutMentions,
  initFilters,
  hasPermissions,
  processFilters,
  resetMessageCache,
  assignRole,
  removeRole,
  ensureRoles,
  buildUserDetail,
  buildMessageDetail,
  isOurDeletion,
  pruneDeletedMessages,
  isAttachmentOk
}
