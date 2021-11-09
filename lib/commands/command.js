import { SlashCommandBuilder } from '@discordjs/builders'
import { commandsDb } from '../db.js'
import { addCommand, deleteCommand } from './index.js'

export default {
  ephemeral: true,
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
          return interaction.followUp({
            content: `Failed to add command. \`${name}\` must match regex \`${regex}\``,
            ephemeral: true
          })
        }

        const content = interaction.options.getString('content')
        const orig = commandsDb.get(name)

        commandsDb.put(name, content)
        await addCommand(applicationId, interaction.guild, new SlashCommandBuilder().setName(name).setDescription('Custom command'))

        return interaction.followUp({
          content: orig ? `Successfully updated command \`${name}\`` : `Successfully added command \`${name}\``,
          ephemeral: true
        })
      }
      case 'del': {
        const name = interaction.options.getString('name')
        const orig = commandsDb.get(name)

        if (!orig) {
          return interaction.followUp({
            content: `Command \`${name}\` do not exists`,
            ephemeral: true
          })
        }

        commandsDb.put(name)
        await deleteCommand(applicationId, interaction.guild, name)

        return interaction.followUp({
          content: `Successfully removed command \`${name}\``,
          ephemeral: true
        })
      }
      case 'ls': {
        return interaction.followUp({
          content: 'Commands:\n`' + commandsDb.ls().sort().join('`\n`') + '`',
          ephemeral: true
        })
      }
    }
  }
}
