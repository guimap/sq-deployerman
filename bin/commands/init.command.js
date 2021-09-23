const fs = require('fs')
const path = require('path')
const GithubHelper = require('../Helpers/GithubHelper')
const DockerHelper = require('../Helpers/DockerHelper')
const RequirementsHelper = require('../Helpers/RequirementsHelper')
const KubernetesHelper = require('../Helpers/KubernetesHelper')

module.exports = {
  command: 'init',
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
    const githubProjectsFolderPath = path.join(__dirname, `githubprojects-${new Date().getTime()}`)
    try {

      const configFile = await requirementHelper.checkAllRequirements(argv.config)
      const githubHelper = new GithubHelper(configFile)
      // const dockerHelper = new DockerHelper(configFile)
      const kubernetesHelper = new KubernetesHelper(configFile)
      
      //  Get projects
      

      //  for each project pull branch
      for (const project of configFile.projects) {
        try {
          console.log(`Configuring ${project.repo}...`)
          if (!fs.existsSync(githubProjectsFolderPath)) {
            fs.mkdirSync(githubProjectsFolderPath)
          }

          //  Load envFile
          const {parsed} = require('dotenv')
          .config({
            path: project.envfile
          })
          const envContent = {
            ...parsed,
            CONTAINER_PORT: project.kubContainerPort,
            GCR_HOST: configFile.google.GCR_HOST,
            GCR_PROJECT_ID: configFile.google.GCR_PROJECT_ID,
            KUB_SERVICE: project.kubServiceName || parsed.KUB_SERVICE
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
          }, envContent)         
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
      fs.rmSync(githubProjectsFolderPath, { recursive: true })
    }

   

  }

}