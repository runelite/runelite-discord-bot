const fetch = require('node-fetch')
const config = require('./config')
const { commandsDb, githubUserDb, filteredWordsDb } = require('./db')
const { log, createEmbed, sendDM, splitToChunks } = require('./common')
const { sendStream } = require('./twitch')
const { blocked } = require('./blocked')
const { canExecuteCustomCommand, hasAdminPermissions, hasPermissions, noPermissions, assignRole, removeRole } = require('./security')

let membersToProcess = []

module.exports = async (message, command, args) => {
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
          .addField('!filteradd <regex>', 'Add regex filter for words')
          .addField('!filterdel <regex>', 'Remove regex filter for words')
          .addField('!filterls', 'Lists all configured filters for words')
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
        for (let chunk of chunks) {
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
    case 'gh':
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

      return message.channel.send({
        embed: createEmbed()
          .setTitle('Successfully added command')
          .addField(subCommand, commandsDb.put(subCommand, subValue))
          .setColor(0x00FF00)
      })
    case 'del':
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
    case 'stream':
      if (!value) {
        return
      }

      if (!hasPermissions(message.member)) {
        return noPermissions(message)
      }

      return sendStream(message.channel, message.member, value)
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
          'Accept': 'application/json'
        }
      }).then(res => res.json())

      const userResponse = await fetch('https://api.github.com/user', {
        headers: {
          'Authorization': 'token ' + accessResponse.access_token
        }
      }).then(res => res.json())

      if (userResponse.id) {
        const authedDiscordUserId = githubUserDb.get(userResponse.id)

        if (authedDiscordUserId && authedDiscordUserId === message.author.id) {
          // Don't allow linking a GitHub account to same account twice (no point)
          return sendDM(message.author, {
            embed: createEmbed()
              .setTitle('GitHub account linking')
              .setDescription('Your GitHub account is already linked to this Discord user.')
              .setColor(0xFF0000)
          })
        }

        // Save connection between GitHub user id and Discord user id
        githubUserDb.put(userResponse.id, message.author.id)

        if (blocked[userResponse.id]) {
          return sendDM(message.author, {
            embed: createEmbed()
              .setTitle('GitHub account linking')
              .setDescription('Your account has been banned from using this feature.')
              .setColor(0xFF0000)
          })
        }

        const embed = createEmbed()
          .setTitle('GitHub account linking')
          .setDescription('You have successfully linked your GitHub account with the bot.')
          .setColor(0x00FF00)

        if (authedDiscordUserId) {
          let removedMember = null

          await Promise.all(message.client.guilds.map(g => g
            .fetchMember(authedDiscordUserId)
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

        await Promise.all(message.client.guilds.map(g => g
          .fetchMember(message.author)
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
        for (let key of githubUserDb.ls()) {
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
          }).then(res => res.json())

          let embed

          if (userResponse.id) {
            embed = createEmbed()
              .setAuthor(userResponse.name, userResponse.avatar_url, userResponse.html_url)
              .setThumbnail('')
          } else {
            embed = createEmbed()
              .setDescription(`${value} is not a registered GitHub user.`)
          }

          return message.channel.send({ embed })
        }
      }

      const userResponse = await fetch(`https://api.github.com/users/${value}`, {
        headers: {
          Authorization: `token ${config.githubToken}`
        }
      }).then(res => res.json())

      let embed

      if (userResponse.id) {
        const discordId = githubUserDb.get(userResponse.id)

        if (discordId) {
          const messMember = message.guild.members.get(discordId)

          if (messMember) {
            embed = createEmbed()
              .setAuthor(messMember.user.username + '#' + messMember.user.discriminator, messMember.user.avatarURL)
              .setDescription(`<@${discordId}>`)
              .setThumbnail('')
          }
        } else {
          embed = createEmbed().setDescription(`${value} has not connected their Discord account.`)
        }
      } else {
        embed = createEmbed().setDescription(`${value} has not connected their Discord account.`)
      }

      return message.channel.send({ embed })
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
      for (let chunk of chunks) {
        if (chunk.length > 0) {
          embed.addField('\u200b', chunk, true)
        }
      }

      return message.channel.send({
        embed: embed
      })
    }
    default: {
      const value = commandsDb.get(command)

      if (!value) {
        return
      }

      if (!canExecuteCustomCommand(message)) {
        return sendDM(message.author, value).catch(() => noPermissions(message))
      }

      return message.channel.send(value)
    }
  }
}
