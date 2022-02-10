import config from './config.js'
import { buildUserDetail, sendDM } from './security.js'

async function processMessage (message, guild) {
  const member = guild.members.cache.find(m => m.id === message.author.id)

  if (!member) {
    return
  }

  const content = message.content

  const matcher = /^[!/][\w\d]/i
  if (matcher.test(content)) {
    return sendDM(member, `\`${content}\` cannot be processed, server commands are disabled in DMs.`)
  }

  const modMailChannel = guild.channels.cache.find(c => c.name === config.channels.modMail)

  if (!modMailChannel) {
    return
  }

  const threadId = message.author.id

  let thread = modMailChannel.threads.cache.find(t => t.name === threadId)

  if (!thread) {
    thread = await modMailChannel.threads.create({
      name: threadId,
      autoArchiveDuration: 60,
      reason: message.author.username + '#' + message.author.discriminator,
      startMessage: await modMailChannel.send(buildUserDetail(message.author))
    })

    await sendDM(member, `Support thread with ID **${thread.name}** was created, please wait until some moderator gets back to you. Mod mail is only for questions and support related to Discord, for client help use #support channel.`)
  }

  await thread.send({
    content: buildUserDetail(message.author, false) + ': ' + content,
    files: message.attachments.map(a => a)
  })
}

function processModMail (message, guilds) {
  guilds.cache.forEach(guild => processMessage(message, guild))
}

function processModMailReply (message) {
  if (!message.channel.parentId) {
    return
  }

  const channel = message.guild.channels.cache.find(c => c.id === message.channel.parentId)

  if (!channel) {
    return
  }

  if (channel.name !== config.channels.modMail) {
    return
  }

  const member = message.guild.members.cache.find(m => m.id === message.channel.name)

  if (!member) {
    return
  }

  return sendDM(member, {
    content: buildUserDetail(message.author, false) + ': ' + message.content,
    files: message.attachments.map(a => a)
  })
}

export {
  processModMail,
  processModMailReply
}
