import { SlashCommandBuilder } from '@discordjs/builders'
import notice from '../notice.js'

export default {
  data: new SlashCommandBuilder()
    .setName('notice')
    .setDescription('Manage notice')
    .setDefaultPermission(false)
    .addSubcommand(sub => sub
      .setName('show')
      .setDescription('Shows current notice')
    )
    .addSubcommand(sub => sub
      .setName('on')
      .setDescription('Turns the notice on')
    )
    .addSubcommand(sub => sub
      .setName('off')
      .setDescription('Turns the notice off')
    )
    .addSubcommand(sub => sub
      .setName('title')
      .setDescription('Sets the notice title')
      .addStringOption(option => option
        .setName('value')
        .setDescription('New title for notice')
        .setRequired(true))
    )
    .addSubcommand(sub => sub
      .setName('description')
      .setDescription('Sets the notice description')
      .addStringOption(option => option
        .setName('value')
        .setDescription('New description for notice')
        .setRequired(true))
    )
    .addSubcommand(sub => sub
      .setName('channel-cooldown')
      .setDescription('Sets the notice per channel cooldown')
      .addNumberOption(option => option
        .setName('value')
        .setDescription('New channel cooldown value')
        .setRequired(true))
    )
    .addSubcommand(sub => sub
      .setName('user-cooldown')
      .setDescription('Sets the notice per user cooldown')
      .addNumberOption(option => option
        .setName('value')
        .setDescription('New user cooldown value')
        .setRequired(true))
    )
    .addSubcommand(sub => sub
      .setName('timestamp')
      .setDescription('Sets the notice timestamp')
      .addNumberOption(option => option
        .setName('value')
        .setDescription('New timestamp value (empty to disable)')
        .setRequired(false))
    ),
  permissions: ['moderator', 'helper'],
  async execute (interaction) {
    switch (interaction.options.getSubcommand()) {
      case 'show':
        if (!notice.isEnabled()) {
          return interaction.followUp('Notices must have a description and title set')
        }

        return interaction.followUp({ embeds: [notice.getEmbed()] })
      case 'on':
        notice.setEnabled(true)

        if (!notice.isEnabled()) {
          notice.setEnabled(false)
          return interaction.followUp('Notices must have a description and title set')
        }

        break
      case 'off':
        notice.setEnabled(false)
        return
      case 'title':
        notice.setTitle(interaction.options.getString('value'))
        break
      case 'description':
        notice.setDescription(interaction.options.getString('value'))
        break
      case 'channel-cooldown':
        notice.setChannelCooldown(interaction.options.getNumber('value') * 1000)
        break
      case 'user-cooldown':
        notice.setUserCooldown(interaction.options.getNumber('value') * 1000)
        break
      case 'timestamp':
        if (!interaction.options.getNumber('value')) {
          notice.setTimestamp(undefined)
        } else {
          notice.setTimestamp(interaction.options.getNumber('value'))
        }
        break
    }

    const resp = {
      content: `Notice \`${interaction.options.getSubcommand()}\` updated.`
    }

    if (notice.isEnabled()) {
      resp.embeds = [notice.getEmbed()]
    }

    return interaction.followUp(resp)
  }
}
