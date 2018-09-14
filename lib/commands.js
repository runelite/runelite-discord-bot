const fetch = require('node-fetch')
const Discord = require('discord.js')
const config = require('./config')
const { log, createEmbed, sendStream } = require('./common')
const db = require('littledb')(config.databasePath)

function hasPermissions (member) {
  return member && member.hasPermission(Discord.Permissions.FLAGS.MANAGE_MESSAGES)
}

function noPermissions (message) {
  const errorMessage = message.member
    ? 'You do not have enough permissions to run this command'
    : 'You need to be in guild channel for this command to work'

  return message.channel.send({
    embed: createEmbed()
      .setTitle('Failed to execute command')
      .setDescription(errorMessage)
      .setColor(0xFF0000)
  })
}

let membersToProcess = []

module.exports = (message, command, args) => {
  const value = args.join(' ')

  switch (command) {
    case 'help':
      const helpEmbed = createEmbed()
        .setTitle('Commands')
        .setDescription('You can view all available commands below')
        .addField('!help', 'Display this message')
        .addField('!gh <query>', 'Search runelite/runelite GitHub for issues and pull requests')

      if (hasPermissions(message.member)) {
        helpEmbed
          .addField('!add <command> <value>', 'Add new custom command')
          .addField('!del <command>', 'Delete custom command')
          .addField('!stream <streamer>', 'Display preview for streamer')
      }

      helpEmbed.addField('Custom commands', '!' + db.ls().sort().join('\n!'))

      message.channel.send({
        embed: helpEmbed
      })

      break
    case 'gh':
      fetch(`https://api.github.com/search/issues?q=repo:runelite/runelite+${value}`, {
        headers: {
          Authorization: `token ${config.githubToken}`
        }
      })
        .then(res => res.json())
        .then(body => {
          const item = body.items[0]
          const description = item.body.length < 500
            ? item.body
            : item.body.substring(0, 500) + '...'

          const embed = createEmbed()
            .setTitle(`#${item.number} ${item.title}`)
            .setAuthor(item.user.login)
            .setURL(item.html_url)
            .setDescription(description)
            .setThumbnail(item.user.avatar_url)

          return message.channel.send({ embed })
        }).catch(e => log.debug(e))

      break
    case 'add':
      const subCommandVal = args.shift()
      if (!subCommandVal) {
        return
      }

      const subCommand = subCommandVal.toLowerCase()
      const subValue = args.join(' ')

      if (!subValue) {
        return
      }

      if (!hasPermissions(message.member)) {
        return noPermissions(message)
      }

      message.channel.send({
        embed: createEmbed()
          .setTitle('Successfully added command')
          .addField(subCommand, db.put(subCommand, subValue))
          .setColor(0x00FF00)
      })

      break
    case 'del':
      if (!value) {
        return
      }

      if (!hasPermissions(message.member)) {
        return noPermissions(message)
      }

      db.put(value)
      message.channel.send({
        embed: createEmbed()
          .setTitle('Successfully deleted command')
          .setDescription(value)
          .setColor(0xFF0000)
      })

      break
    case 'stream':
      if (!value) {
        return
      }

      if (!hasPermissions(message.member)) {
        return noPermissions(message)
      }

      sendStream(message.channel, message.member, value)
      break
    case 'procadd': {
      if (!value) {
        return
      }

      if (!hasPermissions(message.member)) {
        return noPermissions(message)
      }

      const members = message.guild.members.filter(m => m && m.user.username && m.user.username.match(value))
      const array = members.array()
      membersToProcess = membersToProcess.concat(array)

      message.channel.send({
        embed: createEmbed()
          .setTitle('Added more people to processing list')
          .addField('regex', value)
          .addField('matches', array.length)
          .addField('total', membersToProcess.length)
          .setColor(0xFF0000)
      })

      break
    }
    case 'procdel': {
      if (!hasPermissions(message.member)) {
        return noPermissions(message)
      }

      membersToProcess = []
      message.channel.send({
        embed: createEmbed()
          .setTitle('Cleared processing list')
          .setColor(0xFF0000)
      })

      break
    }
    case 'prockick': {
      if (!hasPermissions(message.member) || membersToProcess.length >= 1000) {
        return noPermissions(message)
      }

      message.channel.send({
        embed: createEmbed()
          .setTitle('Kicking a lot of people!')
          .addField('matches', membersToProcess.length)
          .setColor(0xFF0000)
      })

      membersToProcess.forEach(m => m.kick())
      membersToProcess = []
      break
    }
    case 'procban': {
      if (!hasPermissions(message.member) || membersToProcess.length >= 1000) {
        return noPermissions(message)
      }

      message.channel.send({
        embed: createEmbed()
          .setTitle('Banning a lot of people!')
          .addField('matches', membersToProcess.length)
          .setColor(0xFF0000)
      })

      membersToProcess.forEach(m => m.ban())
      membersToProcess = []
      break
    }
    default: {
      const value = db.get(command)

      if (value) {
        message.channel.send(value)
      }
    }
  }
}
