import { SlashCommandBuilder } from '@discordjs/builders'
import fetch from 'node-fetch'
import { log, getUserFromMention } from '../common.js'
import { githubUserDb } from '../db.js'
import config from '../config.js'
import { buildUserDetail } from '../security.js'

export default {
  data: new SlashCommandBuilder()
    .setName('whois')
    .setDescription('Lookup the name of a GitHub/Discord user or author of Plugin Hub plugin.')
    .addStringOption(option => option
      .setName('query')
      .setDescription('Discord user mention/Github user name/Plugin Hub plugin name')
      .setRequired(true)
    ),
  async execute (interaction) {
    const value = interaction.options.getString('query')
    const user = getUserFromMention(interaction.guild.members, value)

    // User mention, try to match Discord->GitHub account
    if (user) {
      let ghId
      for (const key of githubUserDb.ls()) {
        const value = githubUserDb.get(key)

        if (value && value.toString() === user.id.toString()) {
          ghId = key
          break
        }
      }

      if (ghId) {
        const userResponse = await fetch(`https://api.github.com/user/${ghId}`, {
          headers: {
            Authorization: `token ${config.githubToken}`
          }
        }).then(res => res.json()).catch(log.debug)

        if (userResponse.id) {
          return interaction.followUp(`[ <${userResponse.html_url}> ] ${buildUserDetail(user.user, true, true)}`)
        }
      }

      return interaction.followUp(buildUserDetail(user.user, true, true))
    }

    // Try to check if there is plugin hub plugin matching the search
    const searchBody = await fetch(`https://raw.githubusercontent.com/runelite/plugin-hub/master/plugins/${value}`, {
      headers: {
        Authorization: `token ${config.githubToken}`
      }
    }).then(res => res.text())

    if (searchBody) {
      let repository

      searchBody.split('\n').forEach(line => {
        const kv = line.split('=')

        if (kv[0] === 'repository') {
          repository = kv[1]
        }
      })

      if (repository) {
        const repoSplit = repository.replace('https://', '').replace('http://', '').split('/')

        if (repoSplit.length >= 3) {
          const user = repoSplit[1]

          const userResponse = await fetch(`https://api.github.com/users/${user}`, {
            headers: {
              Authorization: `token ${config.githubToken}`
            }
          }).then(res => res.json()).catch(log.debug)

          let content = `\`${user}\` is not a registered GitHub user.`

          if (userResponse.id) {
            content = `\`${user}\` does not have Discord and GitHub accounts linked.`
            const discordId = githubUserDb.get(userResponse.id)

            if (discordId) {
              const messMember = await interaction.guild.members.fetch(discordId).catch(log.debug)

              if (messMember) {
                content = `[ <${userResponse.html_url}> ] ${buildUserDetail(messMember.user, true, true)}`
              }
            } else {
              content = `[ <${userResponse.html_url}> ] **${userResponse.login}**`
            }
          }

          return interaction.followUp(content)
        }
      }
    }

    // And finally try to match GitHub -> Discord account
    let content = `Search for \`${value}\` returned no results.`

    const userResponse = await fetch(`https://api.github.com/users/${value}`, {
      headers: {
        Authorization: `token ${config.githubToken}`
      }
    }).then(res => res.json()).catch(log.debug)

    if (userResponse && userResponse.id) {
      const discordId = githubUserDb.get(userResponse.id)

      if (discordId) {
        const messMember = await interaction.guild.members.fetch(discordId).catch(log.debug)

        if (messMember) {
          content = `[ <${userResponse.html_url}> ] ${buildUserDetail(messMember.user, true, true)}`
        }
      }
    }

    return interaction.followUp(content)
  }
}
