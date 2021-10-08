const fs = require('fs')
const yaml = require('yaml')
const path = require('path')
const DockerBuilder = require('../builders/DockerBuilder')
const nunjuncks = require('nunjucks')
const {execFileSync} = require('child_process')

class DockerHelper {
  constructor(configFile) {
    this.configFile = configFile
  }

  pushImage (repoPath, env, imageTagPrefix, buildCommands = [], { nodeTag, buildFolder, commit, repoName }) {
    const typeNode = 'node'
    const tag = nodeTag

    const containerPort = env.CONTAINER_PORT
      
    let packageVersion = {}
    const packageJsonPath = path.resolve(path.join(repoPath, 'package.json'))
    if (fs.existsSync(packageJsonPath)) {
      packageVersion = require(packageJsonPath)
    }
    const version = packageVersion.version || '1.0.0'
    const imageTag = `deployerman-${imageTagPrefix}-${commit}-${version}`

    console.log('Criando arquivo Dockerfile')
    const dockerFileBuilder = new DockerBuilder()
    const dockerContent = dockerFileBuilder
      .setFrom(typeNode, tag, 'build')
      .setWorkdir('/pipeline/source/')
      .addCopyCommand('package.json ./')
      .addCopyCommand('. .')
      .addRunCommand('npm install')

    if (buildCommands && buildCommands.length) {
      for ( const command of buildCommands) {
        dockerContent.addRunCommand(command)
      }
    }

    dockerFileBuilder.setFrom('nginx', '1.13-alpine')
      .addCopyCommand('--from=build /pipeline/source/ /pipeline/source/')
      .addRunCommand(`sed -i -e "s/@PORT/${containerPort}/g" /pipeline/source/kub/nginx.conf`)
      .setEntryPoint(`nginx -c /pipeline/source/kub/nginx.conf -g "daemon off;"`)
      .setWorkdir(`/usr/share/nginx/html/${buildFolder}`)
      .setExposePort(containerPort||6789)
    //  gera um dockerfile
    fs.writeFileSync(`${repoPath}/Dockerfile`, dockerContent.build())

    //  da push na imagem
    console.log(`Dando push na imagem...`)
    const binariesFolder = path.join(path.resolve(__dirname, '../'), 'binaries')
    execFileSync(path.join(binariesFolder, `push-image-docker.sh`),[repoName, imageTag], { cwd: repoPath })
    return {
      imageTag
    }

  }

  getBoxInfo(repoPath, env) {
    const werckerYAMLPath = path.join(repoPath, 'wercker.yml')
    const rgx = /\$\w+/ig
    const werckerYmlString = fs.readFileSync(werckerYAMLPath).toString()
    const matchs = werckerYmlString.match(rgx)
    const werckerYmlContent = matchs.reduce((content, variable) => {
      const newKey = variable.replace('$', '{{') + '}}'
      return content.replace(variable, newKey)
    }, werckerYmlString)



    const matchResult = nunjuncks.renderString(werckerYmlContent, { ...env }).match(/(id\:\s+gcr.*)|(tag\:\s+.*)/g)
    const [idMatch, tagMatch] = matchResult
    const [, id] = idMatch.split(':')
    const [, tag] = tagMatch.split(':')
    return {
      id: id.trim(),
      tag: tag.trim()
    }
    
  }
}

module.exports = DockerHelper