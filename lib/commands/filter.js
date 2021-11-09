import { SlashCommandBuilder } from '@discordjs/builders'
import { filteredWordsDb } from '../db.js'

export default {
  ephemeral: true,
  data: new SlashCommandBuilder()
    .setName('filter')
    .setDescription('Message filter management')
    .setDefaultPermission(false)
    .addSubcommand(sub => sub
      .setName('add')
      .setDescription('Adds new filter')
      .addStringOption(option => option
        .setName('regex')
        .setDescription('Regex pattern for matching messages')
        .setRequired(true))
    )
    .addSubcommand(sub => sub
      .setName('del')
      .setDescription('Removes filter')
      .addStringOption(option => option
        .setName('regex')
        .setDescription('Regex pattern for matching messages')
        .setRequired(true))
    )
    .addSubcommand(sub => sub
      .setName('ls')
      .setDescription('Lists filters')
    ),
  permissions: ['moderator'],
  async execute (interaction) {
    switch (interaction.options.getSubcommand()) {
      case 'add': {
        const value = interaction.options.getString('regex')
        filteredWordsDb.put(value, true)
        return interaction.followUp({ content: `Successfully added filter \`${value}\``, ephemeral: true })
      }
      case 'del': {
        const value = interaction.options.getString('regex')
        filteredWordsDb.put(value)
        return interaction.followUp({ content: `Successfully removed filter \`${value}\``, ephemeral: true })
      }
      case 'ls': {
        return interaction.followUp({
          content: 'Filters:\n`' + filteredWordsDb.ls().sort().join('`\n`') + '`',
          ephemeral: true
        })
      }
    }
  }
}
