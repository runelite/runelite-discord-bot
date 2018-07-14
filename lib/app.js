const fetch = require('node-fetch')
const Discord = require('discord.js')
const config = require('./config')
const commands = require('./commands')
const client = new Discord.Client()

client.on('ready', () => {
  console.log(`Logged in as ${client.user.tag}!`)
  client.setInterval(() => {
    fetch('https://api.github.com/repos/runelite/runelite/tags', {
      headers: {
        Authorization: `token ${config.githubToken}`
      }
    }).then(res => res.json())
      .then(body => {
        const release = body[0]
        const version = release.name.substring(
          release.name.lastIndexOf('-') + 1,
          release.name.length)

        fetch(`https://api.runelite.net/runelite-${version}/session/count`)
          .then(res => res.json())
          .then(body => client.user.setActivity(`${body} players online`))
          .catch(e => console.debug(e))
      }).catch(e => console.debug(e))
  }, 300000)
})

client.on('message', message => {
  if (message.author.bot) {
    return
  }

  if (!message.content.startsWith(config.prefix)) {
    return
  }

  const args = message.content.slice(config.prefix.length).trim().split(/ +/g)
  const command = args.shift().toLowerCase()
  commands(message, command, args)
})

client.login(config.discordToken)
