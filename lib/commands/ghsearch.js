import { SlashCommandBuilder } from '@discordjs/builders'
import fetch from 'node-fetch'
import config from '../config.js'

export default {
  data: new SlashCommandBuilder()
    .setName('ghsearch')
    .setDescription('Search runelite/runelite GitHub repository for file')
    .addStringOption(option => option
      .setName('file')
      .setDescription('Name of the file')
      .setRequired(true)
    ),
  async execute (interaction) {
    const value = interaction.options.getString('file')
    const searchBody = await fetch(`https://api.github.com/search/code?q=repo:runelite/runelite+filename:${value}`, {
      headers: {
        Authorization: `token ${config.githubToken}`
      }
    }).then(res => res.json())

    if (!searchBody.items || searchBody.items.length === 0) {
      return interaction.followUp({ content: `Search for **${value}** returned no results.`, ephemeral: true })
    }

    const item = searchBody.items[0]
    return interaction.followUp(`**${item.name}** <${item.html_url}>`)
  }
}
