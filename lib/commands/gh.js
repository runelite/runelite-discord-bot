import { SlashCommandBuilder } from '@discordjs/builders'
import fetch from 'node-fetch'
import config from '../config.js'
import { createEmbed } from '../common.js'

export default {
  data: new SlashCommandBuilder()
    .setName('gh')
    .setDescription('Search runelite/runelite GitHub for issues and pull requests')
    .addStringOption(option => option
      .setName('query')
      .setDescription('Issue or pull request name or number')
      .setRequired(true)
    ),
  async execute (interaction) {
    const value = interaction.options.getString('query')

    const searchBody = await fetch(`https://api.github.com/search/issues?q=repo:runelite/runelite+${value}`, {
      headers: {
        Authorization: `token ${config.githubToken}`
      }
    }).then(res => res.json())

    if (!searchBody.items || searchBody.items.length === 0) {
      return interaction.editReply({ content: `Search for **${interaction.isCommand()}** returned no results.`, ephemeral: true })
    }

    const item = searchBody.items[0]
    let description = item.body.substring(0, 500)

    const lines = description.split('\n')
    if (lines.length > 7) {
      description = lines.splice(0, 7).join('\n')
    }

    if (description !== item.body) {
      description += '...'
    }

    const embed = createEmbed()
      .setTitle(`#${item.number} ${item.title}`)
      .setAuthor(item.user.login)
      .setURL(item.html_url)
      .setDescription(description)
      .setThumbnail(item.user.avatar_url)

    return interaction.editReply({ embeds: [embed] })
  }
}
