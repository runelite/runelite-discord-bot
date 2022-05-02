import { SlashCommandBuilder } from '@discordjs/builders'
import notes from '../notes.js'

export default {
  ephemeral: true,
  protected: true,
  data: new SlashCommandBuilder()
    .setName('note')
    .setDescription('Manage shared notes for users')
    .addSubcommand(sub => sub
      .setName('get')
      .setDescription('Get the shared note for a user')
      .addUserOption(option => option
        .setName('user')
        .setDescription('The user to get the note for')
        .setRequired(true))
    )
    .addSubcommand(sub => sub
      .setName('set')
      .setDescription('Set the shared note for a user')
      .addUserOption(option => option
        .setName('user')
        .setDescription('The user to set the note for')
        .setRequired(true))
      .addStringOption(option => option
        .setName('value')
        .setDescription('New note for the user')
        .setRequired(true))
    )
    .addSubcommand(sub => sub
      .setName('del')
      .setDescription('Delete the shared note for a user')
      .addUserOption(option => option
        .setName('user')
        .setDescription('The user to delete the note from')
        .setRequired(true))
    ),
  async execute (interaction) {
    const user = interaction.options.getUser('user')

    switch (interaction.options.getSubcommand()) {
      case 'get':
        return interaction.followUp(notes.getNote(user))
      case 'set': {
        const value = interaction.options.getString('value')
        return interaction.followUp(await notes.setNote(user, value, interaction.guild, interaction.user.tag))
      }
      case 'del':
        return interaction.followUp(await notes.setNote(user, null, interaction.guild, interaction.user.tag))
    }
  }
}
