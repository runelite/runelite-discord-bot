import { SlashCommandBuilder } from '@discordjs/builders'
import config from '../config.js'

export default {
  data: new SlashCommandBuilder()
    .setName('autologs')
    .setDescription('Instructions for automatically collecting logs'),
  async execute (interaction) {
    const logChannel = interaction.guild.channels.cache.find(c => c.name === config.channels.autoLogs)
    if (!logChannel) {
      return
    }

    const message = [
      'To automatically upload your log files to this server, use the following instructions:',
      '',
      '**Windows:**',
      '  1. Press Windows+X and select "Windows PowerShell"',
      '  2. Copy the entire section below into the window and use **right-click** to paste the contents into the PowerShell window:',
      '```ps1',
      `$(Invoke-WebRequest -Uri "${config.autoLogs.logScriptUrlWindows}" -UseBasicParsing).Content | powershell.exe`,
      '```',
      '**macOS + Linux:**',
      '  1. Press ⌘+Space to open the launcher, type "Terminal" and open "Terminal.app"',
      '  2. Copy the entire section below into the window and use **⌘+V** to paste the contents into the Terminal window:',
      '```sh',
      `curl ${config.autoLogs.logScriptUrlMacOS} | bash`,
      '```'
    ].join('\n')
    await interaction.followUp(message)
  }
}
