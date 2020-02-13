const { hasPermissions } = require('./security')

module.exports = (message) => {
  if (hasPermissions(message.member)) {
    return false
  }

  if (message.attachments.size > 0) {
    return !(message.attachments.size === message.attachments.filter(a => {
      const isImage = a.width > 0 && a.height > 0
      const isText = a.url.endsWith('.txt') || a.url.endsWith('.log')
      return isImage || isText
    }).size)
  }

  return false
}
