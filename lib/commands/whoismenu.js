import { ContextMenuCommandBuilder } from '@discordjs/builders'
import { ApplicationCommandType } from 'discord-api-types/v9'
import fetch from 'node-fetch'
import { log } from '../common.js'
import { githubUserDb } from '../db.js'
import config from '../config.js'
import { buildUserDetail, hasPermissions } from '../security.js'

export default {
  ephemeral: true,
  data: new ContextMenuCommandBuilder()
    .setName('Whois')
    .setType(ApplicationCommandType.User),
  async execute (interaction) {
    const sendNote = hasPermissions(interaction.member)
    const guild = interaction.guild
    const member = await guild.members.fetch(interaction.targetId)
    const conf = {
      headers: {
        Authorization: `token ${config.githubToken}`
      }
    }

    if (!member) {
      return interaction.followUp('Member not found')
    }

    const ghId = githubUserDb.ls().find(k => (githubUserDb.get(k) || '').toString() === member.id.toString())

    if (ghId) {
      const userResponse = await fetch(`https://api.github.com/user/${ghId}`, conf).then(res => res.json()).catch(log.debug)
      if (userResponse.id) {
        return interaction.followUp(`[ <${userResponse.html_url}> ] ${buildUserDetail(member.user, true, sendNote)}`)
      }
    }

    return interaction.followUp(buildUserDetail(member.user, true, sendNote))
  }
}
