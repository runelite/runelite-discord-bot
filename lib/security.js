const Discord = require('discord.js')
const config = require('./config')
const { log, createEmbed, sendDM } = require('./common')

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

function messageFilter (message) {
  // if (hasPermissions(message.member)) {
  //   return false
  // }

  if (message.attachments.size > 0) {
    if (!(message.attachments.size === message.attachments.filter(a => {
      const isImage = a.width > 0 && a.height > 0
      const isText = a.url.endsWith('.txt') || a.url.endsWith('.log')
      return isImage || isText
    }).size)) {
      return 'Filtered attachment type'
    }
  }

  const messageContent = message.content.toLowerCase()
  const filteredWord =
    config.spam.filteredWords.find(w => messageContent.includes(w)) ||
    config.spam.filteredSwearWords.find(w => messageContent.match(new RegExp(`\\b${w}\\b`, 'g')))

  if (filteredWord) {
    return 'Filtered word: ' + filteredWord
  }

  return false
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
  assignRole
}
