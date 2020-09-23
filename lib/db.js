const config = require('./config')
const commandsDb = require('littledb')(config.databases.commands)
const githubUserDb = require('littledb')(config.databases.githubUsers)
const filteredWordsDb = require('littledb')(config.databases.filteredWords)

module.exports = {
  commandsDb,
  githubUserDb,
  filteredWordsDb
}
