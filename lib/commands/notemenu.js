import { ContextMenuCommandBuilder } from '@discordjs/builders'
import notes from '../notes.js'
import { ApplicationCommandType } from 'discord-api-types/v9'

export default {
  ephemeral: true,
  data: new ContextMenuCommandBuilder()
    .setName('Get stored note for user')
    .setDefaultPermission(true)
    .setType(ApplicationCommandType.User),
  permissions: ['moderator', 'helper'],
  async execute (interaction) {
    const guild = interaction.guild
    const member = await guild.members.fetch(interaction.targetId)
    if (!member) {
      return
    }
    return interaction.followUp(notes.getNote(member.user))
  }
}
