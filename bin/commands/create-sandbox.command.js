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
const KubernetesDuplicater = require('../Helpers/KubernetesDuplicater')


let dnsHelper
let githubHelper
let dockerHelper
let kubernetesDuplicater

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


async function duplicateFrontend(configFile, pathToSave, domains) {
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
      } = await githubHelper.pullBranch({ repo, branch }, pathToSave)
      const { parsed } = require('dotenv').config({
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
      const newRouteFileContent = domainsWithouPrefix.reduce((str, { pureDomain, newDomain }) => {
        str = str.replace(new RegExp(`(https|http).*${pureDomain}`, 'ig'), `https://${newDomain}`)
        return str
      }, routeFileContent)

      fs.writeFileSync(fileEndpointPath, newRouteFileContent)
      //  Gerar um dockerfile
      const isTs = endpointFile.includes('.ts')

      console.log(`Gerando Dockerfile...`)
      const { imageTag } = dockerHelper.pushImage(
        localRepoPath,
        { ...envContent, ...configFile.google },
        configFile.sandbox.name,
        frontendRepo.build_commands,
        {
          nodeTag: frontendRepo.node_tag || 'erbium',
          buildFolder: isTs ? 'dist/' : 'build',
          commit
        }
      )
      //  Adicionar a img no repository
      const domainFrontEnd = `${configFile.sandbox.name}-${frontendRepo.domainPrefix}.squidit.com.br`
      domains.push(domainFrontEnd)

      envContent.IMAGE_TAG = imageTag
      envContent.REACT_APP_PRODUCTION_HOST = `${domainFrontEnd}`
      envContent.REACT_APP_API_VERSION = `v1`

      //  Add .env into folder
      const envPath = path.join(localRepoPath, '.env')
      const envContentString = Object.keys(envContent).reduce((content, key) => {
        content += `${key}=${envContent[key]}\n`
        return content
      })
      fs.writeFileSync(envPath, envContentString)

      console.log(`Dando push no arquivo ${path.join(binariesFolder, `push-image-docker.sh`)} ${[repoName, imageTag].join(' ')}`)
      execFileSync(path.join(binariesFolder, `push-image-docker.sh`), [repoName, imageTag], { cwd: localRepoPath })
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

async function applyKubFolder(kubFolder) {
  const pathBinary = path.join(path.resolve(__dirname, '..'), 'binaries')
  const command = `${pathBinary}/apply-kub.sh`
  return execFileSync(command, [`./${kubFolder}`], { cwd: path.resolve(__dirname, '..', '..') })
}