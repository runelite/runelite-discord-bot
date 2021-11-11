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
        return interaction.followUp(`Successfully added filter \`${value}\``)
      }
      case 'del': {
        const value = interaction.options.getString('regex')
        filteredWordsDb.put(value)
        return interaction.followUp(`Successfully removed filter \`${value}\``)
      }
      case 'ls': {
        return interaction.followUp('Filters:\n`' + filteredWordsDb.ls().sort().join('`\n`') + '`')
      }
    }
  }
}
