const fetch = require('node-fetch')
const config = require('./config')
const { log } = require('./common')
const { githubUserDb } = require('./db')

const blocked = []

function fetchBlocked (guilds) {
  log.debug(`Fetching users blocked from the ${config.github.organization} organization`)

  return fetch(`https://api.github.com/orgs/${config.github.organization}/blocks`, {
    headers: {
      Authorization: `token ${config.githubToken}`,
      // We need a custom header because the api endpoint for blocked users is only available for preview
      Accept: 'application/vnd.github.giant-sentry-fist-preview+json'
    }
  }).then(res => res.json())
    .then(body => {
      if (!body.length) {
        return
      }

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

  guilds.cache.forEach(g => {
    const m = g.members.cache.get(authedDiscordUserId)
    if (m) {
      const rolesToRemove = [config.roles.verified, config.roles.contributor, config.roles.pluginHubContributor]

      rolesToRemove.forEach(n => {
        const foundRole = m.roles.cache.find(r => r.name.toLowerCase() === n.toLowerCase())

        if (foundRole) {
          log.debug(`Removing role '${n}' from blocked user ${m.name}`)
          const role = g.roles.cache.find(r => r.name.toLowerCase() === n)
          m.roles.remove(role).catch(e => log.debug(e))
        }
      })
    }
  })
}

module.exports = {
  fetchBlocked,
  blocked
}
