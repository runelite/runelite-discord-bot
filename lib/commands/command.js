import { SlashCommandBuilder } from '@discordjs/builders'
import { commandsDb } from '../db.js'
import { addCommand, createCommand, deleteCommand } from '../commands.js'

export default {
  ephemeral: true,
  protected: true,
  data: new SlashCommandBuilder()
    .setName('command')
    .setDescription('Custom command management')
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
        .setAutocomplete(true)
        .setRequired(true))
    )
    .addSubcommand(sub => sub
      .setName('ls')
      .setDescription('Lists commands')
    ),
  async execute (interaction, applicationId) {
    switch (interaction.options.getSubcommand()) {
      case 'add': {
        const regex = /^[\w-]{1,32}$/
        const name = interaction.options.getString('name').toLowerCase()

        if (!name.match(regex)) {
          return interaction.followUp(`Failed to add command. \`${name}\` must match regex \`${regex}\``)
        }

        const content = interaction.options.getString('content')
        const orig = commandsDb.get(name)

        commandsDb.put(name, content)

        await addCommand(applicationId, interaction.guild, createCommand(name, content))
        return interaction.followUp(orig ? `Successfully updated command \`${name}\`` : `Successfully added command \`${name}\``)
      }
      case 'del': {
        const name = interaction.options.getString('name')
        const orig = commandsDb.get(name)

        if (!orig) {
          return interaction.followUp(`Command \`${name}\` do not exists`)
        }

        commandsDb.put(name)
        await deleteCommand(applicationId, interaction.guild, name)

        return interaction.followUp(`Successfully removed command \`${name}\``)
      }
      case 'ls': {
        return interaction.followUp('Custom Commands:\n`' + commandsDb.ls().sort().join('`\n`') + '`')
      }
    }
  },
  complete (interaction, applicationId) {
    const name = interaction.options.getString('name').toLowerCase()
    return commandsDb.ls().filter(n => n.includes(name)).map(c => ({ name: c, value: c }))
  }
}
