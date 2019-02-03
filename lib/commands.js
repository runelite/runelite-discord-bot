const fetch = require('node-fetch')
const Discord = require('discord.js')
const config = require('./config')
const { log, createEmbed, sendStream, unixSeconds } = require('./common')
const { contributors } = require('./contributors')
const db = require('littledb')(config.databases.commands)
const githubUserDb = require('littledb')(config.databases.githubUsers)

function canExecuteCustomCommand (message) {
  return hasPermissions(message.member) || (message.channel && !config.noCustomCommandsChannels.includes(message.channel.name))
}

function hasPermissions (member) {
  return member && member.hasPermission(Discord.Permissions.FLAGS.MANAGE_MESSAGES)
}

function hasAdminPermissions (member) {
  return member && member.hasPermission(Discord.Permissions.FLAGS.MANAGE_GUILD)
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

let cooldowns = []

function cooldown (user, command, seconds) {
  if (!cooldowns[user]) {
    cooldowns[user] = []
  }
  cooldowns[user][command] = unixSeconds() + seconds
}

function isOnCooldown (user, command) {
  const userCooldowns = cooldowns[user]
  if (!cooldowns[user]) {
    return 0
  }
  const targetTime = userCooldowns[command]
  if (!targetTime) {
    return 0
  }
  const diff = targetTime - unixSeconds()
  if (diff > 0) {
    return diff
  }
  delete cooldowns[user][command]
  if (!cooldowns[user].length) {
    delete cooldowns[user]
  }
}

let membersToProcess = []

module.exports = (message, command, args) => {
  const value = args.join(' ')

  const cooldownLeft = isOnCooldown(message.author, command)
  if (cooldownLeft) {
    const embed = createEmbed()
      .setTitle('Cooldown')
      .setDescription(`You must wait ${cooldownLeft} seconds before using that command again.`)
    message.channel
      .send({ embed })
      .then(m => m.delete(Math.min(Math.max(cooldownLeft, 3), 10) * 1000)) // Delete embed after 3-10 seconds, depending on time left
      .catch(e => log.debug(e))
    return
  }

  switch (command) {
    case 'help':
      const helpEmbed = createEmbed()
        .setTitle('Commands')
        .setDescription('You can view all available commands below')
        .addField('!help', 'Display this message')
        .addField('!gh <query>', 'Search runelite/runelite GitHub for issues and pull requests')
        .addField('!ghauth', 'DM the bot this command to link your GitHub account to the bot')
        .addField('!ghwhois <github username>', 'Lookup the Discord name of a GitHub user who has linked their account')

      if (hasPermissions(message.member)) {
        helpEmbed
          .addField('!add <command> <value>', 'Add new custom command')
          .addField('!del <command>', 'Delete custom command')
          .addField('!stream <streamer>', 'Display preview for streamer')
      }

      if (canExecuteCustomCommand(message)) {
        helpEmbed.addField('Custom commands', '!' + db.ls().sort().join('\n!'))
      }

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

      if (!hasAdminPermissions(message.member)) {
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
      if (!hasAdminPermissions(message.member)) {
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
      if (!hasAdminPermissions(message.member) || membersToProcess.length >= 1000) {
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
      if (!hasAdminPermissions(message.member) || membersToProcess.length >= 1000) {
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
    case 'ghauth': {
      message.author
        .createDM()
        .then(channel => {
          if (!value) {
            return channel.send({
              embed: createEmbed()
                .setTitle('GitHub account linking')
                .setDescription(`Please visit https://github.com/login/oauth/authorize?client_id=${config.githubAuth.clientId} and follow the instructions.`)
            })
          } else if (value.length === 20) { // GitHub's OAuth codes are 20 characters long
            // Prevent spamming of the GitHub API, 10s cooldown
            cooldown(message.author, command, 10)

            return fetch('https://github.com/login/oauth/access_token', {
              method: 'POST',
              body: JSON.stringify({
                client_id: config.githubAuth.clientId,
                client_secret: config.githubAuth.clientSecret,
                code: value
              }),
              headers: { 'Content-Type': 'application/json' }
            }).then(res => res.text())
              .then(body => {
                return fetch(`https://api.github.com/user?${body}`)
              })
              .then(res => res.json())
              .then(body => {
                let description

                if (body.id) {
                  const authedDiscordUserId = githubUserDb.get(body.id)

                  // Don't allow linking a GitHub account to many Discord accounts
                  if (authedDiscordUserId && authedDiscordUserId !== message.author.id) {
                    description = 'Your GitHub account is already authed to a Discord user.'
                  } else {
                    message.client.guilds
                      .array()
                      .forEach(g => {
                        g.fetchMember(message.author)
                          .then(m => {
                            // Add the authed role to user
                            const role = g.roles.find(r => r.name.toLowerCase() === config.githubAuth.authedRole.toLowerCase())
                            m.addRole(role)
                              .catch(e => log.debug(e))

                            // Add the 'contributed' role to user if they have contributed
                            if (contributors[body.id]) {
                              const role = g.roles.find(r => r.name.toLowerCase() === config.githubAuth.contributedRole.toLowerCase())
                              m.addRole(role)
                                .catch(e => log.debug(e))
                            }
                          }).catch(e => log.debug(e))
                      })

                    description = 'You have successfully authed your GitHub account with the bot.'

                    // Save connection between GitHub user id and Discord user id
                    githubUserDb.put(body.id, message.author.id)
                  }
                } else {
                  description = 'The supplied token is invalid.'
                }

                return channel.send({
                  embed: createEmbed()
                    .setTitle('GitHub account linking')
                    .setDescription(description)
                })
              })
          }
        }).catch(e => log.debug(e))
      break
    }
    case 'ghwhois': {
      if (!value || value.includes('/')) {
        return
      }

      if (!hasPermissions(message.member)) {
        // Prevent spamming of the GitHub API, 10s cooldown
        cooldown(message.author, command, 10)
      }

      fetch(`https://api.github.com/users/${value}`, {
        headers: {
          Authorization: `token ${config.githubToken}`
        }
      }).then(res => res.json())
        .then(body => {
          let description

          if (body.id) {
            const discordId = githubUserDb.get(body.id)
            if (discordId) {
              description = `${value}'s Discord name is: <@${discordId}>`
            } else {
              description = `${value} has not connected their Discord account.`
            }
          } else {
            description = `${value} is not a registered GitHub user.`
          }

          return message.channel.send({
            embed: createEmbed()
              .setTitle('GitHub Whois')
              .setDescription(description)
          })
        })
        .catch(e => log.debug(e))

      break
    }
    default: {
      if (!canExecuteCustomCommand(message)) {
        return noPermissions(message)
      }

      const value = db.get(command)

      if (value) {
        message.channel.send(value)
      }
    }
  }
}
