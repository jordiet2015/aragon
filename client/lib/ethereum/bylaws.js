import utils from 'ethereumjs-util'

import Company from './deployed'

Bylaws = new Mongo.Collection('bylaws', { connection: null })

class BylawsWatcher {
  constructor() {
    this.setupCollections()
  }

  listen() {
    this.listenForBylawChanges()
  }

  setupCollections() {
    this.Bylaws = Bylaws
    this.persistentBylaws = new PersistentMinimongo(this.Bylaws)
  }

  listenForBylawChanges() {
    if (this.lastWatchedBlock > this.lastBlock) {
      this.lastWatchedBlock = this.lastBlock
    }
    const threshold = this.lastBlock
    const missedPredicate = { fromBlock: Math.max(0, this.lastWatchedBlock - 10000), toBlock: threshold }
    const streamingPredicate = { fromBlock: threshold, toBlock: 'latest' }

    console.log('listen for bylaw changes', missedPredicate, streamingPredicate)

    Company().BylawChanged({}, missedPredicate).get((err, evs) =>
      evs.map(ev => this.watchBylaw(err, ev)))
    Company().BylawChanged({}, streamingPredicate).watch((err, ev) => this.watchBylaw(err, ev))
  }

  async watchBylaw(err, ev) {
    console.log('fetching bylaw', ev.args.functionSignature)
    if (!err && ev.args) await this.updateBylaw(ev.args.functionSignature)
    this.lastWatchedBlock = ev.blockNumber
  }

  async updateBylaw(signature) {
    const [type, updated, updatedBy] = await Company().getBylawType(signature)
        .then(x => x.map(y => ((y.toNumber) ? y.toNumber() : y)))
    let details = Promise.resolve()
    if (type === 0) {
      details = Company().getVotingBylaw.call(signature)
        .then(x => x.map(y => ((y.toNumber) ? y.toNumber() : y)))
        .then(([supportNeeded, supportBase, closingRelativeMajority, minimumVotingTime]) =>
          ({ supportNeeded, supportBase, closingRelativeMajority, minimumVotingTime }))
    } else {
      details = Company().getStatusBylaw.call(signature)
        .then(x => x.toNumber())
        .then(neededStatus => ({ neededStatus }))
    }

    const bylawObject = await Promise.allProperties({
      signature,
      type,
      details,
      updatedBy,

      updated: new Date(updated * 1000),
    })

    const signatureHash = utils.bufferToHex(utils.sha3(signature))

    this.Bylaws.upsert({ _id: `byl_${signatureHash}` }, bylawObject)
  }

  get lastBlockKey() {
    return 'lB_byl'
  }

  get lastWatchedBlock() {
    return Session.get(this.lastBlockKey) || EthBlocks.latest.number
  }

  get lastBlock() {
    return EthBlocks.latest.number
  }

  set lastWatchedBlock(block) {
    return Session.setPersistent(this.lastBlockKey, block)
  }
}

BW = BylawsWatcher

export default new BylawsWatcher()
