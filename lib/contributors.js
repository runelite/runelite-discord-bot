const { log, githubUserDb } = require('./common')
const fetch = require('node-fetch')
const config = require('./config')

let contributors = []

function fetchContributors (guilds, page) {
  fetch(`https://api.github.com/repos/runelite/runelite/contributors?per_page=100&page=${page}&anon=true`, {
    headers: {
      Authorization: `token ${config.githubToken}`
    }
  }).then(res => res.json())
    .then(body => {
      body.forEach(c => {
        if (c.id) {
          contributors[c.id] = c.login

          // Ensure player has the contributor role
          ensureContributorRole(guilds, c.id)
        }
      })

      if (body.length === 100) {
        return fetchContributors(guilds, page + 1)
      }
    })
    .catch(e => log.debug(e))
}

function ensureContributorRole (guilds, githubID) {
  const authedDiscordUserId = githubUserDb.get(githubID)
  if (!authedDiscordUserId) {
    return
  }

  guilds.forEach(g => {
    const m = g.members.get(authedDiscordUserId)
    if (m) {
      const roleName = config.githubAuth.contributedRole.toLowerCase()
      const foundRole = m.roles.find(r => r.name.toLowerCase() === roleName)

      if (!foundRole) {
        const role = g.roles.find(r => r.name.toLowerCase() === roleName)
        m.addRole(role).catch(e => log.debug(e))
      }
    }
  })
}

module.exports = {
  fetchContributors,
  contributors
}
