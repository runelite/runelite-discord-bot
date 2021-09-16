import { SlashCommandBuilder } from '@discordjs/builders'
import { commandsDb } from '../db.js'
import { addCommand, deleteCommand } from './index.js'

export default {
  data: new SlashCommandBuilder()
    .setName('command')
    .setDescription('Custom command management')
    .setDefaultPermission(false)
    .addSubcommand(sub => sub
      .setName('add')
      .setDescription('Adds/updates a command')
      .addStringOption(option => option
        .setName('name')
        .setDescription('Command name')
        .setRequired(true))
      .addStringOption(option => option
        .setName('content')
        .setDescription('Content of the command')
        .setRequired(true))
    )
    .addSubcommand(sub => sub
      .setName('del')
      .setDescription('Removes command')
      .addStringOption(option => option
        .setName('name')
        .setDescription('Command name')
        .setRequired(true))
    )
    .addSubcommand(sub => sub
      .setName('ls')
      .setDescription('Lists commands')
    ),
  permissions: ['moderator'],
  async execute (interaction, applicationId) {
    switch (interaction.options.getSubcommand()) {
      case 'add': {
        const regex = /^[\w-]{1,32}$/
        const name = interaction.options.getString('name').toLowerCase()

        if (!name.match(regex)) {
          return interaction.reply({
            content: `Failed to add command. \`${name}\` must match regex \`${regex}\``,
            ephemeral: true
          })
        }

        const content = interaction.options.getString('content')
        commandsDb.put(name, content)
        await addCommand(applicationId, interaction.guild, new SlashCommandBuilder().setName(name).setDescription('Custom command'))

        return interaction.reply({
          content: `Successfully added command \`${name}\``,
          ephemeral: true
        })
      }
      case 'del': {
        const name = interaction.options.getString('name')
        commandsDb.put(name)
        await deleteCommand(applicationId, interaction.guild, name)

        return interaction.reply({
          content: `Successfully removed command \`${name}\``,
          ephemeral: true
        })
      }
      case 'ls': {
        return interaction.reply({
          content: 'Commands:\n`' + commandsDb.ls().sort().join('`\n`') + '`',
          ephemeral: true
        })
      }
    }
  }
}
