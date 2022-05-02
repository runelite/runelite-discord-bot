import { ContextMenuCommandBuilder } from '@discordjs/builders'
import { assignRole, buildUserDetail, removeRole } from '../security.js'
import config from '../config.js'
import { ApplicationCommandType } from 'discord-api-types/v10'

export default {
  ephemeral: true,
  protected: true,
  data: new ContextMenuCommandBuilder()
    .setName('Mute')
    .setType(ApplicationCommandType.User),
  async execute (interaction) {
    const guild = interaction.guild
    const member = await guild.members.fetch(interaction.targetId)

    if (!member) {
      return interaction.followUp('Member not found')
    }

    const user = member.user
    const logs = guild.channels.cache.find(c => c.name === config.channels.moderationLogs)

    if (member.roles.cache.some(r => r.name === config.roles.muted)) {
      const result = await removeRole(member, guild.roles, config.roles.muted)

      if (result) {
        return interaction.followUp(result)
      }

      if (logs) {
        await logs.send(`:mute: ${buildUserDetail(user)} was unmuted by **${interaction.user.tag}**.`)
      }

      return interaction.followUp(`${buildUserDetail(user)} was unmuted.`)
    } else {
      const result = await assignRole(member, guild.roles, config.roles.muted)

      if (result) {
        return interaction.followUp(result)
      }

      if (logs) {
        await logs.send(`:mute: ${buildUserDetail(user)} was muted by **${interaction.user.tag}**.`)
      }

      return interaction.followUp(`${buildUserDetail(user)} was muted.`)
    }
  }
}
