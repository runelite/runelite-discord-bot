const { log, githubUserDb } = require('./common')
const fetch = require('node-fetch')
const config = require('./config')

let blocked = []

function fetchBlocked (guilds) {
  log.debug(`Fetching users blocked from the ${config.github.organization} organization`)

  return fetch(`https://api.github.com/orgs/${config.github.organization}/blocks`, {
    headers: {
      Authorization: `token ${config.githubToken}`,
      // We need a custom header because the api endpoint for blocked users is only available for preview
      Accept: `application/vnd.github.giant-sentry-fist-preview+json`
    }
  }).then(res => res.json())
    .then(body => {
      log.debug(`Fetched ${body.length} blocked users`)
      body.forEach(c => {
        if (c.id) {
          blocked[c.id] = c.login

          // Ensure account have ghauth at the most
          ensureBlockedFromOrganization(guilds, c.id)
        }
      })
    })
    .catch(e => log.debug(e))
}

function ensureBlockedFromOrganization (guilds, githubID) {
  const authedDiscordUserId = githubUserDb.get(githubID)
  if (!authedDiscordUserId) {
    return
  }

  guilds.forEach(g => {
    const m = g.members.get(authedDiscordUserId)
    if (m) {
      const roleName = config.github.contributedRole.toLowerCase()
      const foundRole = m.roles.find(r => r.name.toLowerCase() === roleName)

      if (foundRole) {
        log.debug(`Removing contributor role from blocked user ${m.name}`)
        const role = g.roles.find(r => r.name.toLowerCase() === roleName)
        m.removeRole(role).catch(e => log.debug(e))
      }
    }
  })
}

module.exports = {
  fetchBlocked,
  blocked
}
