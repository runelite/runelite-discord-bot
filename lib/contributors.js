const { log } = require('./common')
const fetch = require('node-fetch')
const config = require('./config')

let lastContributorPage = 0
let contributors = []

function fetchContributors () {
  fetch(`https://api.github.com/repos/runelite/runelite/contributors?per_page=100&page=${lastContributorPage}&anon=true`, {
    headers: {
      Authorization: `token ${config.githubToken}`
    }
  }).then(res => res.json())
    .then(body => {
      body.forEach(c => {
        if (c.id) {
          contributors[c.id] = c.login
        }
      })

      if (body.length === 100) {
        lastContributorPage++
        fetchContributors()
      }
    })
    .catch(e => log.debug(e))
}

module.exports = {
  fetchContributors,
  contributors
}
