import { promises as fs } from 'fs'
import { commandsDb } from './db.js'
import { SlashCommandBuilder } from '@discordjs/builders'
import { REST } from '@discordjs/rest'
import { Routes } from 'discord-api-types/v9'
import config from './config.js'
import { limitStrTo, log } from './common.js'

const rest = new REST({ version: '9' }).setToken(config.discordToken)
const commandList = {}
let commandCache = null

export async function allCommands () {
  if (commandCache) {
    return commandCache
  }

  const customCommands = commandsDb.ls().sort().map(c => ({
    name: c,
    data: new SlashCommandBuilder()
      .setName(c)
      .setDescription(limitStrTo(commandsDb.get(c), 50))
      .addMentionableOption(option => option
        .setName('mention')
        .setDescription('Optional user mention')
        .setRequired(false)),
    async execute (interaction) {
      const command = commandsDb.get(c)

      if (!command) {
        return
      }

      const user = interaction.options.getMentionable('mention')
      return interaction.followUp((user ? user.toString() + ' ' : '') + command)
    }
  })).reduce((a, v) => ({ ...a, [v.name]: v }), {})

  const commandFiles = (await fs.readdir('./lib/commands')).filter(file => file.endsWith('.js'))
  const commands = {
    ...customCommands
  }

  for (const commandFile of commandFiles) {
    const name = commandFile.replace('.js', '')
    commands[name] = (await import(`./commands/${commandFile}`)).default
  }

  commandCache = commands
  return commands
}

export const initCommands = async (applicationId, guild) => {
  const commands = await allCommands()
  log.info(`Initializing ${Object.keys(commands)} commands for guild ${guild.id}`)

  const commandBody = Object.values(commands).map(c => {
    return c.data.toJSON()
  })

  const response = await rest.put(Routes.applicationGuildCommands(applicationId, guild.id), {
    body: commandBody
  })

  commandList[guild.id] = response || []

  await Promise.all(response.map(async r => {
    const commandDefinition = commands[r.name]

    if (!('permissions' in commandDefinition)) {
      return Promise.resolve()
    }

    const command = await guild.commands.fetch(r.id)
    return command.permissions.add({
      permissions: guild.roles.cache.filter(r => commandDefinition.permissions.includes(r.name.toLowerCase())).map(r => ({
        id: r.id,
        type: 'ROLE',
        permission: true
      }))
    })
  }))
}

export const addCommand = async (applicationId, guild, command) => {
  if (!(guild.id in commandList)) {
    return
  }

  if (!commandList[guild.id]) {
    commandList[guild.id] = []
  }

  const response = await rest.post(Routes.applicationGuildCommands(applicationId, guild.id), {
    body: command.toJSON()
  })

  commandList[guild.id] = commandList[guild.id].filter(c => c.name.toLowerCase() !== response.name.toLowerCase())
  commandList[guild.id].push(response)
}

export const deleteCommand = async (applicationId, guild, command) => {
  if (!(guild.id in commandList)) {
    return
  }

  if (!commandList[guild.id]) {
    commandList[guild.id] = []
  }

  const commands = commandList[guild.id]
  const commandDefinition = commands.find(c => c.name.toLowerCase() === command.toLowerCase())

  if (!commandDefinition) {
    return
  }

  await rest.delete(Routes.applicationGuildCommand(applicationId, guild.id, commandDefinition.id))
  commandList[guild.id] = commandList[guild.id].filter(c => c !== commandDefinition)
}
