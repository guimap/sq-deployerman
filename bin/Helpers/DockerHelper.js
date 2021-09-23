const fs = require('fs')
const yaml = require('yaml')
const path = require('path')
const DockerBuilder = require('../builders/DockerBuilder')
const nunjuncks = require('nunjucks')

class DockerHelper {
  constructor(configFile) {
    this.configFile = configFile
  }

  pushImage (repoPath, env) {
   

    // const werckerParsedContent = nunjuncks.renderString(werckerYmlContent, {...env})

    // const werkcerParse = yaml.parse(werckerParsedContent)
    const {
      id: typeNode,
      tag
    } = this.getBoxInfo(repoPath, env)

    const containerPort = env.CONTAINER_PORT
      


    const dockerFileBuilder = new DockerBuilder()
    const dockerContent = dockerFileBuilder
      .setFrom(typeNode, tag)
      .setWorkdir('/usr/src/app')
      .addCopyCommand('package*.json ./')
      .addRunCommand('npm install')
      .addCopyCommand('. .')
      .setExposePort(containerPort||6789)
      .setEntryPoint("npm start")
      .build()
    //  gera um dockerfile
    fs.writeFileSync(`${repoPath}/Dockerfile`, dockerContent)
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