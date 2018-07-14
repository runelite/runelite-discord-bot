const fs = require('fs')
const fetch = require('node-fetch')
const Discord = require('discord.js')
const level = require('level')
const config = require('./config')

if (!fs.existsSync(config.databasePath)) {
  fs.mkdirSync(config.databasePath)
}

const commands = level('./db/commands')
const roles = level('./db/roles')

function hasPermissions (member) {
  return new Promise((resolve, reject) => {
    let found = false

    roles.createValueStream()
      .on('data', data => {
        if (!found) {
          found = member.roles.has(data) || member.roles.some(r => r.hasPermission(Discord.Permissions.FLAGS.ADMINISTRATOR))
        }
      })
      .on('end', () => {
        if (found) {
          resolve(found)
        } else {
          reject(new Error('No permissions'))
        }
      })
  })
}

module.exports = (message, command, args) => {
  const value = args.join(' ')

  switch (command) {
    case 'help':
      let custom = ''

      commands.createKeyStream()
        .on('data', data => {
          custom += '!' + data + '\n'
        })
        .on('end', () => message.channel.send({
          embed: new Discord.RichEmbed()
            .setTitle('RuneLite bot help')
            .setDescription('All RuneLite Discord bot commands')
            .setThumbnail(config.logoUrl)
            .addField('!help', 'Display this message')
            .addField('!gh <query>', 'Search runelite/runelite GitHub for issues and pull requests')
            .addField('!add <command> <value>', 'Add new custom command')
            .addField('!del <command>', 'Delete custom command')
            .addField('!addrole <role_name>', 'Add role that will be able to manage bot')
            .addField('!delrole <role_name>', 'Remove role from list of roles that can manage bot')
            .addField('Custom commands', custom)
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
            .setThumbnail(item.user.avatar_url)
            .setDescription(description)
            .setColor(0x00FFFF)

          message.channel.send({embed})
        }).catch(e => console.debug(e))

      break
    case 'add':
      hasPermissions(message.member).then(() => {
        const subCommand = args.shift().toLowerCase()
        commands.put(subCommand, args.join(' '), (err) => {
          if (err) {
            return console.debug(err)
          }

          const embed = new Discord.RichEmbed()
            .setTitle('Successfully added command')
            .setDescription(subCommand)
            .setThumbnail(config.logoUrl)
            .setColor(0x00FF00)

          message.channel.send({embed})
        })
      }).catch(e => console.debug(e))

      break
    case 'del':
      hasPermissions(message.member).then(() => {
        commands.del(value, (err) => {
          if (err) {
            return console.debug(err)
          }

          const embed = new Discord.RichEmbed()
            .setTitle('Successfully deleted command')
            .setDescription(value)
            .setThumbnail(config.logoUrl)
            .setColor(0xFF0000)

          message.channel.send({embed})
        })
      }).catch(e => console.debug(e))

      break
    case 'addrole':
      hasPermissions(message.member).then(() => {
        roles.put(value, message.guild.roles.find('name', value).id, (err) => {
          if (err) {
            return console.debug(err)
          }

          const embed = new Discord.RichEmbed()
            .setTitle('Successfully added role')
            .setDescription(value)
            .setThumbnail(config.logoUrl)
            .setColor(0x00FF00)

          message.channel.send({embed})
        })
      }).catch(e => console.debug(e))

      break
    case 'delrole':
      hasPermissions(message.member).then(() => {
        roles.del(value, (err) => {
          if (err) {
            return console.debug(err)
          }

          const embed = new Discord.RichEmbed()
            .setTitle('Successfully deleted role')
            .setDescription(value)
            .setThumbnail(config.logoUrl)
            .setColor(0xFF0000)

          message.channel.send({embed})
        })
      }).catch(e => console.debug(e))

      break
    default: {
      commands.get(command, (err, value) => {
        if (err) {
          return console.debug(err)
        }

        const embed = new Discord.RichEmbed()
          .setTitle(command)
          .setDescription(value)
          .setThumbnail(config.logoUrl)

        message.channel.send({embed})
      })
    }
  }
}
