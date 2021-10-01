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

  async addDomains(domains) {
    const records = await this.getRecords()
    const recordsMap = records.reduce((map, record) => {
      map.set(record.name, record)
      return map
    }, new Map())
    const domainsWhichNotExists = domains.filter(domain => !recordsMap.has(domain))

    if (domainsWhichNotExists.length > 0) {

      const recordsToAdd = domainsWhichNotExists.map(domain => {
        const subDomain = domain.replace(`.squidit.com.br`, '')
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