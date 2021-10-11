const fs = require('fs')
const path = require('path')
const yaml = require('yaml')
const { execFileSync, exec, execSync } = require('child_process')
const nunjuncks = require('nunjucks')
const lodash = require('lodash')

class KubernetesHelper {
  constructor(configFile) {
    this.configFile = configFile
  }

  async applyDeployment(githubInfo, env, project) {
    const newNamespace = project.target_namespace || configFile.sandbox.name
    const {
      localRepoPath,
      commit,
      repoName
    } = githubInfo
    const yamlTemplatePath = path.join(localRepoPath, 'kub_template')
    const yamlKubPath = path.join(localRepoPath, 'kub')

    fs.renameSync(yamlKubPath, yamlTemplatePath)
    const yamlFiles = fs.readdirSync(yamlTemplatePath).sort((fileA, fileB) => {
      if (fileA.includes('deploy')) return -3
      if (fileB.includes('deploy')) return 3

      if (fileA.includes('service')) return -2
      if (fileB.includes('service')) return 2

      if (fileA.includes('ingress')) return -1
      if (fileB.includes('ingress')) return 1
      return 0
    })

    fs.mkdirSync(yamlKubPath)

    const nunjucksOpts = {
      tags: {
        blockStart: '<%',
        blockEnd: '%>',
        variableStart: '${',
        variableEnd: '}',
        commentStart: '<#',
        commentEnd: '#>'
      }
    }

    const packageJSON = fs.readFileSync(path.join(localRepoPath, 'package.json')).toString()
    const { version } = JSON.parse(packageJSON)
    let imageTagDocker = ''
    const {google} = this.configFile
    for(const prefix of [`-alpha-`, '-beta-', '-']) {
      const imageTag = `${version}${prefix}${commit}`
      const url = `${google.GCR_HOST}/${google.GCR_PROJECT_ID}/${repoName}`
      const exists = await this.existsImage(url, imageTag)
      if (exists) {
        imageTagDocker = imageTag
        break
      }
    }
    if (!imageTagDocker) throw new Error(`Cannot find an imagem from your current Image`)

    const fieldsToDelete = [
      'metadata.uid',
      'metadata.selfLink',
      'metadata.resourceVersion',
      'metadata.generation',
      'metadata.creationTimestamp',
      'spec.clusterIP',
      'spec.externalTrafficPolicy',
      'status'
    ]
    
    //  Parse yml
    for (const yamlFilePath of yamlFiles) {
      try {
        const yamlPath = path.join(yamlTemplatePath, yamlFilePath)
        const yamlNunjucks = nunjuncks
        .configure(yamlPath, nunjucksOpts)
        
        const yamlContent = fs.readFileSync(yamlPath).toString()
        const yamlParsed = yamlNunjucks.renderString(yamlContent, {
          ...env,
          WERCKER_GIT_COMMIT: commit,
          IMAGE_TAG: imageTagDocker,
          REPOSITORY_NAME: repoName
        })
        const yamlObject = yaml.parse(yamlParsed)
        const namePod = yamlObject.metadata.name
        const [nameProject] = namePod.split('-')
        const newName = namePod.replace(/\-\w+/, `-${newNamespace}`)
        yamlObject.metadata.namespace = newNamespace
        yamlObject.metadata.labels = {
          ...yamlObject.metadata.labels,
          generatedBy: 'deployerman'
        }

        if (yamlObject.kind === 'Ingress') {
          //  Remap DNS
          yamlObject.spec.rules = yamlObject.spec.rules.filter(rule => rule.host)
      
          yamlObject.spec.tls = yamlObject.spec.tls.map(rule => {
            if (!rule.hosts) return rule
            return {
              ...rule,
              hosts: rule.hosts.filter((host) => host)
            }
        })
        }

        for(const removeField of fieldsToDelete) {
          lodash.unset(yamlObject, removeField)
        }

        //  Write into kub folder
        const kubFilePath = path.join(yamlKubPath, yamlFilePath.replace('.template', ''))
        const yamlContentString = yaml.stringify(yamlObject)
        const newYamlContent = yamlContentString
          .replace(new RegExp(namePod,'ig'), newName)
          .replace(new RegExp(`\\b${nameProject}\\-\\w+$`, 'igm'), `${nameProject}-${newNamespace}`)
        fs.writeFileSync(kubFilePath, newYamlContent)
        //  apply command
        await this.applyFile(kubFilePath)
      } catch (err) {
        console.error(`Fail on ${yamlFilePath}`)
        console.error(err)
      }
      
    }

    console.log('Done')
  }

  async applyFile (file) {
    return new Promise((resolve, reject) =>{
      exec(`kubectl delete -f ${file}`, () => {
        exec(`kubectl apply -f ${file}`, (err, stdout) => {
          if (err) {
            // console.error(err.toString())
            reject(new Error(`Failed to apply kub file ${file}`))
          } else {
            // console.log(stdout)
            resolve(true)
          }
        })
      })
    })
  }

  existsImage (url, tag) {
    return new Promise(async (resolve) => {
      const basePathBinaries = path.join(path.resolve(__dirname, '..'), 'binaries')
      
      try {
        const output = execFileSync(`${basePathBinaries}/check-image.sh`, [url, tag])
        resolve(true)
      } catch (err) {
        resolve(false)
      }
    })
  }

  async deleteSandbox() {
    const {sandbox, tempory_folder} = this.configFile
    try {
      const sandboxKubFolder = path.join(tempory_folder, sandbox.name, 'kub-sandbox')
      const sandboxAppsFolder = path.join(sandboxKubFolder, 'apps')
      console.log('Dropping kub services...')
      if (this._hasFiles(sandboxAppsFolder)) {
        //  Execute drop command
        this.dropServices(sandboxKubFolder)
      } else {
        throw new Error(`There's no file into ${sandboxAppsFolder}, There's no way to drop current sandbox`)
      }
    } catch (err) {
      console.log(`Fail on delete kub services`)
      console.error(err)
    }
  }

  dropServices(directory) {
    const dropSandboxScript = path.resolve(__dirname, '..', 'binaries', 'delete-kub.sh')
    return execSync(`${dropSandboxScript} ${directory}`)
  }

  _hasFiles(folderPath) {
    const files = this.readDirRecursive(folderPath)
    return files.length > 0
  }

  readDirRecursive(dir, filesFounded = []) {
    const files = fs.readdirSync(dir)
    if (files.length) {
      for (const file of files) {
        const directory = path.join(dir, file)
        const stat = fs.statSync(directory)
        const isDirectory = stat.isDirectory()
        if (isDirectory) {
          this.readDirRecursive(directory, filesFounded)
          // filesFounded.push(...filesReaded)
        } else { // Is File
          filesFounded.push(directory)
        }
      }
    }
    return filesFounded
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
}

module.exports = KubernetesHelper