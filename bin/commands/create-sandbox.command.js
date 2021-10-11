const fs = require('fs')

const RequirementsHelper = require('../Helpers/RequirementsHelper')
const DNSHelper = require('../Helpers/DNSHelper')
const GithubHelper = require('../Helpers/GithubHelper')
const DockerHelper = require('../Helpers/DockerHelper')
const KubernetesDuplicater = require('../Helpers/KubernetesDuplicater')


let dnsHelper
let githubHelper
let dockerHelper
let kubernetesDuplicater

module.exports = {
  command: 'create-sandbox',
  describe: 'Cria um ambiente isolado em um namespace',
  example: '$0 create-sandbox -c ./config.json',
  alias: ['c', 'config'],
  describeFunction: (yargs) => {
    return yargs.positional('config', {
      describe: 'path of file config.json'
    })
  },
  help: true,
  run: async (argv) => {
    const requirementHelper = new RequirementsHelper('create-sandbox')
    try {
      const configFile = await requirementHelper.checkAllRequirements(argv.config)
      const {
        tempory_folder,
        sandbox
      } = configFile

      dnsHelper = new DNSHelper(configFile)
      githubHelper = new GithubHelper(configFile)
      dockerHelper = new DockerHelper(configFile)
      kubernetesDuplicater = new KubernetesDuplicater(configFile, {
        githubHelper,
        dockerHelper,
        dnsHelper
      })

      const sandboxName = sandbox.name
      const newNamespace = sandboxName
      //  Create folder
      const pathToSave = `${tempory_folder}/${sandboxName}`
      if (!fs.existsSync(pathToSave)) {
        fs.mkdirSync(pathToSave)
      }
      await kubernetesDuplicater.duplicate()

    } catch (err) {
      console.log(err)
    }
  }
}
