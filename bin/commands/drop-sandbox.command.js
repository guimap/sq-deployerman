const RequirementsHelper = require('../Helpers/RequirementsHelper')
const DNSHelper = require('../Helpers/DNSHelper')
const KubernetesHelper = require('../Helpers/KubernetesHelper')

module.exports = {
  command: 'drop-sandbox',
  describe: 'Dropa o ambiente de sandbox, seguindo o config.json e a pasta criada pelo comando create-sandbox',
  example: '$0 drop-sandbox -c ./config.json',
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
      const {sandbox, tempory_folder} = configFile
      const kubernetesHelper = new KubernetesHelper(configFile)
      const dnsHelper = new DNSHelper(configFile)

      await kubernetesHelper.deleteSandbox()
      await dnsHelper.deleteDNS()
      console.log('Sucess')
    } catch (err) {
      console.error(err)
    }
  }
}