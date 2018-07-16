const fetch = require('node-fetch')
const logdriver = require('log-driver')
const Discord = require('discord.js')
const level = require('level')
const config = require('./config')
const db = level(config.databasePath)
const logger = logdriver({level: config.logLevel})

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
          embed: new Discord.RichEmbed()
            .setTitle('Commands')
            .setDescription('You can view all available commands below')
            .addField('!help', 'Display this message')
            .addField('!gh <query>', 'Search runelite/runelite GitHub for issues and pull requests')
            .addField('!add <command> <value>', 'Add new custom command')
            .addField('!del <command>', 'Delete custom command')
            .addField('Custom commands', custom || 'none')
            .setThumbnail(config.logoUrl)
            .setColor(0xec644b)
            .setFooter('RuneLite Bot', config.logoUrl)
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

          const embed = new Discord.RichEmbed()
            .setTitle(`#${item.number} ${item.title}`)
            .setAuthor(item.user.login)
            .setURL(item.html_url)
            .setDescription(description)
            .setThumbnail(item.user.avatar_url)
            .setColor(0xec644b)
            .setFooter('RuneLite Bot', config.logoUrl)

          return message.channel.send({embed})
        }).catch(e => logger.debug(e))

      break
    case 'add':
      if (!hasPermissions(message.member)) {
        return
      }

      const subCommand = args.shift().toLowerCase()
      const subValue = args.join(' ')
      db.put(subCommand, subValue, (err) => {
        if (err) {
          return logger.debug(err)
        }

        const embed = new Discord.RichEmbed()
          .setTitle('Successfully added command')
          .addField(subCommand, subValue)
          .setThumbnail(config.logoUrl)
          .setColor(0x00FF00)
          .setFooter('RuneLite Bot', config.logoUrl)

        message.channel.send({embed})
      })

      break
    case 'del':
      if (!hasPermissions(message.member)) {
        return
      }

      db.del(value, (err) => {
        if (err) {
          return logger.debug(err)
        }

        const embed = new Discord.RichEmbed()
          .setTitle('Successfully deleted command')
          .setDescription(value)
          .setThumbnail(config.logoUrl)
          .setColor(0xFF0000)
          .setFooter('RuneLite Bot', config.logoUrl)

        message.channel.send({embed})
      })

      break
    default: {
      db.get(command, (err, value) => {
        if (err) {
          return logger.debug(err)
        }

        message.channel.send(value)
      })
    }
  }
}
