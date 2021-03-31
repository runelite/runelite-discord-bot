const fetch = require('node-fetch')
const prettyMilliseconds = require('pretty-ms')
const config = require('./config')
const { commandsDb, githubUserDb, filteredWordsDb } = require('./db')
const { log, createEmbed, sendDM, splitToChunks } = require('./common')
const { sendStream } = require('./twitch')
const { blocked } = require('./blocked')
const { buildUserDetail } = require('./security')
const { canExecuteCustomCommand, hasAdminPermissions, hasPermissions, noPermissions, assignRole, removeRole } = require('./security')
const notice = require('./notice')

let membersToProcess = []

module.exports = async (message, command, args) => {
  if (command.length === 0) {
    return
  }

  const value = args.join(' ')

  switch (command) {
    case 'help': {
      const helpEmbed = createEmbed()
        .setTitle('Commands')
        .setDescription('You can view all available commands below')
        .addField('!help', 'Display this message')
        .addField('!info', 'Displays server and bot info')
        .addField('!gh <query>', 'Search runelite/runelite GitHub for issues and pull requests')
        .addField('!ghauth', 'DM the bot this command to link your GitHub account to the bot')
        .addField('!ghwhois <name>', 'Lookup the name of a GitHub/Discord user who has linked their account')
        .addField('!ws <wiki search>', 'Search the Old School RuneScape Wiki')

      if (notice.isEnabled) {
        helpEmbed.addField('!notice', 'Shows the current notice')
      }

      if (hasPermissions(message.member)) {
        helpEmbed
          .addField('!add <command> <value>', 'Add new custom command')
          .addField('!del <command>', 'Delete custom command')
          .addField('!stream <streamer>', 'Display preview for streamer')
          .addField('!filteradd <regex>', 'Add regex filter for words')
          .addField('!filterdel <regex>', 'Remove regex filter for words')
          .addField('!filterls', 'Lists all configured filters for words')
          .addField('!notice <on|off>', 'Enable/Disable the notice spam')
          .addField('!notice <title|description|footer> [string]', 'Edit the notice')
          .addField('!notice timestamp [unix time]', "Edit the footer's timestams")
          .addField('!notice <channelCooldown|userCooldown> <time in seconds>', 'Change spamminess of the notice in seconds')
      }

      if (hasAdminPermissions((message.member))) {
        helpEmbed
          .addField('!procadd <regex>', 'Adds members matching regex to processing queue')
          .addField('!procdel', 'Clears processing queue')
          .addField('!prockick', 'Kicks everyone in processing queue')
          .addField('!procban', 'Bans everyone in processing queue')
      }

      if (canExecuteCustomCommand(message)) {
        const chunks = splitToChunks(commandsDb.ls().sort(), 3)
        let isFirst = true
        for (const chunk of chunks) {
          if (chunk.length > 0) {
            helpEmbed.addField(isFirst ? 'Custom commands' : '\u200b', chunk.map(n => '!' + n), true)
          }
          isFirst = false
        }
      }

      const toSend = {
        embed: helpEmbed
      }

      if (hasPermissions(message.member)) {
        return message.channel.send(toSend)
      } else {
        return sendDM(message.author, toSend).catch(() => noPermissions(message))
      }
    }
    case 'info': {
      if (!message.guild) {
        return noPermissions(message)
      }

      const checkDays = (date) => {
        const now = new Date()
        const diff = now.getTime() - date.getTime()
        const days = Math.floor(diff / 86400000)
        return days + (days === 1 ? ' day' : ' days') + ' ago'
      }

      const infoEmbed = createEmbed()
        .setThumbnail(message.guild.iconURL())
        .addField('Name', message.guild.name, true)
        .addField('ID', message.guild.id, true)
        .addField('Owner', `${message.guild.owner.user.username}#${message.guild.owner.user.discriminator}`, true)
        .addField('Region', message.guild.region, true)
        .addField('Members', message.guild.members.cache.size, true)
        .addField('Verification Level', message.guild.verificationLevel, true)
        .addField('Channels', message.guild.channels.cache.size, true)
        .addField('Roles', message.guild.roles.cache.size, true)
        .addField('Created', `${message.channel.guild.createdAt.toUTCString().substr(0, 16)} (${checkDays(message.channel.guild.createdAt)})`, true)
        .addField('Uptime', `${prettyMilliseconds(message.client.uptime)}`, true)

      return message.channel.send(infoEmbed)
    }
    case 'gh': {
      const issueBody = await fetch(`https://api.github.com/search/issues?q=repo:runelite/runelite+${value}`, {
        headers: {
          Authorization: `token ${config.githubToken}`
        }
      }).then(res => res.json())

      const item = issueBody.items[0]
      let description = item.body.substring(0, 500)

      const lines = description.split('\n')
      if (lines.length > 7) {
        description = lines.splice(0, 7).join('\n')
      }

      if (description !== item.body) {
        description += '...'
      }

      const embed = createEmbed()
        .setTitle(`#${item.number} ${item.title}`)
        .setAuthor(item.user.login)
        .setURL(item.html_url)
        .setDescription(description)
        .setThumbnail(item.user.avatar_url)

      return message.channel.send({ embed })
    }
    case 'add': {
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

      return message.channel.send({
        embed: createEmbed()
          .setTitle('Successfully added command')
          .addField(subCommand, commandsDb.put(subCommand, subValue))
          .setColor(0x00FF00)
      })
    }
    case 'del': {
      if (!value) {
        return
      }

      if (!hasPermissions(message.member)) {
        return noPermissions(message)
      }

      commandsDb.put(value)
      return message.channel.send({
        embed: createEmbed()
          .setTitle('Successfully deleted command')
          .setDescription(value)
          .setColor(0xFF0000)
      })
    }
    case 'stream': {
      if (!value) {
        return
      }

      if (!hasPermissions(message.member)) {
        return noPermissions(message)
      }

      return sendStream(message.channel, {
        name: message.member.displayName,
        avatar: message.member.displayAvatarURL
      }, value)
    }
    case 'procadd': {
      if (!value) {
        return
      }

      if (!hasAdminPermissions(message.member)) {
        return noPermissions(message)
      }

      const members = message.guild.members.cache.filter(m => m && m.user.username && !!m.user.username.match(value))
      const array = members.array()
      membersToProcess = membersToProcess.concat(array)

      return message.channel.send({
        embed: createEmbed()
          .setTitle('Added more people to processing list')
          .addField('regex', value)
          .addField('matches', array.length)
          .addField('total', membersToProcess.length)
          .setColor(0xFF0000)
      })
    }
    case 'procdel': {
      if (!hasAdminPermissions(message.member)) {
        return noPermissions(message)
      }

      membersToProcess = []
      return message.channel.send({
        embed: createEmbed()
          .setTitle('Cleared processing list')
          .setColor(0xFF0000)
      })
    }
    case 'prockick': {
      if (!hasAdminPermissions(message.member) || membersToProcess.length >= 1000) {
        return noPermissions(message)
      }

      await message.channel.send({
        embed: createEmbed()
          .setTitle('Kicking a lot of people!')
          .addField('matches', membersToProcess.length)
          .setColor(0xFF0000)
      })

      const toProcess = membersToProcess.map(m => m.kick())
      membersToProcess = []
      return Promise.all(toProcess)
    }
    case 'procban': {
      if (!hasAdminPermissions(message.member) || membersToProcess.length >= 1000) {
        return noPermissions(message)
      }

      await message.channel.send({
        embed: createEmbed()
          .setTitle('Banning a lot of people!')
          .addField('matches', membersToProcess.length)
          .setColor(0xFF0000)
      })

      const toProcess = membersToProcess.map(m => m.ban())
      membersToProcess = []
      return Promise.all(toProcess)
    }
    case 'ghauth': {
      if (!value) {
        return sendDM(message.author, {
          embed: createEmbed()
            .setTitle('GitHub account linking')
            .setDescription(`Please visit https://github.com/login/oauth/authorize?client_id=${config.github.clientId} and follow the instructions.`)
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

      const accessResponse = await fetch('https://github.com/login/oauth/access_token', {
        method: 'POST',
        body: JSON.stringify({
          client_id: config.github.clientId,
          client_secret: config.github.clientSecret,
          code: value
        }),
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json'
        }
      }).then(res => res.json())

      const userResponse = await fetch('https://api.github.com/user', {
        headers: {
          Authorization: 'token ' + accessResponse.access_token
        }
      }).then(res => res.json())

      if (userResponse.id) {
        const authedDiscordUserId = githubUserDb.get(userResponse.id)

        if (blocked[userResponse.id]) {
          return sendDM(message.author, {
            embed: createEmbed()
              .setTitle('GitHub account linking')
              .setDescription('Your account has been banned from using this feature.')
              .setColor(0xFF0000)
          })
        }

        // Save connection between GitHub user id and Discord user id
        githubUserDb.put(userResponse.id, message.author.id)

        const embed = createEmbed()
          .setTitle('GitHub account linking')
          .setDescription('You have successfully linked your GitHub account with the bot.')
          .setColor(0x00FF00)

        if (authedDiscordUserId) {
          let removedMember = null

          await Promise.all(message.client.guilds.cache.map(g => g
            .members.fetch(authedDiscordUserId)
            .then(m => {
              if (!removedMember) {
                removedMember = m
              }

              return m
            })
            .then(m => removeRole(m, g.roles, config.roles.verified))
            .catch(e => log.debug(e))))

          if (removedMember) {
            embed.addField('Previous account unlinked', removedMember.user.username + '#' + removedMember.user.discriminator)
          }
        }

        await Promise.all(message.client.guilds.cache.map(g => g
          .members.fetch(message.author)
          .then(m => assignRole(m, g.roles, config.roles.verified))
          .catch(e => log.debug(e))))

        return sendDM(message.author, {
          embed
        })
      }

      return sendDM(message.author, {
        embed: createEmbed()
          .setTitle('GitHub account linking')
          .setDescription('The supplied token expired.')
          .setColor(0xFF0000)
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
        for (const key of githubUserDb.ls()) {
          const value = githubUserDb.get(key)

          if (value && value.toString() === mention.user.id.toString()) {
            ghId = key
            break
          }
        }

        if (ghId) {
          const userResponse = await fetch(`https://api.github.com/user/${ghId}`, {
            headers: {
              Authorization: `token ${config.githubToken}`
            }
          }).then(res => res.json()).catch(log.debug)

          let response

          if (userResponse.id) {
            response = `[ ${userResponse.html_url} ] **${userResponse.login}**`
          } else {
            response = `${value} is not a registered GitHub user.`
          }

          return message.channel.send(response)
        }
      }

      let response = `${value} has not connected their Discord account.`

      const userResponse = await fetch(`https://api.github.com/users/${value}`, {
        headers: {
          Authorization: `token ${config.githubToken}`
        }
      }).then(res => res.json()).catch(log.debug)

      if (userResponse && userResponse.id) {
        const discordId = githubUserDb.get(userResponse.id)

        if (discordId) {
          const messMember = await message.guild.members.fetch(discordId).catch(log.debug)

          if (messMember) {
            response = buildUserDetail(messMember.user)
          }
        }
      }

      return message.channel.send(response)
    }
    case 'filteradd': {
      if (!value) {
        return
      }

      if (!hasPermissions(message.member)) {
        return noPermissions(message)
      }

      filteredWordsDb.put(value, true)
      return message.channel.send(`Successfully added filtered word ${value}`)
    }
    case 'filterdel': {
      if (!value) {
        return
      }

      if (!hasPermissions(message.member)) {
        return noPermissions(message)
      }

      filteredWordsDb.put(value)
      return message.channel.send(`Successfully removed filtered word ${value}`)
    }
    case 'filterls': {
      if (!hasPermissions(message.member)) {
        return noPermissions(message)
      }

      const embed = createEmbed()
        .setTitle('List of filtered words')
        .setColor(0x00FF00)

      const chunks = splitToChunks(filteredWordsDb.ls().sort(), 3)
      for (const chunk of chunks) {
        if (chunk.length > 0) {
          embed.addField('\u200b', chunk, true)
        }
      }

      return message.channel.send({
        embed: embed
      })
    }
    case 'ws': {
      const wikiResult = await fetch(`https://oldschool.runescape.wiki/api.php?action=opensearch&search=${value}&limit=1&redirects=resolve`)
        .then(res => res.json())

      return message.channel.send(!wikiResult || wikiResult.length !== 4 || !wikiResult[1].length || !wikiResult[3].length
        ? '**ERROR**: Search did not return any results'
        : `**${wikiResult[1]}**: <${wikiResult[3]}>`)
    }
    case 'notice': {
      if (args.length <= 0) {
        if (notice.isEnabled()) {
          return message.channel.send(notice.embed)
        }
        return message.channel.send('There is no notice currently')
      }

      if (!hasPermissions(message.member)) {
        return noPermissions(message)
      }

      const prop = args.shift()
      const remainer = args.join(' ')
      switch (prop) {
        case 'on':
          notice.enabled = true
          break
        case 'off':
          notice.enabled = false
          return
        case 'title':
          notice.embed.title = remainer
          break
        case 'description':
          notice.embed.description = remainer
          break
        case 'footer':
          notice.embed.setFooter(remainer)
          break
        case 'channelCooldown':
        case 'userCooldown': {
          const v = Number.parseFloat(remainer)
          if (!(v >= 1)) {
            return message.channel.send('Invalid cooldown value')
          }
          notice[prop] = v * 1000
          break
        }
        case 'timestamp':
          if (remainer.length <= 0) {
            notice.embed.timestamp = undefined
          } else if (/^[0-9]+$/.test(remainer)) {
            notice.embed.timestamp = Number.parseInt(remainer) * 1000
          } else {
            return message.channel.send('Invalid timestamp')
          }
          break
        default:
          return message.channel.send(`Invalid command \`!notice ${prop}\``)
      }

      if (notice.enabled && !notice.isEnabled()) {
        notice.enabled = false
        return message.channel.send('Notices must have a description or title set')
      }
      return message.channel.send(notice.embed)
    }
    default: {
      if (!canExecuteCustomCommand(message)) {
        return sendDM(message.author, value).catch(() => noPermissions(message))
      }

      const keys = commandsDb.ls().sort().sort((a, b) => a.length - b.length)

      for (const key of keys) {
        if (key.toLowerCase().indexOf(command.toLowerCase()) !== -1) {
          const prefix = command.length === key.length ? '' : `**${key}**: `
          return message.channel.send(`${prefix}${commandsDb.get(key)}`)
        }
      }

      return message.channel.send(`**!${command}** command not found!`)
    }
  }
}
