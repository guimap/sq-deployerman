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
      'create-sandbox': () => {
        this.createProjectFolder(configFile)
        this.credentialsShouldExist(configFile)
        this.checkSandboxProps(configFile)
      }
    }
    rulesToValidate['apply-project'] = () => {
      //  Extends Requirements to create-sandbox
      rulesToValidate['create-sandbox']()
      this.projectShouldExists(configFile)
    }

    rulesToValidate['drop-sandbox'] = () => {
      rulesToValidate['create-sandbox']()
      this.sandboxFolderExistsWithContent(configFile)
    }
    const validateFunction = rulesToValidate[this.commandName]
    if (validateFunction) validateFunction(configFile)
    return configFile
  }

  checkSandboxProps (configFile) {
    const {sandbox} = configFile
    if (sandbox.name.length === 1) throw new Error(`${sandbox.name} is not valid, sandbox name should have more than 1 character`)
    if (sandbox.name.length > 3) throw new Error(`${sandbox.name} is not valid, sandbox name should have less than 3 character`)
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
    return true
  }

  createProjectFolder (configFile) {
    if (configFile.tempory_folder && !fs.existsSync(configFile.tempory_folder)) fs.mkdirSync(configFile.tempory_folder, { recursive: true })
  }

  credentialsShouldExist(configFile) {
    const {sandbox} = configFile
    try {
      console.log(`Checking if credentials.json exists`)
      if (sandbox.credentials_path) {
        if (fs.existsSync(sandbox.credentials_path)) {
          const credentials = require(path.resolve(sandbox.credentials_path))
          console.log(`[OK] Credentials`)
          return !!credentials
        }
      }
      throw new Error()
    } catch (err) {
      throw new Error(`Credentials files should exists, and it doesn exists on path "${sandbox.credentials_path}"`)
    }
  }

  configFileExists(configPath, relativePath = null) {
    let path = []
    if(relativePath) path.push(path)
    path.push(configPath)
    return fs.existsSync(path.join(...path).trim())
  }

  sandboxFolderExistsWithContent(configFile) {
    const {sandbox, tempory_folder} = configFile
    const sandboxFolder = path.join(tempory_folder, sandbox.name, 'kub-sandbox', 'apps')
    if (fs.existsSync(sandboxFolder)) {
      const files = fs.readdirSync(sandboxFolder)
      return files.length > 0
    }
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