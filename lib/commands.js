const fetch = require('node-fetch')
const Discord = require('discord.js')
const level = require('level')
const config = require('./config')
const {log, createEmbed} = require('./common')
const db = level(config.databasePath)

function hasPermissions (member) {
  return member.hasPermission(Discord.Permissions.FLAGS.MANAGE_MESSAGES)
}

module.exports = (message, command, args) => {
  const value = args.join(' ')

  switch (command) {
    case 'help':
      let custom = ''

      db.createKeyStream()
        .on('data', data => {
          custom += '!' + data + '\n'
        })
        .on('end', () => message.channel.send({
          embed: createEmbed()
            .setTitle('Commands')
            .setDescription('You can view all available commands below')
            .addField('!help', 'Display this message')
            .addField('!gh <query>', 'Search runelite/runelite GitHub for issues and pull requests')
            .addField('!add <command> <value>', 'Add new custom command')
            .addField('!del <command>', 'Delete custom command')
            .addField('Custom commands', custom || 'none')
        }))

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

          return message.channel.send({embed})
        }).catch(e => log.debug(e))

      break
    case 'add':
      if (!hasPermissions(message.member)) {
        return
      }

      const subCommand = args.shift().toLowerCase()
      const subValue = args.join(' ')
      db.put(subCommand, subValue, (err) => {
        if (err) {
          return log.debug(err)
        }

        const embed = createEmbed()
          .setTitle('Successfully added command')
          .addField(subCommand, subValue)
          .setColor(0x00FF00)

        message.channel.send({embed})
      })

      break
    case 'del':
      if (!hasPermissions(message.member)) {
        return
      }

      db.del(value, (err) => {
        if (err) {
          return log.debug(err)
        }

        const embed = createEmbed()
          .setTitle('Successfully deleted command')
          .setDescription(value)
          .setColor(0xFF0000)

        message.channel.send({embed})
      })

      break
    default: {
      db.get(command, (err, value) => {
        if (err) {
          return log.debug(err)
        }

        message.channel.send(value)
      })
    }
  }
}
