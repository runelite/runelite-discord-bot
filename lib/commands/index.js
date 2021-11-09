import { commandsDb } from '../db.js'
import { SlashCommandBuilder } from '@discordjs/builders'
import { REST } from '@discordjs/rest'
import { Routes } from 'discord-api-types/v9'
import config from '../config.js'
import { log } from '../common.js'

// Commands
import command from './command.js'
import filter from './filter.js'
import gh from './gh.js'
import ghauth from './ghauth.js'
import ghsearch from './ghsearch.js'
import whois from './whois.js'
import wikisearch from './wikisearch.js'
import notice from './notice.js'

const rest = new REST({ version: '9' }).setToken(config.discordToken)
const commandList = {}

export function allCommands () {
  const customCommands = commandsDb.ls().sort().map(c => ({
    name: c,
    data: new SlashCommandBuilder()
      .setName(c)
      .setDescription('Custom command')
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
      return interaction.editReply((user ? user.toString() + ' ' : '') + command)
    }
  })).reduce((a, v) => ({ ...a, [v.name]: v }), {})

  return {
    command,
    filter,
    gh,
    ghauth,
    ghsearch,
    notice,
    whois,
    wikisearch,
    ...customCommands
  }
}

export const initCommands = async (applicationId, guild) => {
  const commands = allCommands()
  log.info(`Initializing ${Object.keys(commands)} commands for guild ${guild.id}`)

  const commandBody = Object.values(commands).map(c => c.data.toJSON())

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
