const config = require('./config.json')
const express = require('express')
const bodyParser = require('body-parser')
const path = require('path')

// Setup JSON DBs
const low = require('lowdb')
const FileSync = require('lowdb/adapters/FileSync')
const devices = new FileSync('data/devices.json')
const records = new FileSync('data/records.json')
const db = { 
	devices : low(devices),
	records : low(records)
}

db.devices.defaults({
	deviceList: [],
}).write()

db.records.defaults({
	locationData: [],
}).write()

// Configuration 
const listenport = config.listenport || 9202
const validator = config.validator
const secret = config.secret

const app = express()

app.use(bodyParser.urlencoded({
	extended: false
}))

// CORS middleware
app.use(function(req, res, next) {
	res.header('Access-Control-Allow-Origin', '*')
	res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept')
	next()
})

/*
Dashboard routes
*/

app.get('/meraki', (req, res) => {
	res.sendFile(path.join(__dirname + '/public/index.html'))
})
app.get('/meraki/admin/device', function(req, res) {
	res.sendFile(path.join(__dirname + '/public/admin/device/index.html'))
})
app.get('/meraki/admin/device/id', function(req, res) {
	res.sendFile(path.join(__dirname + '/public/admin/device/id.html'))
})

/*
API routes
*/

// Sends the validator for the cloud connector
app.get('/meraki/api/v1/cloudconnector', (req, res) => {
	res.send(validator)
})

// Treats data incoming from the cloud
app.post('/meraki/api/v1/cloudconnector', (req, res) => {

	try {
		const obj = JSON.parse(req.body.data) // path to API v 1.0 data

		if (obj.secret === secret) { // for API v2.0 it's req.body.secret
			console.log('Received secret is correct')
			for (const record of obj.probing) {
				// Store location data in the DB
				db.records.get('locationData')
					.push({
						client_mac: record.client_mac,
						rssi: record.rssi,
						last_seen: record.last_seen
					})
					.write()

				const logme = db.devices.get('deviceList')
					.find({
						client_mac: record.client_mac
					}).value()

				if (logme === undefined) {
					db.devices.get('deviceList')
						.push({
							client_mac: record.client_mac,
						})
						.write()
				}
			}
			res.sendStatus(200)
		} else {
			console.log('Received secret is invalid. Secret sent by:' + req.connection.remoteAddress)
			res.sendStatus(500)

		}
	} catch (e) {
		// An error has occured
		console.log('Error: Likely caused by an invalid POST from ' + req.connection.remoteAddress)
		console.log(e)
		res.sendStatus(500)
	}
})

// Returns all records from
app.get('/meraki/api/v1/device/', (req, res) => {
	try {
		const data = db.devices.get('deviceList').value()
		res.send(data)

	} catch (e) {
		console.log('Error: An error occured while fetching device data')
		res.sendStatus(500)
	}

})

// Returns info for a specific device
app.get('/meraki/api/v1/device/:id', (req, res) => {
	const id = req.params.id

	try {
		const data = db.records.get('locationData')
			.filter({	
				client_mac: id
			})
			.value()
		res.send(data)

	} catch (e) {
		console.log('Error: An error occured while fetching device data')
		res.sendStatus(500)
	}

})


app.listen(listenport)
console.log('Meraki Receiver 2 listening on port ' + listenport)