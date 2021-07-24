const recentlyFlagged = new Map()

function isRecentlyFlagged (member) {
  return recentlyFlagged.has(member.id)
}

function addRecentlyFlagged (member) {
  recentlyFlagged.set(member.id, Date.now())
}

function pruneRecentlyFlagged () {
  const oldest = Date.now() - 20 * 60000
  for (const [id, time] of recentlyFlagged) {
    if (time < oldest) {
      recentlyFlagged.delete(id)
    }
  }
}

module.exports = {
  isRecentlyFlagged,
  addRecentlyFlagged,
  pruneRecentlyFlagged
}
