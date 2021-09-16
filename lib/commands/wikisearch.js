import { SlashCommandBuilder } from '@discordjs/builders'
import fetch from 'node-fetch'

export default {
  data: new SlashCommandBuilder()
    .setName('wikisearch')
    .setDescription('Search the Old School RuneScape Wiki')
    .addStringOption(option => option
      .setName('query')
      .setDescription('What to search for')
      .setRequired(true)
    ),
  async execute (interaction) {
    const value = interaction.options.getString('query')
    const wikiResult = await fetch(`https://oldschool.runescape.wiki/api.php?action=opensearch&search=${value}&limit=1&redirects=resolve`)
      .then(res => res.json())

    if (!wikiResult || wikiResult.length !== 4 || !wikiResult[1].length || !wikiResult[3].length) {
      return interaction.reply({ content: `Search for \`${value}\` returned no results.`, ephemeral: true })
    }

    return interaction.reply(`**${wikiResult[1]}**: <${wikiResult[3]}>`)
  }
}
