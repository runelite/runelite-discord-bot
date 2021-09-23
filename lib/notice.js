import { createEmbed } from './common.js'
import config from './config.js'

const userCooldowns = new Map()
const channelCooldowns = new Map(config.channels.notices.map(v => [v, 0]))

function cleanup () {
  const now = Date.now()
  for (const [user, timeout] of userCooldowns) {
    if (timeout < now) {
      userCooldowns.delete(user)
    }
  }
}

function isEnabled () {
  return this.embed.title && this.embed.description
}

function processMessage (msg) {
  if (!this.enabled || !isEnabled()) {
    return
  }

  if (msg.member.roles.highest.id !== msg.guild.roles.everyone.id) {
    // assume anyone with a rank can use their eyes
    return
  }

  const now = Date.now()
  if (userCooldowns.get(msg.author.id) > now) {
    userCooldowns.set(msg.author.id, now + this.userCooldown)
    return
  }

  const channelCooldown = channelCooldowns.get(msg.channel.name)
  if (channelCooldown === undefined || channelCooldown > now) {
    return
  }

  channelCooldowns.set(msg.channel.name, now + this.channelCooldown)
  userCooldowns.set(msg.author.id, now + this.userCooldown)

  msg.channel.send({ embeds: [this.embed] })
}

export default {
  processMessage,
  isEnabled,
  cleanup,

  enabled: false,
  channelCooldown: 15_000,
  userCooldown: 120_000,

  embed: createEmbed().setThumbnail(undefined)
}
