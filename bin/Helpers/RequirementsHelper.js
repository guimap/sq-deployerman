const { spawn } = require('child_process');
const { config } = require('dotenv');
const fs = require('fs')
const path = require('path')

class RequirementsHelper {
  constructor (commandName) {
    this.commandName = commandName
  }
  async checkAllRequirements(configPath,  relativePath = '') {
    if (!this.configFileExists(configPath, relativePath)) throw new Error(`${path.join(relativePath, configPath)} doesnt exists`)

    const requiredDepedencies = [
      'kubectl',
      'git',
      'docker'
    ]
    await this.allCommandsExists(requiredDepedencies)

    const configFile = JSON.parse(fs.readFileSync(path.join(relativePath, configPath)))
    const rulesToValidate = {
      init: () => {
        this.createProjectFolder(configFile)
        this.projectShouldExists(configFile)
      },
      'create-sandbox': () => {
        this.createProjectFolder(configFile)
        this.sandboxPropShouldExists(configFile)
      }
    }
    const validateFunction = rulesToValidate[this.commandName]
    if (validateFunction) validateFunction(configFile)
    return configFile
  }

  projectShouldExists(configFile) {
    if (Array.isArray(configFile.projects) && configFile.projects.length == 0) throw new Error(`There's no projects into "projects" props`)
    for (const project of configFile.projects) {
      if (!project.envfile) throw new Error(`Project ${project.repo} doesnt have an .env file`)
    }
    return true
  }

  sandboxPropShouldExists(configFile) {
    if (!configFile.sandbox) throw new Error(`prop sandbox is required`)
    if (!configFile.sandbox.name) throw new Error(`prop sandbox.name is required`)
    if (!configFile.sandbox.kubernetes) throw new Error(`prop sandbox.kubernetes is required`)
    if (!configFile.sandbox.kubernetes.reference_namespaces) throw new Error(`prop sandbox.kubernetes.reference_namespaces is required`)
    if (!configFile.sandbox.kubernetes.reference_namespaces.length) throw new Error(`prop sandbox.kubernetes should have at least one`)
    return true
  }

  createProjectFolder (configFile) {
    if (configFile.tempory_folder && !fs.existsSync(configFile.tempory_folder)) fs.mkdirSync(configFile.tempory_folder, { recursive: true })
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