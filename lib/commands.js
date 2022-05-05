import { promises as fs } from 'fs'
import { commandsDb } from './db.js'
import { REST } from '@discordjs/rest'
import { Routes } from 'discord-api-types/v10'
import { SlashCommandBuilder } from '@discordjs/builders'
import { limitStrTo, log } from './common.js'
import config from './config.js'

const rest = new REST({ version: '10' }).setToken(config.discordToken)
let commandCache = null

export async function findCommand (name) {
  const commands = await allCommands()

  if (name in commands) {
    return commands[name]
  }

  for (const command of Object.values(commands)) {
    if (command.data.name === name) {
      return command
    }
  }

  return null
}

export function createCommand (name, value) {
  return new SlashCommandBuilder()
    .setName(name)
    .setDescription(limitStrTo(value, 50))
    .addMentionableOption(option => option
      .setName('mention')
      .setDescription('Optional user mention')
      .setRequired(false))
}

export async function allCommands () {
  if (commandCache) {
    return commandCache
  }

  const customCommands = commandsDb.ls().sort().map(c => ({
    name: c,
    data: createCommand(c, commandsDb.get(c)),
    async execute (interaction) {
      const command = commandsDb.get(c)

      if (!command) {
        return interaction.followUp(`Command ${c} not found.`)
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

  log.info(`Built ${Object.keys(commands).length} commands`)

  commandCache = commands
  return commands
}

export const initCommands = async (applicationId, guild) => {
  const commands = await allCommands()
  log.info(`Initializing ${Object.keys(commands)} commands for guild ${guild.id}`)

  const commandBody = Object.values(commands).map(c => {
    return c.data.toJSON()
  })

  await rest.put(Routes.applicationGuildCommands(applicationId, guild.id), {
    body: commandBody
  })
}

export const addCommand = async (applicationId, guild, command) => {
  await guild.commands.create(command.toJSON())
  commandCache = null
}

export const deleteCommand = async (applicationId, guild, command) => {
  const commands = await guild.commands.fetch()
  const commandDefinition = commands.find(c => c.name.toLowerCase() === command.toLowerCase())

  if (!commandDefinition) {
    return
  }

  await guild.commands.delete(commandDefinition.id)
  commandCache = null
}
