import { SlashCommandBuilder } from '@discordjs/builders'
import config from '../config.js'

export default {
  ephemeral: true,
  data: new SlashCommandBuilder()
    .setName('ghauth')
    .setDescription('Link your GitHub account to the bot'),
  async execute (interaction) {
    return interaction.followUp(`Please visit <https://github.com/login/oauth/authorize?client_id=${config.github.clientId}> and follow the instructions.`)
  }
}
