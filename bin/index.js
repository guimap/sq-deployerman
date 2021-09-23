#!/usr/bin/env node

const fs = require('fs')
const path = require('path')
const yargs = require("yargs")
const { hideBin } = require('yargs/helpers')


const registerCommands = yargs(hideBin(process.argv))
  .usage('Usage $0 <command> [options]')

const commands = fs.readdirSync(path.join(__dirname, 'commands')).filter(file => file.endsWith('.command.js'))

for (const commandPath of commands) {
  const commandFile = require(`./commands/${commandPath}`)
  if (!'command' in commandFile) continue
  if (!'describeFunction' in commandFile) continue
  if (!'run' in commandFile) continue

  const {
    command,
    describe,
    describeFunction,
    run,
    alias,
    help
  } = commandFile
  registerCommands
    .command(command, describe, describeFunction, run)
  if (Array.isArray(alias)) registerCommands.alias(...alias)
  if (help) registerCommands.help('h')

}
registerCommands
  .strictCommands()
  .argv

// console.log(greeting)