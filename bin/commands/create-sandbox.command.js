const fs = require('fs')
const path = require('path')
const { execFile } = require('child_process')
const yaml = require('yaml')
const lodash = require('lodash')

const RequirementsHelper = require('../Helpers/RequirementsHelper')
const DNSHelper = require('../Helpers/DNSHelper')
const { deepStrictEqual } = require('assert')
const { stderr } = require('chalk')
module.exports = {
  command: 'create-sandbox',
  describe: 'Cria um ambiente isolado em um namespace',
  example: '$0 init -c ./config.json',
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

      const dnsHelper = new DNSHelper(configFile)
      const sandboxName = sandbox.name
      //  Create folder
      const pathToSave = `${tempory_folder}/${sandboxName}`
      if (!fs.existsSync(pathToSave)) {
        fs.mkdirSync(pathToSave)
      }

      const newNamespacce = configFile.sandbox.name
      //  Create YAML namespace


      // await downloadYamls(configFile, `${pathToSave}/kub-copy`)
      await createModifyYaml(configFile, `${pathToSave}/kub-copy`, newNamespacce)

      // await dnsHelper.addDomain(`${sandboxName}-app.squidit.com.br.`)
    } catch (err) {
      console.log(err)
    }
  }
}

async function downloadYamls (configFile, pathToSave) {
  const namespace = configFile.sandbox.namespace_reference
  const pathBinary = path.join(path.resolve(__dirname, '..'), 'binaries')

  console.log('Downloading deployments...')
  await runFile(`${pathBinary}/download-deployments.sh ${namespace} ${pathToSave}`),
  console.log('Downloaded deployments...')

  console.log('Downloading Ingress...')
  await runFile(`${pathBinary}/download-ingress.sh ${namespace} ${pathToSave}`)
  console.log('Downloaded Ingress...')

  console.log('Downloading Services...')
  await runFile(`${pathBinary}/download-service.sh ${namespace} ${pathToSave}`)
  console.log('Downloaded Services...')
  
}

function runFile(execPath) {
  const [command, ...args] = execPath.split(' ')
  return new Promise((resolve, reject) => {
    execFile(command, args, (err, stdout) => {
      if (err) {
        console.log(err)
        return reject(new Error(`Falha ao executar o arquivo ${execPath}`))
      }
      resolve(true)
    })
    // process.on('data', console.log)
    // process.on('close', (code) => {
    // })
  })
}

async function createModifyYaml(configFile, yamlFolder, newNamespacce) {
  const kubFolderSandbox = path.join(configFile.tempory_folder, 'kub-sandbox')
  if (!fs.existsSync(kubFolderSandbox)) fs.mkdirSync(kubFolderSandbox)
  const domainsToCreate = []

  //  Ingress Modify
  const ingressFiles = fs.readdirSync(path.join(yamlFolder, 'ingress'))
  const nameSandbox = configFile.sandbox.name
  for(const yamlPath of ingressFiles) {

    const yamlContent = fs.readFileSync(path.join(yamlFolder, 'ingress', yamlPath)).toString()
    const parsedYaml = yaml.parse(yamlContent)
    parsedYaml.metadata.namespace = newNamespacce
    const fieldsToDelete = [
      'metadata.uid',
      'metadata.selfLink',
      'metadata.resourceVersion',
      'metadata.generation',
    ]
    for(const removeField of fieldsToDelete) {
      lodash.unset(parsedYaml, removeField)
    }
    const namePod = parsedYaml.metadata.name.replace(/\-\w+$/, '')

    //  Create folder of project
    if (!fs.existsSync(path.join(kubFolderSandbox, namePod))) {
      fs.mkdirSync(path.join(kubFolderSandbox, namePod))
    }

    const newDomain = `${nameSandbox}-${namePod}.squidit.com.br`

    //  Replace to new dns
    parsedYaml.spec.rules = parsedYaml.spec.rules.map(rule => {
      return {
        ...rule,
        host: newDomain
      }
    })

    parsedYaml.spec.tls = parsedYaml.spec.tls.map(rule => {
      if (!rule.hosts) return rule
      return {
        ...rule,
        hosts: rule.hosts.map(() => newDomain)
      }
    })
    domainsToCreate.push(newDomain)
    
    const newYamlContent = yaml.stringify(parsedYaml)
    fs.writeFileSync(path.join(kubFolderSandbox, namePod, `${namePod}-ingress.yml`), newYamlContent)
  }


  //  Deployment Modify



  //  Service Modify

  console.log('Done..')
  return {
    domains: domainsToCreate
  }
}