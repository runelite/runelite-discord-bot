const { log, githubUserDb } = require('./common')
const fetch = require('node-fetch')
const config = require('./config')
const { blocked } = require('./blocked')

let contributors = []

function fetchContributors (repo, guilds, page) {
  log.debug(`Fetching contributor page ${page} for ${repo} repository`)

  return fetch(`https://api.github.com/repos/${repo}/contributors?per_page=100&page=${page}&anon=true`, {
    headers: {
      Authorization: `token ${config.githubToken}`
    }
  }).then(res => res.json())
    .then(body => {
      log.debug(`Fetched ${body.length} contributors`)
      body.forEach(c => {
        if (c.id) {
          contributors[c.id] = c.login

          // Ensure player has the contributor role
          ensureContributorRole(guilds, c.id)
        }
      })

      if (body.length === 100) {
        return fetchContributors(repo, guilds, page + 1)
      }
    })
    .catch(e => log.warn(e))
}

function ensureContributorRole (guilds, githubID) {
  const authedDiscordUserId = githubUserDb.get(githubID)
  if (!authedDiscordUserId) {
    return
  }

  guilds.forEach(g => {
    const m = g.members.get(authedDiscordUserId)
    if (m) {
      const roleName = config.github.contributedRole.toLowerCase()
      const foundRole = m.roles.find(r => r.name.toLowerCase() === roleName)

      if (!foundRole && !blocked.includes(githubID)) {
        log.debug(`Assigning contributor role to user ${m.name}`)
        const role = g.roles.find(r => r.name.toLowerCase() === roleName)
        m.addRole(role).catch(e => log.warn(e))
      }
    }
  })
}

module.exports = {
  fetchContributors,
  contributors
}
