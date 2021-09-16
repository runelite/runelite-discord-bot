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
      .setName('footer')
      .setDescription('Sets the notice footer')
      .addStringOption(option => option
        .setName('value')
        .setDescription('New footer for notice')
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
  permissions: ['moderator'],
  async execute (interaction) {
    switch (interaction.options.getSubcommand()) {
      case 'show':
        if (!notice.isEnabled()) {
          return interaction.reply({ content: 'Notices must have a description and title set', ephemeral: true })
        }

        return interaction.reply({ embeds: [notice.embed], ephemeral: true })
      case 'on':
        notice.enabled = true

        if (!notice.isEnabled()) {
          notice.enabled = false
          return interaction.reply({ content: 'Notices must have a description and title set', ephemeral: true })
        }

        break
      case 'off':
        notice.enabled = false
        return
      case 'title':
        notice.embed.title = interaction.options.getString('value')
        break
      case 'description':
        notice.embed.description = interaction.options.getString('value')
        break
      case 'footer':
        notice.embed.setFooter(interaction.options.getString('value'))
        break
      case 'channel-cooldown':
        notice.channelCooldown = interaction.options.getNumber('value') * 1000
        break
      case 'user-cooldown':
        notice.userCooldown = interaction.options.getNumber('value') * 1000
        break
      case 'timestamp':
        if (!interaction.options.getNumber('value')) {
          notice.embed.timestamp = undefined
        } else {
          notice.embed.timestamp = interaction.options.getNumber('value')
        }
        break
    }

    return interaction.reply({ content: `\`${interaction.options.getSubcommand()}\` updated.`, ephemeral: true })
  }
}
