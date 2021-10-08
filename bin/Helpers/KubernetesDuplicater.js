const path = require('path')
const fs = require('fs')
const { URL } = require('url')
const yaml = require('yaml')
const lodash = require('lodash')
const nunjuncks = require('nunjucks')
const { execFile, execFileSync } = require('child_process')
const environment = require('nunjucks/src/environment')
class KubernetesDuplicater {
  constructor(configFile, { githubHelper, dockerHelper, dnsHelper }) {
    this.githubHelper = githubHelper
    this.dockerHelper = dockerHelper
    this.dnsHelper = dnsHelper

    this.configFile = configFile
    this.sandboxName = configFile.sandbox.name
    this.newNamespace = configFile.sandbox.name
    this.basePath = configFile.tempory_folder
    this.domainsToCreate = []
    const sandboxYamlFolder = path.join(this.basePath, this.sandboxName)
    this.sandboxFolder = path.join(this.basePath, this.sandboxName)
    this.kubFolderSandboxApps = path.join(this.sandboxFolder, 'kub-sandbox', 'apps')
    this.kubFolderSandboxNamespace = path.join(this.sandboxFolder, 'kub-sandbox', 'namespace')
    this.kubReferencersFolder = path.join(sandboxYamlFolder, 'kub-reference')
  }

  async duplicate() {
    console.log(`Creating namespace...`)

    this.createSandboxFolder(this.sandboxFolder)
    await this.createNamespaceYaml(this.sandboxFolder, this.newNamespace)
    //  Duplicate APIs
    await this.duplicateAPI()
    //  Duplicando Frontend
    await this.duplicateFrontEnd()

    console.log(`Apply YAML to sandbox`)
    await this.applyKubFolder(path.join(this.sandboxFolder, 'kub-sandbox'))

    //  Create DNS
    console.log(`Creating DNS`)
    await this.dnsHelper.addDomains(this.domainsToCreate)


  }


  createSandboxFolder(pathToSave) {
    this.kubFolderSandboxApps = path.join(pathToSave, 'kub-sandbox', 'apps')
    this.kubNamespaceFolder = path.join(pathToSave, 'kub-sandbox', 'namespace')
    if (!fs.existsSync(this.kubFolderSandboxApps)) fs.mkdirSync(this.kubFolderSandboxApps, { recursive: true })
    if (!fs.existsSync(this.kubNamespaceFolder)) fs.mkdirSync(this.kubNamespaceFolder, { recursive: true })
  }

  async createNamespaceYaml (basePath, namespaceName) {
    const folderToSave = this.kubFolderSandboxNamespace
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
  
  async duplicateAPI(){
    await this.downloadYamls(this.kubReferencersFolder)
    this.createModifyYaml()
  }


  
  async duplicateFrontEnd() {
    //  Baixar os dois projetos de front
    const frontEndRepos = this.configFile.sandbox.frotend_repos
    if (!frontEndRepos) return

    for (const frontendRepo of frontEndRepos) {
      try {
        const { endpointFile, repo, branch } = frontendRepo
        console.log(`Clonando ${repo}...`)
        //  Adicionar a img no repository
        
        const { localRepoPath, repoName, commit } = await this.githubHelper.pullBranch({repo, branch}, this.sandboxFolder)
        
        const domainFrontEnd = `${this.sandboxName}-${frontendRepo.domainPrefix}.squidit.com.br`
        this.domainsToCreate.push(domainFrontEnd)
        //  Load .env of project
        const {parsed} = require('dotenv').config({
          path: frontendRepo.envFile
        })
        
        const envContent = {
          ...parsed,
          ...this.configFile.google,
          KUB_SERVICE: frontendRepo.kubServiceName,
          KUB_SERVICE_PORT: 80,
          WERCKER_GIT_COMMIT: commit,
          REPOSITORY_NAME: repoName,
          HPA_MIN_PODS: 1,
          HPA_MAX_PODS: 1,
          GCR_HOST: this.configFile.google.GCR_HOST,
          GCR_PROJECT_ID: this.configFile.google.GCR_PROJECT_ID,
          REACT_APP_API_VERSION: `v1`,
          REACT_APP_PRODUCTION_HOST: `${domainFrontEnd}`
        }
        //  Overwrite endpoint file
        this.ovewriteRoutFile({ projectPath: localRepoPath, endpointFile })
 
        //  Add .env into folder
        const envPath = path.join(localRepoPath, '.env')
        const envContentString = Object.keys(envContent).reduce((content, key) => {
          content+=`${key}=${envContent[key]}\n`
          return content
        })
        fs.writeFileSync(envPath, envContentString)

        //  Gerar um dockerfile
        const imageTag = this.createImage(envContent, { localRepoPath, frontendRepo, commit, repoName, endpointFile})
        envContent.IMAGE_TAG = imageTag

      
        this.createFrontendYaml(localRepoPath, frontendRepo, envContent, domainFrontEnd)


        console.log('done')
      } catch (err) {
        console.log(err)
      }
    }
  }

  createImage (env, {localRepoPath, frontendRepo, commit, repoName}) {
    const anyTypescriptFile = fs.readdirSync(`${localRepoPath}/src`).filter(file => file.endsWith('.ts')).length > 0
    let buildFolder = 'build'
    if (anyTypescriptFile) buildFolder = 'dist/'

    console.log(`Gerando Dockerfile...`)
    const { imageTag } = this.dockerHelper.pushImage(
      localRepoPath,
      env,
      this.sandboxName,
      frontendRepo.build_commands,
      {
        nodeTag: frontendRepo.node_tag || 'erbium',
        buildFolder,
        commit,
        repoName
      }
    )

    return imageTag
  }

  ovewriteRoutFile ({projectPath, endpointFile}) {
    const endpointFilePath = path.join(projectPath, endpointFile)
    const routeFileContent = fs.readFileSync(endpointFilePath).toString()
    const domainsWithouPrefix = this.domainsToCreate.map(domain => {
      return {
        pureDomain: domain.replace(/\w+(\-)/, ''),
        newDomain: domain
      }
    })
    const newRouteFileContent = domainsWithouPrefix.reduce((str, {pureDomain, newDomain}) => {
      str = str.replace(new RegExp(`(https|http).*${pureDomain}`, 'ig'), `https://${newDomain}`)
      return str
    }, routeFileContent)
    fs.writeFileSync(endpointFilePath, newRouteFileContent)
  }

  createFrontendYaml (projectPath, frontendRepo, env, domainFrontEnd) {
    const nunjucksOpts = {
      tags: {
        variableStart: '${',
        variableEnd: '}'
      }
    }
    const kubFolder = path.join(projectPath, 'kub')
    const kubFilesTemplate = fs.readdirSync(kubFolder).filter(file => file.endsWith('yml.template'))

    const yamlFrontendRepo = path.join(this.sandboxFolder, 'kub-sandbox', 'apps', frontendRepo.kubServiceName)
    if (!fs.existsSync(yamlFrontendRepo)) fs.mkdirSync(yamlFrontendRepo)

    for (const file of kubFilesTemplate) {
      const yamlPath = path.join(kubFolder, file)
      const yamlNunjucks = nunjuncks.configure(yamlPath, nunjucksOpts)

      const yamlContent = fs.readFileSync(yamlPath).toString()
      const yamlParsed = yamlNunjucks.renderString(yamlContent, {
        ...env
      })

      const refYaml = yaml.parse(yamlParsed)
      refYaml.metadata.namespace = this.newNamespace
      refYaml.metadata = {
        ...refYaml.metadata,
        labels: {
          ...refYaml.metadata.labels,
          generatedBy: 'deployerman'
        }
      }
      //  Tipo ingress
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

      const kubFilePath = path.join(yamlFrontendRepo, file.replace('.template', ''))
      fs.writeFileSync(kubFilePath, yaml.stringify(refYaml))
    }

    console.log('YAML Criado')
    
  }

  async downloadYamls (pathToSave) {
    const namespace = this.configFile.sandbox.namespace_reference
    const pathBinary = path.join(path.resolve(__dirname, '..'), 'binaries')
  
    console.log('Downloading deployments...')
    await this.runFile(`${pathBinary}/download-deployments.sh ${namespace} ${pathToSave}`),
    // console.log('Downloaded deployments...')
  
    console.log('Downloading Ingress...')
    await this.runFile(`${pathBinary}/download-ingress.sh ${namespace} ${pathToSave}`)
    // console.log('Downloaded Ingress...')
  
    console.log('Downloading Services...')
    await this.runFile(`${pathBinary}/download-service.sh ${namespace} ${pathToSave}`)
    // console.log('Downloaded Services...')
    
  }
  
  runFile(execPath) {
    const [command, ...args] = execPath.split(' ')
    return new Promise((resolve, reject) => {
      execFile(command, args, (err, stdout) => {
        if (err) {
          console.log(err)
          return reject(new Error(`Falha ao executar o arquivo ${execPath}`))
        }
        resolve(true)
      })
    })
  }

  createModifyYaml() {
    const fieldsToDelete = [
      'metadata.uid',
      'metadata.selfLink',
      'metadata.resourceVersion',
      'metadata.generation',
      'metadata.creationTimestamp',
      'spec.clusterIP',
      'spec.externalTrafficPolicy'
    ]
    // if (!fs.existsSync(kubFolderSandbox)) fs.mkdirSync(kubFolderSandbox)
  
    
    // const sandboxYamlFolder = path.join(this.kubNamespaceFolder)
    //  Ingress Modify
    this.domainsToCreate = this.createModifiedIngress(this.kubReferencersFolder, fieldsToDelete)
  
    //  Deployment Modify
    this.createModifiedDeployment(this.kubReferencersFolder, fieldsToDelete)
    
    //  Service Modify
    this.createModifiedServices(this.kubReferencersFolder, fieldsToDelete)
    
  
  
    console.log('Done..')
  }



  createModifiedIngress(yamlFolder, fieldsToDelete) {
    const domains = []
    const ingressFiles = fs.readdirSync(path.join(yamlFolder, 'ingress'))
    for(const yamlPath of ingressFiles) {
  
      const yamlContent = fs.readFileSync(path.join(yamlFolder, 'ingress', yamlPath)).toString()
      if (!yamlContent) continue
      const parsedYaml = yaml.parse(yamlContent)
      const namePod = this.getNamePod(parsedYaml.metadata.name)
      const [nameProject] = namePod.split('-')
      const newName = namePod.replace(/\-\w+/, `-${this.configFile.sandbox.name}`)
      parsedYaml.metadata.namespace = this.newNamespace
      parsedYaml.metadata.labels = {
        ...parsedYaml.metadata.labels,
        generatedBy: 'deployerman'
      }
    
      for(const removeField of fieldsToDelete) {
        lodash.unset(parsedYaml, removeField)
      }

      const [nameFile] = yamlPath.split(',')
      if (yamlPath.includes('patinhas')) {
        console.log('ae')
      }
      const domain = nameFile.replace(/\w+\-/, '').replace('.yml', '')
  
      const newDomain = `${this.sandboxName}-${domain}`
  
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
      
      const newYamlContent = yaml.stringify(parsedYaml)
        .replace(new RegExp(namePod,'ig'), newName)
        .replace(new RegExp(`\\b${nameProject}\\-\\w+$`, 'igm'), `${nameProject}-${namePod.replace(/\-\w+/, `-${this.configFile.sandbox.name}`)}`)
      const projectFolder = path.join(this.kubFolderSandboxApps, namePod)
      this.createFolderIfNotExists(projectFolder)
      fs.writeFileSync(path.join(projectFolder, `${namePod}-ingress.yml`), newYamlContent)

      domains.push(newDomain)
    }
    return domains
  }

  createModifiedDeployment(yamlFolder, fieldsToDelete) {
    const deploymentsFiles = fs.readdirSync(path.join(yamlFolder, 'deployments'))
    for (const deploymentPath of deploymentsFiles) {
      const yamlContent = fs.readFileSync(path.join(yamlFolder, 'deployments', deploymentPath)).toString()
      if (!yamlContent) continue
      const parsedYaml = yaml.parse(yamlContent)
      const namePod = this.getNamePod(parsedYaml.metadata.name)
      const [nameProject] = namePod.split('-')
      const newName = namePod.replace(/\-\w+/, `-${this.configFile.sandbox.name}`)
      parsedYaml.metadata.namespace = this.newNamespace
      parsedYaml.metadata.labels = {
        ...parsedYaml.metadata.labels,
        generatedBy: 'deployerman'
      }
      
      for(const removeField of fieldsToDelete) {
        lodash.unset(parsedYaml, removeField)
      }
      

      //  Get envs
      
      const containers = lodash.get(parsedYaml, 'spec.template.spec.containers', [])
      if (containers.length) {
        for (const container of containers) {
          const enviroments = container.env || []
          for (const environment of enviroments) {
            if (this.isDomainSquidit(environment.value)) {
              if (environment.value.includes('.squidit')) environment.value = environment.value.replace(/((http[s]*)\:\/)*\w+\-/ig, `${this.newNamespace}-`)
              else environment.value = environment.value.replace(/\-\w+/,  `-${this.newNamespace}`)
            }
          }
        }
      }


      const projectFolder = path.join(this.kubFolderSandboxApps, namePod)
      this.createFolderIfNotExists(projectFolder)
      const newYamlContent = yaml.stringify(parsedYaml)
        .replace(new RegExp(namePod,'ig'), newName)
        .replace(new RegExp(`\\b${nameProject}\\-\\w+$`, 'igm'), `${nameProject}-${this.configFile.sandbox.name}`)
      
      fs.writeFileSync(path.join(this.kubFolderSandboxApps, namePod, `${namePod}-deployment.yml`), newYamlContent)
    }
  }

  createModifiedServices(yamlFolder, fieldsToDelete) {
    const servicesFiles = fs.readdirSync(path.join(yamlFolder, 'services'))
    for (const deploymentPath of servicesFiles) {
      const yamlContent = fs.readFileSync(path.join(yamlFolder, 'services', deploymentPath)).toString()
      if (!yamlContent) continue
      const parsedYaml = yaml.parse(yamlContent)
      const namePod = this.getNamePod(parsedYaml.metadata.name)
      const [nameProject] = namePod.split('-')
      const newName = namePod.replace(/\-\w+/, `-${this.configFile.sandbox.name}`)
      parsedYaml.metadata.namespace = this.newNamespace
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
      
      

      const projectFolder = path.join(this.kubFolderSandboxApps, namePod)
      this.createFolderIfNotExists(projectFolder)
      const newYamlContent = yaml.stringify(parsedYaml)
        .replace(new RegExp(namePod,'ig'), newName)
        .replace(new RegExp(`\\b${nameProject}\\-\\w+$`, 'igm'), `${nameProject}-${this.configFile.sandbox.name}`)
      fs.writeFileSync(path.join(this.kubFolderSandboxApps, namePod, `${namePod}-svc.yml`), newYamlContent)
    }
  }

  createFolderIfNotExists(path) {
    if (!fs.existsSync(path)) fs.mkdirSync(path)
  }
  
  getNamePod(podName) {
    return podName.replace(/\-\w+$/, '')
  }

  applyKubFolder(kubFolder) {
    const pathBinary = path.join(path.resolve(__dirname, '..'), 'binaries')
    const command = `${pathBinary}/apply-kub.sh`
    return execFileSync(command, [`./${kubFolder}`], { cwd: path.resolve(__dirname, '..', '..') } )
  }

  isDomainSquidit(url) {
    try {
      new URL(url)
      const rgxIsSquid = /http[s]*\:\/\/\w+(\.squidit|\-\w+)/gm
      return rgxIsSquid.exec(url)
    } catch (err) {
      return false
    }
  }

  parseToURL(url) {
    try {
      return new URL(url)
    } catch (err) {
      return null
    }
  }
}

module.exports = KubernetesDuplicater