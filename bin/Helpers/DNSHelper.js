const {DNS} = require('@google-cloud/dns')
const path = require('path')
const fs = require('fs')
const yaml = require('yaml')

class DNSHelper {
  constructor(configFile) {
    this.configFile = configFile

    this.dns = new DNS({
      keyFilename: configFile.sandbox.credentials_path,
      projectId: this.configFile.google.GCR_PROJECT_ID
      // keyFile: 
      // keyFile
    })
    this.zone = this.dns.zone('squidit')
  }

  async addDomains(domains) {
    const records = await this.getRecords()
    const recordsMap = records.reduce((map, record) => {
      map.set(record.name, record)
      return map
    }, new Map())
    const domainsWhichNotExists = domains.filter(domain => !recordsMap.has(domain))

    if (domainsWhichNotExists.length > 0) {

      const recordsToAdd = domainsWhichNotExists.map(domain => {
        return this.zone.record('A', {
          name: `${domain}.`,
          ttl: 300,
          data: [this.configFile.sandbox.kubernetes.cluster_ip]
        })
      })
      await this.zone.addRecords(recordsToAdd)
      console.log(`${domains.length} criado criado...`)
      // console.log(newRecord)
    }
    // console.log(records)
  }

  async deleteDNS() {
    const {sandbox, tempory_folder} = this.configFile
    try {
      const sandboxFolder = path.join(tempory_folder, sandbox.name, 'kub-sandbox', 'apps')
      const dns = this.getDNSOfCurrentSandbox(sandboxFolder)
      const recordToDelete = dns.map(domain => {
        return this.zone.record('A', {
          name: `${domain}.`,
          ttl: 300,
          data: [this.configFile.sandbox.kubernetes.cluster_ip]
        })
      })
      console.log(`Dropping cloud DNS...`)
      await this.zone.deleteRecords(recordToDelete)

    } catch (err) {
      throw err
    }
  }

  getDNSOfCurrentSandbox (sandboxFolderApps) {
    const projects = fs.readdirSync(sandboxFolderApps)
    const dnsList = new Set()
    for (const project of projects) {
      const ingressPath = path.join(sandboxFolderApps, project, `${project}-ingress.yml`)
      const frontEndIngress = path.join(sandboxFolderApps, project, `kub-ingress.yml`)
      let yamlContent
      if (fs.existsSync(ingressPath)) {
        yamlContent = fs.readFileSync(ingressPath).toString()
      } else if (fs.existsSync(frontEndIngress)) {
        yamlContent = fs.readFileSync(frontEndIngress).toString()
      } else {
        continue
      }
      const yamlParsed = yaml.parse(yamlContent)
      const hosts = yamlParsed.spec.rules.filter(rule => !!rule.host)
      const domains = hosts.map(host => host.host)
      dnsList.add(...domains)
    }

    //  Get san
    return Array.from(dnsList)
  }

  async getRecords () {
    return this.zone
      .getRecords()
      .then(results => results[0].map(r => ({
        ...r,
        name: r.name.slice(0, -1),
        type: r.type,
        data: r.data.map(d => d.charAt(d.length - 1) === '.' ? d.slice(0, -1) : d)
      })
      ))
  }
}

module.exports = DNSHelper