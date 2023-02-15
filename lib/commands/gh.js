import { SlashCommandBuilder } from '@discordjs/builders'
import fetch from 'node-fetch'
import config from '../config.js'
import { createEmbed } from '../common.js'

export default {
  data: new SlashCommandBuilder()
    .setName('gh')
    .setDescription('Search runelite/runelite GitHub for issues, pull requests and files')
    .addStringOption(option => option
      .setName('query')
      .setDescription('Issue/pull request name or number or file name')
      .setRequired(true)
    ),
  async execute (interaction) {
    const value = interaction.options.getString('query')

    const fileSearch = await fetch(`https://api.github.com/search/code?q=repo:runelite/runelite+filename:${value}`).then(res => res.json())

    if (fileSearch.items && fileSearch.items.length > 0) {
      const item = fileSearch.items[0]
      if (item.name && item.html_url) {
        return interaction.followUp(`**${item.name}** <${item.html_url}>`)
      }
    }

    const issueSearch = await fetch(`https://api.github.com/search/issues?q=repo:runelite/runelite+${value}`).then(res => res.json())

    if (!issueSearch.items || issueSearch.items.length === 0) {
      return interaction.followUp(`Search for **${value}** returned no results.`)
    }

    const item = issueSearch.items[0]
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

    return interaction.followUp({ embeds: [embed] })
  }
}
