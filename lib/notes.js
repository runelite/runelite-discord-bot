import { noteDb } from './db.js'
import { buildUserDetail } from './security.js'
import config from './config.js'

function getNote (user) {
  const note = noteDb.get(user.id)

  if (!note) {
    return `No stored note for ${buildUserDetail(user)}`
  } else {
    return `Stored note for ${buildUserDetail(user)}:\n\`${note}\``
  }
}

async function setNote (user, value, guild, setter) {
  const oldNote = noteDb.get(user.id)
  if (!oldNote && !value) {
    return 'There was no note to remove'
  }
  noteDb.put(user.id, value)

  let message

  if (!oldNote) {
    message = `Set note for ${buildUserDetail(user)} to:\n\`${value}\``
  } else if (!value) {
    message = `Deleted note for ${buildUserDetail(user)}:\n\`${oldNote}\``
  } else {
    message = `Updated note for ${buildUserDetail(user)}:\nOld: \`${oldNote}\`\nNew: \`${value}\``
  }

  const logs = guild.channels.cache.find(c => c.name === config.channels.moderationLogs)
  if (logs) {
    await logs.send(`:pencil2: **${setter}** ${message}`)
  }
  return message
}

export default {
  getNote,
  setNote
}
