const { log, githubUserDb } = require('./common')
const { assignRole } = require('./security')
const fetch = require('node-fetch')
const config = require('./config')
const { blocked } = require('./blocked')

let contributors = []

function fetchContributors (repo, roleToGive, guilds, page) {
  log.debug(`Fetching contributor page ${page} for ${repo} repository`)

  return fetch(`https://api.github.com/repos/${repo}/contributors?per_page=100&page=${page}&anon=true`, {
    headers: {
      Authorization: `token ${config.githubToken}`
    }
  }).then(res => res.json())
    .then(body => {
      if (!body.length) {
        return
      }

      log.debug(`Fetched ${body.length} contributors`)
      body.forEach(c => {
        if (c.id) {
          if (!contributors[c.id]) {
            contributors[c.id] = {}
          }
          contributors[c.id][roleToGive] = true

          // Ensure player has the contributor role
          ensureContributorRole(roleToGive, guilds, c.id)
        }
      })

      if (body.length === 100) {
        return fetchContributors(repo, roleToGive, guilds, page + 1)
      }
    })
    .catch(e => log.warn(e))
}

function ensureContributorRole (roleToGive, guilds, githubID) {
  const authedDiscordUserId = githubUserDb.get(githubID)
  if (!authedDiscordUserId || blocked[githubID]) {
    return
  }

  guilds.forEach(g => {
    const m = g.members.get(authedDiscordUserId)
    if (m) {
      assignRole(m, g.roles, roleToGive)
    }
  })
}

module.exports = {
  fetchContributors,
  contributors
}
