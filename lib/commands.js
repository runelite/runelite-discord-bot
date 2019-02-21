const fetch = require('node-fetch')
const Discord = require('discord.js')
const config = require('./config')
const { log, createEmbed, sendStream, sendDM } = require('./common')
const { contributors } = require('./contributors')
const db = require('littledb')(config.databases.commands)
const githubUserDb = require('littledb')(config.databases.githubUsers)

const numberMatcher = new RegExp('^\\d+$')

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

function searchMainGithubIssues (value) {
  return fetch(`https://api.github.com/search/issues?q=repo:runelite/runelite+${value}`, {
    headers: {
      Authorization: `token ${config.githubToken}`
    }
  }).then(res => res.json())
}

function addCommentToGithubIssue (id, message) {
  searchMainGithubIssues(id).then(body => {
    if (body.items.length === 0) {
      return
    }

    const commentsURL = body.items[0].comments_url

    if (!commentsURL) {
      return
    }

    return fetch(commentsURL, {
      method: 'POST',
      headers: {
        'Authorization': `token ${config.githubToken}`,
        'User-Agent': 'RuneLite-Bot',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        body: message
      })
    }).catch(e => log.debug(e))
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
        .addField('!ghauth', 'DM the bot this command to link your GitHub account to the bot')
        .addField('!ghwhois <github username>', 'Lookup the Discord name of a GitHub user who has linked their account')

      if (hasPermissions(message.member)) {
        helpEmbed
          .addField('!add <command> <value>', 'Add new custom command')
          .addField('!del <command>', 'Delete custom command')
          .addField('!stream <streamer>', 'Display preview for streamer')
      }

      if (hasAdminPermissions(message.member)) {
        helpEmbed
          .addField('!procadd <name_regex>', 'Adds members matching names to multi-processing queue')
          .addField('!procdel', 'Clears multi-processing queue')
          .addField('!prockick', 'Kicks everyone in multi-processing queue')
          .addField('!procban', 'Bans everyone in multi-processing queue')
          .addField('!ghmsg <issue> <command>', 'Adds the command output as a comment to the issue id')
      }

      if (canExecuteCustomCommand(message)) {
        helpEmbed.addField('Custom commands', '!' + db.ls().sort().join('\n!'))
      }

      message.channel.send({
        embed: helpEmbed
      })

      break
    case 'gh':
      searchMainGithubIssues(value).then(body => {
        if (body.items.length === 0) {
          return
        }

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
      if (!value) {
        return sendDM(message.author, {
          embed: createEmbed()
            .setTitle('GitHub account linking')
            .setDescription(`Please visit https://github.com/login/oauth/authorize?client_id=${config.githubAuth.clientId} and follow the instructions.`)
        })
      }

      // GitHub's OAuth codes are 20 characters long
      if (value.length !== 20) {
        return sendDM(message.author, {
          embed: createEmbed()
            .setTitle('GitHub account linking')
            .setDescription('The supplied token is invalid.')
            .setColor(0xFF0000)
        })
      }

      return fetch('https://github.com/login/oauth/access_token', {
        method: 'POST',
        body: JSON.stringify({
          client_id: config.githubAuth.clientId,
          client_secret: config.githubAuth.clientSecret,
          code: value
        }),
        headers: {
          'Content-Type': 'application/json'
        }
      }).then(res => res.text())
        .then(body => fetch(`https://api.github.com/user?${body}`))
        .then(res => res.json())
        .then(body => {
          if (body.id) {
            const authedDiscordUserId = githubUserDb.get(body.id)

            // Don't allow linking a GitHub account to many Discord accounts
            if (authedDiscordUserId && authedDiscordUserId !== message.author.id) {
              return sendDM(message.author, {
                embed: createEmbed()
                  .setTitle('GitHub account linking')
                  .setDescription('Your GitHub account is already linked to a Discord user.')
                  .setColor(0xFF0000)
              })
            }

            message.client.guilds.forEach(g => g
              .fetchMember(message.author)
              .then(m => {
                // Add the authed role to user
                const role = g.roles.find(r => r.name.toLowerCase() === config.githubAuth.authedRole.toLowerCase())
                m.addRole(role).catch(e => log.debug(e))

                // Add the 'contributed' role to user if they have contributed
                if (contributors[body.id]) {
                  const role = g.roles.find(r => r.name.toLowerCase() === config.githubAuth.contributedRole.toLowerCase())
                  m.addRole(role).catch(e => log.debug(e))
                }
              })
              .catch(e => log.debug(e)))

            // Save connection between GitHub user id and Discord user id
            githubUserDb.put(body.id, message.author.id)

            return sendDM(message.author, {
              embed: createEmbed()
                .setTitle('GitHub account linking')
                .setDescription('You have successfully linked your GitHub account with the bot.')
                .setColor(0x00FF00)
            })
          }

          return sendDM(message.author, {
            embed: createEmbed()
              .setTitle('GitHub account linking')
              .setDescription('The supplied token expired.')
              .setColor(0xFF0000)
          })
        })
    }
    case 'ghwhois': {
      if (!value) {
        return
      }

      const members = message.mentions.members
      const mention = members && members.first()

      if (mention) {
        let ghId
        for (let key of githubUserDb.ls()) {
          const value = githubUserDb.get(key)

          if (value && value.toString() === mention.user.id.toString()) {
            ghId = key
            break
          }
        }

        if (ghId) {
          return fetch(`https://api.github.com/user/${ghId}`, {
            headers: {
              Authorization: `token ${config.githubToken}`
            }
          }).then(res => res.json())
            .then(body => {
              let description

              if (body.id) {
                description = `${value}'s GitHub name is: ${body.login} (${body.name})`
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
        }
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
    case 'ghmsg': {
      if (args.length < 2) {
        return
      }

      const id = args[0]
      const cmd = args[1]

      // ID must be a number
      if (!id.match(numberMatcher)) {
        return
      }

      const value = db.get(cmd)
      // Only works with custom commands
      if (!value) {
        return
      }

      if (!hasAdminPermissions(message.member)) {
        return noPermissions(message)
      }

      return addCommentToGithubIssue(id, value)
    }
    default: {
      const value = db.get(command)

      if (!value) {
        return
      }

      if (!canExecuteCustomCommand(message)) {
        return noPermissions(message)
      }

      message.channel.send(value)
    }
  }
}
