import { ContextMenuCommandBuilder } from '@discordjs/builders'
import { ApplicationCommandType } from 'discord-api-types/v9'
import fetch from 'node-fetch'
import { log } from '../common.js'
import { githubUserDb } from '../db.js'
import config from '../config.js'
import { buildUserDetail } from '../security.js'

export default {
  ephemeral: true,
  data: new ContextMenuCommandBuilder()
    .setName('Whois')
    .setType(ApplicationCommandType.User),
  async execute (interaction) {
    const guild = interaction.guild
    const member = await guild.members.fetch(interaction.targetId)

    if (!member) {
      return interaction.followUp('Member not found')
    }

    let ghId
    for (const key of githubUserDb.ls()) {
      const value = githubUserDb.get(key)

      if (value && value.toString() === member.id.toString()) {
        ghId = key
        break
      }
    }

    if (ghId) {
      const userResponse = await fetch(`https://api.github.com/user/${ghId}`, {
        headers: {
          Authorization: `token ${config.githubToken}`
        }
      }).then(res => res.json()).catch(log.debug)

      if (userResponse.id) {
        return interaction.followUp(`[ <${userResponse.html_url}> ] ${buildUserDetail(member.user, true, true)}`)
      }
    }

    return interaction.followUp(buildUserDetail(member.user, true, true))
  }
}
