const fs = require('fs')
const path = require('path')
const { URL } = require('url')
const GithubHelper = require('../Helpers/GithubHelper')
const yaml = require('yaml')
const RequirementsHelper = require('../Helpers/RequirementsHelper')
const KubernetesHelper = require('../Helpers/KubernetesHelper')
const { execFileSync } = require('child_process')

module.exports = {
  command: 'apply-project',
  describe: 'Dado um objeto de configuração, faz deploy de branch especificas para um ns de k8 ja existente',
  example: '$0 init -c ./config.json',
  alias: ['c', 'config'],
  describeFunction: (yargs) => {
    return yargs.positional('config', {
      describe: 'path of file config.json'
    })
  },
  help: true,
  run: async (argv) => {
    const requirementHelper = new RequirementsHelper()
    let githubProjectsFolderPath
    try {
      
      const configFile = await requirementHelper.checkAllRequirements(argv.config)
      const githubHelper = new GithubHelper(configFile)
      // const dockerHelper = new DockerHelper(configFile)
      const kubernetesHelper = new KubernetesHelper(configFile)
      
      githubProjectsFolderPath = path.join(configFile.tempory_folder, `githubprojects-${new Date().getTime()}`)
      //  Get projects
      
      const binayFolderPath = path.join(path.resolve(__dirname, '..'), 'binaries')
      //  for each project pull branch
      for (const project of configFile.projects) {
        try {
          const {kubServiceName, kubNamespace, envFile} = project
          console.log(`Configuring ${project.repo}...`)
          if (!fs.existsSync(githubProjectsFolderPath)) {
            fs.mkdirSync(githubProjectsFolderPath)
          }

          //  Load envFile
          let parsed
          
          let envContent = {
            CONTAINER_PORT: project.kubContainerPort,
            GCR_HOST: configFile.google.GCR_HOST,
            GCR_PROJECT_ID: configFile.google.GCR_PROJECT_ID,
            HPA_MIN_PODS: 1,
            HPA_MAX_PODS: 1,
            CONTAINER_PORT: 6081,
            KUB_SERVICE_PORT: 80,
            KUB_SERVICE: project.kubServiceName || parsed.KUB_SERVICE
          }
          //  Get current yaml
          const pathToDownload = path.join(configFile.tempory_folder)
          const pathDeployYaml = path.join(pathToDownload, `${kubServiceName}-deploy.yaml`)
          execFileSync(`${binayFolderPath}/get-yaml.sh`, [kubServiceName, kubNamespace, pathToDownload, 'deploy'])
          const yamlContent = fs.readFileSync(pathDeployYaml).toString()


          const parsedYaml = yaml.parse(yamlContent)
          const [deployment] = parsedYaml.items
          if (deployment) {
            const container = deployment.spec.template.spec.containers.filter(container => !!container.env)[0]
            if (container) {
              //  Generate the .env
              const envObject = container.env.reduce((object, itemEnv) => {
                if (!itemEnv.value) return object
                let isURL = false
                try {
                  new URL(itemEnv.value)
                  isURL = true
                } catch (err) {

                }
                if (isURL) {
                  if (itemEnv.value.includes('.squidit.com.br')) {
                    itemEnv.value = itemEnv.value.replace(/((http[s]*)\:\/)*\w+\-/ig, `${configFile.sandbox.name}-`)
                  }
                }
                object[itemEnv.name] = itemEnv.value
                return object
              }, {})
              envContent = {
                ...envContent,
                ...envObject
              }
            }
          }

          const pathIngressYaml = path.join(pathToDownload, `${kubServiceName}-ingress.yaml`)
          execFileSync(`${binayFolderPath}/get-yaml.sh`, [kubServiceName, kubNamespace, pathToDownload, 'ingress'])
          const yamlIngressContent = fs.readFileSync(pathIngressYaml).toString()
          const results = yaml.parse(yamlIngressContent)
          const [yamlIngressParsed] = results.items
          const [firstRule] = yamlIngressParsed.spec.rules
          const domain = firstRule.host
          if (domain.includes('-')) {
            const newDomain = domain.replace(/\w+\-/, `${configFile.sandbox.name}-`)
            envContent.INGRESS_DOMAIN = newDomain
          }
          
          if (envFile) {
            parsed = require('dotenv')
            .config({
              path: envFile
            }).parsed
            envContent = {
              ...envContent,
              ...parsed
            }
          }

          const {
            localRepoPath,
            commit: currentCommit,
            repoName
          } = await githubHelper.pullBranch(project, githubProjectsFolderPath)

          await kubernetesHelper.applyDeployment({
            localRepoPath,
            commit: currentCommit,
            repoName
          }, envContent, project)         
        } catch (err) {
          console.error(err)
          //  Drop folder projects
          fs.rmSync(githubProjectsFolderPath, { recursive: true })
          break
        }
      }      
    } catch (err) {
      console.error(err)
    } finally {
      if (fs.existsSync(githubProjectsFolderPath)) {
        fs.rmSync(githubProjectsFolderPath, { recursive: true })
      }
    }

   

  }

}