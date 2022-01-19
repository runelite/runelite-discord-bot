import { createEmbed } from './common.js'
import config from './config.js'

const userCooldowns = new Map()
const channelCooldowns = new Map(config.channels.notices.map(v => [v, 0]))
const embed = createEmbed()
let enabled = false
let channelCooldown = 15_000
let userCooldown = 120_000

function cleanup () {
  const now = Date.now()
  for (const [user, timeout] of userCooldowns) {
    if (timeout < now) {
      userCooldowns.delete(user)
    }
  }
}

function isEnabled () {
  return embed.title && embed.description
}

function processMessage (msg) {
  if (!enabled || !isEnabled()) {
    return
  }

  if (msg.member.roles.highest.id !== msg.guild.roles.everyone.id) {
    // assume anyone with a rank can use their eyes
    return
  }

  const now = Date.now()
  if (userCooldowns.get(msg.author.id) > now) {
    userCooldowns.set(msg.author.id, now + userCooldown)
    return
  }

  if (channelCooldowns.get(msg.channel.name) > now) {
    return
  }

  channelCooldowns.set(msg.channel.name, now + channelCooldown)
  userCooldowns.set(msg.author.id, now + userCooldown)

  msg.channel.send({ embeds: [embed] })
}

function getEmbed () {
  return embed
}

function setEnabled (value) {
  enabled = value
}

function setTitle (value) {
  embed.setTitle(value)
}

function setDescription (value) {
  embed.setDescription(value)
}

function setChannelCooldown (value) {
  channelCooldown = value
}

function setUserCooldown (value) {
  userCooldown = value
}

export default {
  processMessage,
  isEnabled,
  cleanup,
  getEmbed,
  setEnabled,
  setTitle,
  setDescription,
  setUserCooldown,
  setChannelCooldown
}
