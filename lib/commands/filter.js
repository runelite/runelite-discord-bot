import { SlashCommandBuilder } from '@discordjs/builders'
import { filteredWordsDb } from '../db.js'
import { hasPermissions } from '../security.js'

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
        .setAutocomplete(true)
        .setRequired(true))
    )
    .addSubcommand(sub => sub
      .setName('ls')
      .setDescription('Lists filters')
    ),
  async execute (interaction) {
    if (!hasPermissions(interaction.member)) {
      return interaction.followUp({ content: ':no_entry: No permissions', ephemeral: true })
    }

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
  },
  complete (interaction, applicationId) {
    const value = interaction.options.getString('regex')
    return filteredWordsDb.ls().filter(n => n.includes(value)).map(f => ({ name: f, value: f }))
  }
}
