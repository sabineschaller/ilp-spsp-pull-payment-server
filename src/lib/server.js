const { createServer } = require('ilp-protocol-stream')
const Exchange = require('ilp-exchange-rate')

const crypto = require('crypto')

const Config = require('./config')
const TokenModel = require('../models/token')
const Webhooks = require('./webhooks')
const debug = require('debug')('ilp-spsp-pull:server')

class Server {
  constructor (deps) {
    this.config = deps(Config)
    this.tokens = deps(TokenModel)
    this.webhooks = deps(Webhooks)
    this.plugin = this.config.plugin
    this.server = null
  }

  start () {
    this.listen()
    this.monitorToken()
  }

  async monitorToken () {
    const expired = this.tokens.getExpired()
    await this.tokens.deleteMultiple(expired)
    setTimeout(this.monitorToken.bind(this), 1000)
  }

  async listen () {
    this.server = await createServer({
      plugin: this.plugin,
      serverSecret: crypto.randomBytes(32)
    })

    this.server.on('connection', async (connection) => {
      debug('server got connection')

      const tag = connection.connectionTag

      if (!tag) {
        // push payment
        connection.on('stream', (stream) => {
          stream.setReceiveMax(Infinity)
          stream.on('money', amount => {
            debug('Received ' + amount + ' units from ' + connection._sourceAccount)
          })
        })
      } else {
        // pull payment
        const token = tag.split('~').join('.')
        const tokenInfo = await this.tokens.get(token)

        connection.on('stream', async (stream) => {
          const exchangeRate = await Exchange.fetchRate(tokenInfo.assetCode, tokenInfo.assetScale, this.server.serverAssetCode, this.server.serverAssetScale)
          if (exchangeRate) {
            const pullable = Math.floor(tokenInfo.balanceAvailable * exchangeRate)
            stream.setSendMax(pullable)

            stream.on('outgoing_money', pulled => {
              debug('Streamed ' + pulled + ' units to ' + connection._sourceAccount)
              const amount = Math.ceil(pulled / exchangeRate)
              this.tokens.pull({ token, amount })
              this.webhooks.call({ token })
                .catch(e => {
                })
            })
          }
        })
      }
    })
  }

  generateAddressAndSecret (connectionTag) {
    return this.server.generateAddressAndSecret(connectionTag)
  }
}

module.exports = Server
