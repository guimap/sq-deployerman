class DockerBuilder {
  
  constructor() {
    this.dockerfileContent = ''
    this.from = ''
    this.workdir = ''
    this.copy = []
    this.run = []
    this.expose = ''
    this.cmds = []
    this.entryPoint = ''
  }

  setFrom(image, version, alias = '') {
    this.dockerfileContent += `FROM gcr.io/squid-apis/${image}:${version || 'latest'} ${alias ? `as ${alias}` : '' }\n`
    return this
  }

  setWorkdir (workdir) {
    this.dockerfileContent += `WORKDIR ${workdir}\n`
    return this
  }

  setExposePort (expose) {
    this.dockerfileContent += `EXPOSE ${expose} \n`
    return this
  }

  setEntryPoint(entryPoint) {
    this.dockerfileContent += `ENTRYPOINT ${entryPoint} \n`
    return this
  }

  addCopyCommand(command) {
    this.dockerfileContent += `COPY ${command} \n`
    return this
  }
 
  addRunCommand (command) {
    this.dockerfileContent += `RUN ${command} \n`
    return this
  }

  addCmdCommand (command) {
    this.dockerfileContent += `CMD ${command} \n`
    return this
  }

  build() {
    return this.dockerfileContent
  }


}

module.exports = DockerBuilder