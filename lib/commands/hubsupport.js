import { SlashCommandBuilder } from '@discordjs/builders'
import fetch from 'node-fetch'

let manifestCache = null
let nextUpdate = Date.now()

async function fetchManifest () {
  if (manifestCache != null && Date.now() < nextUpdate) {
    return manifestCache
  }

  const bootstrap = await fetch('https://static.runelite.net/bootstrap.json').then(res => res.json())
  const version = bootstrap.client.version
  const response = await fetch(`https://repo.runelite.net/plugins/${version}/manifest.js`).then(res => res.arrayBuffer())
  const signatureSize = new DataView(response).getUint32(0)

  // Removes the signature, and it's 4byte header, then converts the result into a string
  const jsonStr = new TextDecoder('utf-8').decode(
    new Uint8Array(response.slice(signatureSize + 4))
  )

  manifestCache = JSON.parse(jsonStr)
  nextUpdate = Date.now() + 120_000
  return manifestCache
}

export default {
  data: new SlashCommandBuilder()
    .setName('hubsupport')
    .setDescription('Lookup the support link for plugin hub plugin.')
    .addStringOption(option => option
      .setName('name')
      .setDescription('Plugin hub plugin name')
      .setAutocomplete(true)
    ),
  async execute (interaction) {
    const value = interaction.options.getString('name')

    if (!value) {
      return interaction.followUp('Support for hub plugins should be directed to the author of the plugin.\nYou can find the support link by searching for the plugin in the Plugin Hub panel and clicking the `?` button on the plugin, or by right-clicking the plugin in the plugin panel and clicking the `Support` menu option.')
    }

    const manifest = await fetchManifest()
    const plugin = manifest.find(p => p.internalName === value)

    if (plugin && plugin.support) {
      return interaction.followUp(`Get support for the **${plugin.displayName}** plugin hub plugin here: <${plugin.support}>.\nYou can also find the support link by searching for the plugin in the Plugin Hub panel and clicking the \`?\` button on the plugin, or by right-clicking the plugin in the plugin panel and clicking the \`Support\` menu option.`)
    }

    return interaction.followUp(`Support link for plugin hub plugin **${value}** not found.`)
  },
  async complete (interaction) {
    const value = interaction.options.getString('name').toLowerCase()
    const manifest = await fetchManifest()
    return manifest.map(p => ({ name: p.displayName, value: p.internalName }))
      .filter(p => (p.name.includes(value)) || p.value.includes(value))
      .slice(0, 24)
  }
}
