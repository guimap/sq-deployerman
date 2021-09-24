const fs = require('fs')
const path = require('path')
const { execFile } = require('child_process')
const yaml = require('yaml')
const lodash = require('lodash')

const RequirementsHelper = require('../Helpers/RequirementsHelper')
const DNSHelper = require('../Helpers/DNSHelper')
const { deepStrictEqual } = require('assert')
const { stderr } = require('chalk')
const { config } = require('dotenv')
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
      const newNamespace = sandboxName
      //  Create folder
      const pathToSave = `${tempory_folder}/${sandboxName}`
      if (!fs.existsSync(pathToSave)) {
        fs.mkdirSync(pathToSave)
      }
      
      const kubFolderSandbox = path.join(pathToSave, 'kub-sandbox')
      if (!fs.existsSync(kubFolderSandbox)) fs.mkdirSync(kubFolderSandbox)
      
      //  Create YAML namespace
      await createNamespaceYaml(configFile, kubFolderSandbox, newNamespace)

      // await downloadYamls(configFile, `${pathToSave}/kub-reference`)
      const { domains } = await createModifyYaml(configFile, `${pathToSave}/kub-reference`, kubFolderSandbox, newNamespace)
      console.log(domains, kubFolderSandbox)

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

async function createNamespaceYaml (configFile, folderToSave, namespaceName) {
  const namespaceSpec = {
    apiVersion: 'v1',
    kind: 'Namespace',
    metadata: {
      name: namespaceName,
      labels: {
        name: namespaceName,
        generatedBy: 'deployerman'
      }
    }
  }
  const yamlContent = yaml.stringify(namespaceSpec)
  return new Promise((resolve, reject) => {
    try {
      fs.writeFileSync(`${folderToSave}/${namespaceName}-namespace.yml`, yamlContent)
      resolve(true)
    } catch(err) {
      reject(err)
    }
  })
}

async function createModifyYaml(configFile, yamlFolder, kubFolderSandbox, newNamespace) {
  const fieldsToDelete = [
    'metadata.uid',
    'metadata.selfLink',
    'metadata.resourceVersion',
    'metadata.generation',
    'metadata.creationTimestamp'
  ]
  if (!fs.existsSync(kubFolderSandbox)) fs.mkdirSync(kubFolderSandbox)

  const domainsToCreate = []
  const nameSandbox = configFile.sandbox.name

  //  Ingress Modify
  const ingressFiles = fs.readdirSync(path.join(yamlFolder, 'ingress'))
  for(const yamlPath of ingressFiles) {

    const yamlContent = fs.readFileSync(path.join(yamlFolder, 'ingress', yamlPath)).toString()
    const parsedYaml = yaml.parse(yamlContent)
    parsedYaml.metadata.namespace = newNamespace
    parsedYaml.metadata.labels = {
      ...parsedYaml.metadata.labels,
      generatedBy: 'deployerman'
    }
  
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
  const deploymentsFiles = fs.readdirSync(path.join(yamlFolder, 'deployments'))
  for (const deploymentPath of deploymentsFiles) {
    const yamlContent = fs.readFileSync(path.join(yamlFolder, 'deployments', deploymentPath)).toString()
    const parsedYaml = yaml.parse(yamlContent)
    parsedYaml.metadata.namespace = newNamespace
    parsedYaml.metadata.labels = {
      ...parsedYaml.metadata.labels,
      generatedBy: 'deployerman'
    }
    
    for(const removeField of fieldsToDelete) {
      lodash.unset(parsedYaml, removeField)
    }
    const namePod = parsedYaml.metadata.name.replace(/\-\w+$/, '')
    console.log(parsedYaml )
    if (!fs.existsSync(path.join(kubFolderSandbox, namePod))) {
      fs.mkdirSync(path.join(kubFolderSandbox, namePod))
    }
    const newYamlContent = yaml.stringify(parsedYaml)
    fs.writeFileSync(path.join(kubFolderSandbox, namePod, `${namePod}-deployment.yml`), newYamlContent)
  }


  //  Service Modify
  const servicesFiles = fs.readdirSync(path.join(yamlFolder, 'services'))
  for (const deploymentPath of servicesFiles) {
    const yamlContent = fs.readFileSync(path.join(yamlFolder, 'services', deploymentPath)).toString()
    const parsedYaml = yaml.parse(yamlContent)
    parsedYaml.metadata.namespace = newNamespace
    parsedYaml.metadata.labels = {
      ...parsedYaml.metadata.labels,
      generatedBy: 'deployerman'
    }
    
    for(const removeField of fieldsToDelete) {
      lodash.unset(parsedYaml, removeField)
    }
    const namePod = parsedYaml.metadata.name.replace(/\-\w+$/, '')
    console.log(parsedYaml )
    if (!fs.existsSync(path.join(kubFolderSandbox, namePod))) {
      fs.mkdirSync(path.join(kubFolderSandbox, namePod))
    }
    const newYamlContent = yaml.stringify(parsedYaml)
    fs.writeFileSync(path.join(kubFolderSandbox, namePod, `${namePod}-svc.yml`), newYamlContent)
  }


  console.log('Done..')
  return {
    domains: domainsToCreate,
    savedFolder: kubFolderSandbox
  }
}