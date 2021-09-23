const { spawn } = require('child_process');
const { config } = require('dotenv');
const fs = require('fs')
const path = require('path')

class RequirementsHelper {
  async checkAllRequirements(configPath,  relativePath = '') {
    if (!this.configFileExists(configPath, relativePath)) throw new Error(`${path.join(relativePath, configPath)} doesnt exists`)

    const requiredDepedencies = [
      'kubectl',
      'git',
      'docker'
    ]
    await this.allCommandsExists(requiredDepedencies)

    const configFile = JSON.parse(fs.readFileSync(path.join(relativePath, configPath)))
    if (Array.isArray(configFile.projects) && configFile.projects.length == 0) throw new Error(`There's no projects into "projects" props`)

    for (const project of configFile.projects) {
      if (!project.envfile) throw `Project ${project.repo} doesnt have an .env file`
    }
    return configFile
  }

  configFileExists(configPath, relativePath = null) {
    let path = []
    if(relativePath) path.push(path)
    path.push(configPath)
    return fs.existsSync(path.join(...path).trim())
  }

  async allCommandsExists(commands) {
    const pendingsPromises = commands.map(this.testCommand)
    return Promise.all(pendingsPromises)
  }

  testCommand(command) {
    return new Promise((resolve, reject) => {
      const process = spawn(command, ['version'])
      process.on('exit', (code) => {
        if (code !== 0) return reject(new Error(`Command "${command}" doenst exists in bash`))
        return resolve(true)
      })
    })
  }
}

module.exports = RequirementsHelper