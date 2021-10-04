const fs = require('fs')
const path = require('path')
const { URL } = require('url')
const { execFile, execFileSync, execSync, spawn } = require('child_process')
const yaml = require('yaml')
const nunjuncks = require('nunjucks')
const lodash = require('lodash')

const RequirementsHelper = require('../Helpers/RequirementsHelper')
const DNSHelper = require('../Helpers/DNSHelper')
const GithubHelper = require('../Helpers/GithubHelper')
const DockerHelper = require('../Helpers/DockerHelper')
const { deepStrictEqual } = require('assert')
const { stderr } = require('chalk')
const { config } = require('dotenv')


let dnsHelper
let githubHelper
let dockerHelper

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

      dnsHelper = new DNSHelper(configFile)
      githubHelper = new GithubHelper(configFile)
      dockerHelper = new DockerHelper(configFile)

      const sandboxName = sandbox.name
      const newNamespace = sandboxName
      //  Create folder
      const pathToSave = `${tempory_folder}/${sandboxName}`
      if (!fs.existsSync(pathToSave)) {
        fs.mkdirSync(pathToSave)
      }
      
      const kubFolderSandbox = path.join(pathToSave, 'kub-sandbox', 'apps')
      const kubNamespaceFolder = path.join(pathToSave, 'kub-sandbox', 'namespace')
      if (!fs.existsSync(kubFolderSandbox)) fs.mkdirSync(kubFolderSandbox, { recursive: true })
      if (!fs.existsSync(kubNamespaceFolder)) fs.mkdirSync(kubNamespaceFolder, { recursive: true })
      
      //  Create YAML namespace
      console.log(`Creating namespace...`)
      await createNamespaceYaml(configFile, kubNamespaceFolder, newNamespace)

      console.log(`Clone YAML References`)
      await downloadYamls(configFile, `${pathToSave}/kub-reference`)

      console.log(`Create modify yaml`)
      const { domains } = await createModifyYaml(configFile, `${pathToSave}/kub-reference`, kubFolderSandbox, newNamespace)


      //  Duplicate frontends
      console.log(`Clonning front projects and creating modify yaml`)
      await duplicateFrontend(configFile, pathToSave, domains)
      //  Apply
      console.log(`Apply YAML to sandbox`)
      await applyKubFolder(path.join(pathToSave, 'kub-sandbox'))
      // console.log(domains)
      console.log(`Creating DNS`)
      await dnsHelper.addDomains(domains)
      // console.log(domains)
      
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
    'metadata.creationTimestamp',
    'spec.clusterIP',
    'spec.externalTrafficPolicy'
  ]
  if (!fs.existsSync(kubFolderSandbox)) fs.mkdirSync(kubFolderSandbox)

  const domainsToCreate = []
  const nameSandbox = configFile.sandbox.name

  //  Ingress Modify
  const ingressFiles = fs.readdirSync(path.join(yamlFolder, 'ingress'))
  for(const yamlPath of ingressFiles) {

    const yamlContent = fs.readFileSync(path.join(yamlFolder, 'ingress', yamlPath)).toString()
    if (!yamlContent) continue
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
    const [nameFile] = yamlPath.split(',')
    const domain = nameFile.replace(/\w+\-/, '').replace('.yml', '')

    const newDomain = `${nameSandbox}-${domain}`

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
    if (!yamlContent) continue
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
    if (!yamlContent) continue
    const parsedYaml = yaml.parse(yamlContent)
    parsedYaml.metadata.namespace = newNamespace
    parsedYaml.metadata.labels = {
      ...parsedYaml.metadata.labels,
      generatedBy: 'deployerman'
    }
    parsedYaml.spec.ports = parsedYaml.spec.ports.map(port => {
      delete port.nodePort
      return port
    })
    for(const removeField of fieldsToDelete) {
      lodash.unset(parsedYaml, removeField)
    }
    const namePod = parsedYaml.metadata.name.replace(/\-\w+$/, '')
    
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

async function duplicateFrontend (configFile, pathToSave, domains) {
  //  Baixar os dois projetos de front
  if (!configFile.sandbox.frotend_repos) return

  const binariesFolder = path.join(path.resolve(__dirname, '../'), 'binaries')
  const newNamespace = configFile.sandbox.name

  const domainsWithouPrefix = domains.map(domain => {
    return {
      pureDomain: domain.replace(/\w+(\-)/, ''),
      newDomain: domain
    }
  })
  for (const frontendRepo of configFile.sandbox.frotend_repos) {
    try {
      const { endpointFile, repo, branch, envFile } = frontendRepo
      console.log(`Clonando ${repo}...`)
      const {
        localRepoPath,
        repoName,
        commit
      } = await githubHelper.pullBranch({repo, branch}, pathToSave)
      const {parsed} = require('dotenv').config({
        path: frontendRepo.envFile
      })

      const envContent = {
        ...parsed,
        KUB_SERVICE: frontendRepo.kubServiceName,
        KUB_SERVICE_PORT: 80,
        WERCKER_GIT_COMMIT: commit,
        REPOSITORY_NAME: repoName,
        HPA_MIN_PODS: 1,
        HPA_MAX_PODS: 1,
        GCR_HOST: configFile.google.GCR_HOST,
        GCR_PROJECT_ID: configFile.google.GCR_PROJECT_ID

      }
      //  Overwrite endpoint file
      const fileEndpointPath = path.join(localRepoPath, endpointFile)
      const routeFileContent = fs.readFileSync(fileEndpointPath).toString()
      const newRouteFileContent = domainsWithouPrefix.reduce((str, {pureDomain, newDomain}) => {
        str = str.replace(new RegExp(`(https|http).*${pureDomain}`, 'ig'), `https://${newDomain}`)
        return str
      }, routeFileContent)
      
      fs.writeFileSync(fileEndpointPath, newRouteFileContent)
      //  Gerar um dockerfile
      const isTs = endpointFile.includes('.ts')

      console.log(`Gerando Dockerfile...`)
      const { imageTag } = dockerHelper.pushImage(
        localRepoPath,
        {...envContent, ...configFile.google },
        configFile.sandbox.name,
        frontendRepo.build_commands,
        {
          nodeTag: frontendRepo.node_tag || 'erbium',
          buildFolder: isTs ? 'dist/' : 'build',
          commit
        }
      )
      //  Adicionar a img no repository
      const domainFrontEnd = `${configFile. sandbox.name}-${frontendRepo.domainPrefix}.squidit.com.br`
      domains.push(domainFrontEnd)

      envContent.IMAGE_TAG = imageTag
      envContent.REACT_APP_PRODUCTION_HOST = `${domainFrontEnd}`
      envContent.REACT_APP_API_VERSION = `v1`
      
      //  Add .env into folder
      const envPath = path.join(localRepoPath, '.env')
      const envContentString = Object.keys(envContent).reduce((content, key) => {
        content+=`${key}=${envContent[key]}\n`
        return content
      })
      fs.writeFileSync(envPath, envContentString)

      console.log(`Dando push no arquivo ${path.join(binariesFolder, `push-image-docker.sh`)} ${[repoName, imageTag].join(' ')}`)
      execFileSync(path.join(binariesFolder, `push-image-docker.sh`),[repoName, imageTag], { cwd: localRepoPath })
      //  Gera os yaml dentro da pasta kub/
     


      const kubBasePath = path.join(localRepoPath, 'kub')
      const kubFilesTemplate = fs.readdirSync(kubBasePath).filter(file => file.endsWith('yml.template'))
      const nunjucksOpts = {
        tags: {
          variableStart: '${',
          variableEnd: '}'
        }
      }
      const newYamlFile = path.join(pathToSave, 'kub-sandbox', 'apps', frontendRepo.kubServiceName)
      if (!fs.existsSync(newYamlFile)) fs.mkdirSync(newYamlFile)
      for (const file of kubFilesTemplate) {
        const yamlPath = path.join(kubBasePath, file)
        const yamlNunjucks = nunjuncks.configure(yamlPath, nunjucksOpts)

        const yamlContent = fs.readFileSync(yamlPath).toString()
        const yamlParsed = yamlNunjucks.renderString(yamlContent, {
          ...envContent
        })

        const refYaml = yaml.parse(yamlParsed)
        refYaml.metadata.namespace = newNamespace
        refYaml.metadata = {
          ...refYaml.metadata,
          labels: {
            ...refYaml.metadata.labels,
            generatedBy: 'deployerman'
          }
        }

        if (lodash.get(refYaml, 'spec.rules')) {

          //  Replace to new dns
          refYaml.spec.rules = refYaml.spec.rules.map(rule => {
            return {
              ...rule,
              host: domainFrontEnd
            }
          })

          refYaml.spec.tls = refYaml.spec.tls.map(rule => {
            if (!rule.hosts) return rule
            return {
              ...rule,
              hosts: rule.hosts.map(() => domainFrontEnd)
            }
          })
        }

        if (lodash.get(refYaml, 'spec.template.spec.containers')) {
          for (const container of refYaml.spec.template.spec.containers) {
            for (const env of container.env) {
              if (env.value && typeof env.value === 'string') {
                env.value = `"${env.value}"`
              }
            }
          }
        }

        const kubFilePath = path.join(newYamlFile, file.replace('.template', ''))
        fs.writeFileSync(kubFilePath, yaml.stringify(refYaml))
      }

      console.log('done')
    } catch (err) {
      console.log(err)
    }
  }
}

async function applyKubFolder (kubFolder) {
  const pathBinary = path.join(path.resolve(__dirname, '..'), 'binaries')
  const command = `${pathBinary}/apply-kub.sh`
  return execFileSync(command, [`./${kubFolder}`], { cwd: path.resolve(__dirname, '..', '..') } )
}