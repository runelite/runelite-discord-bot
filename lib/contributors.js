import fetch from 'node-fetch'
import { log } from './common.js'
import { assignRole } from './security.js'
import config from './config.js'
import { githubUserDb } from './db.js'
import { blocked } from './blocked.js'

const contributors = []

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

function fetchAllContributors (guilds) {
  let contributorPromise = fetchContributors(config.github.pluginHubRepo, config.roles.pluginHubContributor, guilds, 0)

  for (const contributorRepo of config.github.contributorRepos) {
    const contrCallback = () => fetchContributors(contributorRepo, config.roles.contributor, guilds, 0)

    if (contributorPromise) {
      contributorPromise = contributorPromise.then(contrCallback)
    } else {
      contributorPromise = contrCallback()
    }
  }

  return contributorPromise
}

function ensureContributorRole (roleToGive, guilds, githubID) {
  const authedDiscordUserId = githubUserDb.get(githubID)
  if (!authedDiscordUserId || blocked[githubID]) {
    return
  }

  guilds.cache.forEach(g => {
    const m = g.members.cache.get(authedDiscordUserId)
    if (m) {
      assignRole(m, g.roles, roleToGive)
    }
  })
}

export {
  fetchAllContributors,
  contributors
}
