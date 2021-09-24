const {DNS} = require('@google-cloud/dns')

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

  async addDomain(domain) {
    const records = await this.getRecords()
    const exists = records.filter(record => record.name === domain).length
    if (!exists) {
      const newRecord = this.zone.record('A', {
        name: domain,
        ttl: 1800,
        rrdata: [this.configFile.sandbox.kubernetes.cluster_ip]
      })
      await this.zone.addRecords([newRecord])
      console.log(`Dominio ${domain} criado...`)
      console.log(newRecord)
    }
    console.log(records)
  }

  async getRecords () {
    return this.zone
      .getRecords()
      .then(results => results[0].map(r => ({
        name: r.name.slice(0, -1),
        type: r.type,
        data: r.data.map(d => d.charAt(d.length - 1) === '.' ? d.slice(0, -1) : d)
      })
      ))
  }
}

module.exports = DNSHelper