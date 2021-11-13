import { ContextMenuCommandBuilder } from '@discordjs/builders'
import { assignRole, buildUserDetail, removeRole } from '../security.js'
import config from '../config.js'

export default {
  ephemeral: true,
  data: new ContextMenuCommandBuilder()
    .setName('Toggle mute for user')
    .setDefaultPermission(false)
    .setType(2),
  permissions: ['moderator'],
  async execute (interaction) {
    const guild = interaction.guild
    const member = await guild.members.fetch(interaction.targetId)

    if (!member) {
      return
    }

    const user = member.user
    const logs = guild.channels.cache.find(c => c.name === config.channels.moderationLogs)

    if (member.roles.cache.some(r => r.name === config.roles.muted)) {
      await removeRole(member, guild.roles, config.roles.muted)

      if (logs) {
        await logs.send(`:mute: ${buildUserDetail(user)} was unmuted by **${interaction.user.tag}**.`)
      }

      return interaction.followUp(`${buildUserDetail(user)} was unmuted.`)
    } else {
      await assignRole(member, guild.roles, config.roles.muted)

      if (logs) {
        await logs.send(`:mute: ${buildUserDetail(user)} was muted by **${interaction.user.tag}**.`)
      }

      return interaction.followUp(`${buildUserDetail(user)} was muted.`)
    }
  }
}
