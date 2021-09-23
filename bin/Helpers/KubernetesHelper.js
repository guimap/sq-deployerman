const fs = require('fs')
const path = require('path')
const nunjuncks = require('nunjucks')
const {spawn, execSync, exec} = require('child_process')
const { Writable  } = require('stream')
const got = require('got')
const { stdout } = require('process')

class KubernetesHelper {
  constructor(configFile) {
    this.configFile = configFile
  }

  async applyDeployment(githubInfo, env) {
    const {
      localRepoPath,
      commit,
      repoName
    } = githubInfo
    const yamlTemplatePath = path.join(localRepoPath, 'kub_template')
    const yamlKubPath = path.join(localRepoPath, 'kub')

    fs.renameSync(yamlKubPath, yamlTemplatePath)
    const yamlFiles = fs.readdirSync(yamlTemplatePath)
      .filter(file => {
        return file.endsWith('deployment.yml.template')
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
    for(const prefix of [`'-alpha-'`, '-beta-', '-']) {
      const imageTag = `${version}${prefix}${commit}`
      const url = `${google.GCR_HOST}/${google.GCR_PROJECT_ID}/${repoName}:${imageTag}`
      const exists = await this.existsImage(url)
      if (exists) {
        imageTagDocker = imageTag
        break
      }

    }

    //  Parse yml
    for (const yaml of yamlFiles) {
      const yamlPath = path.join(yamlTemplatePath, yaml)
      const yamlNunjucks = nunjuncks
      .configure(yamlPath, nunjucksOpts)
      
      const yamlContent = fs.readFileSync(yamlPath).toString()
      const yamlParsed = yamlNunjucks.renderString(yamlContent, {
        ...env,
        WERCKER_GIT_COMMIT: commit,
        IMAGE_TAG: imageTagDocker,
        REPOSITORY_NAME: repoName
      })

      //  Write into kub folder
      const kubFilePath = path.join(yamlKubPath, yaml.replace('.template', ''))
      fs.writeFileSync(kubFilePath, yamlParsed)
      //  apply command
      await this.applyFile(kubFilePath)
    }

    console.log('Done')
  }

  async applyFile (file) {
    return new Promise((resolve, reject) =>{
      exec(`kubectl apply -f ${file}`, (err) => {
        if (err) {
          reject(new Error(`Failed to apply kub file ${file}`))
        } else {
          resolve(true)
        }
      })
    })
  }

  existsImage (url) {
    return new Promise(async (resolve) => {
      let response = ''

      exec(`docker manifest inspect ${url}`, (err, stdout) => {
        if (err) {
          resolve(false)
        } else {
          try {
            const result = JSON.parse(stdout)
            resolve(!!result)
          } catch (er) {
            resolve(false)
          }
        }
      })
    //   const process = spawn('docker', `manifest inspect ${url}`.split(' '), {stdio: ['pipe', writableOutput, writableError]})
    //   // process.stderr.on('data', () => resolve(false))
    //   // process.on('error', () => resolve(false))
      
    //   process.stdout.on('data', data => {
    //     response+=data.toString()
    //   })

    //   process.on('exit', code => {
    //     if(code !== 0) return resolve(false)
    //     try {
    //       const result = JSON.parse(response)
    //       resolve(!!result)
    //     } catch (er) {
    //       resolve(false)
    //     }
    //   })
    })
  }
}

module.exports = KubernetesHelper