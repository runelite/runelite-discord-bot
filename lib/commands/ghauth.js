import { SlashCommandBuilder } from '@discordjs/builders'
import fetch from 'node-fetch'
import config from '../config.js'
import { githubUserDb } from '../db.js'
import { blocked } from '../blocked.js'
import { removeRole, assignRole } from '../security.js'

export default {
  ephemeral: true,
  data: new SlashCommandBuilder()
    .setName('ghauth')
    .setDescription('Link your GitHub account to the bot')
    .addStringOption(option => option
      .setName('oauth_code')
      .setDescription('OAuth code')
      .setRequired(false)
    ),
  async execute (interaction) {
    const value = interaction.options.getString('oauth_code')

    if (!value) {
      return interaction.followUp({ content: `Please visit <https://github.com/login/oauth/authorize?client_id=${config.github.clientId}> and follow the instructions.`, ephemeral: true })
    }

    // GitHub's OAuth codes are 20 characters long
    if (value.length !== 20) {
      return interaction.followUp({ content: 'The supplied token is invalid.', ephemeral: true })
    }

    const accessResponse = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      body: JSON.stringify({
        client_id: config.github.clientId,
        client_secret: config.github.clientSecret,
        code: value
      }),
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json'
      }
    }).then(res => res.json())

    const userResponse = await fetch('https://api.github.com/user', {
      headers: {
        Authorization: 'token ' + accessResponse.access_token
      }
    }).then(res => res.json())

    if (!userResponse.id) {
      return interaction.followUp({ content: 'The supplied token expired.', ephemeral: true })
    }

    const authedDiscordUserId = githubUserDb.get(userResponse.id)

    if (blocked[userResponse.id]) {
      return interaction.followUp({ content: 'Your account has been banned from using this feature.', ephemeral: true })
    }

    githubUserDb.put(userResponse.id, interaction.user.id)

    if (authedDiscordUserId) {
      await removeRole(interaction.member, interaction.guild.roles, config.roles.verified)
    }

    await assignRole(interaction.member, interaction.guild.roles, config.roles.verified)
    return interaction.followUp({ content: 'You have successfully linked your GitHub account with the bot.', ephemeral: true })
  }
}
