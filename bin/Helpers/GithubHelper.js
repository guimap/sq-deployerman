const got = require('got')
const { URL } = require('url')
const path = require('path')
const fs = require('fs')
const { spawn, execSync } = require('child_process')
class GithubHelper {
  constructor(configFile) {
    this.configFile = configFile
  }

  async pullBranch ({repo, branch}, projectPath) {
    try {
      const projectURL = new URL(repo)
      const [,...repoName] = projectURL.pathname.split('/')

      const repoURL = `git@github.com:${repoName.join('/')}.git`
      const [nameRepo] = repoName.slice(-1)
      const pathToSave = path.join(projectPath, nameRepo)
      if (!this.projectExists(pathToSave)) {
        this.createIfNotExists(pathToSave)
        await this.clone(repoURL, branch, pathToSave)
      }
      const commit = await this.getCurrentCommit(pathToSave)
      return {
        localRepoPath: pathToSave,
        repoName: repoName.join('/'),
        commit

      }
    } catch (err) {
      console.log(err)
      throw new Error(`Invalid URL`)
    }
  }

  async clone(urlGit, branch, pathToSave) {
    return new Promise(async (resolve, reject) => {
      const commandGitCloneArgs = `clone -b ${branch} ${urlGit} ${pathToSave}`
      const git = spawn('git', commandGitCloneArgs.split(' '))
      git.on('exit', code => {
        if (code !== 0) return reject(new Error(`Cannot clone ${urlGit}`))
        resolve(true)
      })
    })
  }

  async getCurrentCommit(repoPath) {
    return new Promise(async(resolve, reject) => {
      
      try {
        const commit = execSync(`git rev-parse --short HEAD`, { cwd: repoPath}).toString()
        resolve(commit.replace('\n', ''))
      } catch (err) {
        reject(err)
      }
    })
  }

  createIfNotExists(path) {
    if (!fs.existsSync(path)) {
      fs.mkdirSync(path)
    }
  }

  projectExists(path) {
    return fs.existsSync(path)
  }
  
}

module.exports = GithubHelper
