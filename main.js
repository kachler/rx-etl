const { Observable, Subject, of, from, fromEvent } = require('rxjs');
const { create, concat, map, takeUntil } = require('rxjs/operators');
const readline = require('readline');


const testEtl = require('./Etl');
 
const csv = require('csv-parser');

const express = require('express');
const path = require('path');
const fs = require('file-system');
const etl = require('etl');
const mongodb = require('mongodb');


const pg = require('pg');
const copyFrom = require('pg-copy-streams').from;

let pgClient = new pg.Client('postgres://pssshksz:Wh0grf6b-steQ88Dl0EIqk06siRpayld@pellefant.db.elephantsql.com:5432/pssshksz?ssl=true')
pgClient.connect();

const MongoClient = mongodb.MongoClient;
const Collection = mongodb.Collection;

const Json2csvTransform = require('json2csv').Transform;
const options = { highWaterMark: 16384, encoding: 'utf-8'};
const fields = ['id', 'first_name', 'last_name', 'email_address', 'password', 'phone', 'street_address', 'city', 'postal_code', 'country'];

const jparser = new Json2csvTransform({ fields }, options);

let collection;
let csvCollection;
let jsonCollection;

// establish mongodb connection
MongoClient.connect('mongodb://dbadmin:admin1234@ds157549.mlab.com:57549/npm-etl-test', (err, db) => {
	csvCollection = db.collection("csvCollection");
	jsonCollection = db.collection("jsonCollection");
})

const app = express();
const PORT = 3000;

const chooseMockFile = (req, res, next) => {
	res.locals.filename = 'MOCK_DATA.csv';
	res.locals.type = 'csv';
	collection = csvCollection;
	return next();
};

const chooseMockFilePg = (req, res, next) => {
	res.locals.filename = 'MOCK_DATA.csv';
	res.locals.type = 'csv';
	return next();
};

const chooseTestFile = (req, res, next) => {
	res.locals.filename = 'test.csv';
	return next();
};

const extractCsv = (sourceType, file) => {
	return Observable.create(observer => {
		let file$; 
		if (sourceType === 'csv') file$ = fs.createReadStream(file).pipe(csv());
		if (sourceType === 'json') file$ = file;

		file$.on('data', chunk => observer.next(chunk));
		file$.on('end', () => observer.complete());

		// close the stream 
		return () => file$.pause();
	});
};

// returns an observable
const transformObservable = (fileReader$, ...transformFunc) => {
	for (let i = 0; i < transformFunc.length; i += 1) {
		fileReader$ = fileReader$.pipe(map(data => transformFunc[i](data)));
	}
	return fileReader$;
};

const storeInMongo = (data) => {
	return collection.insertOne(data);
};

const storeInPg = async (data) => {
	const query = 'INSERT INTO test ("full_name", "email_address", "password", "phone", "street_address", "city", "postal_code", "country") VALUES ($1, $2, $3, $4, $5, $6, $7, $8)';
	const values = [data['full_name'], data['email_address'], data['password'], data['phone'], data['street_address'], data['city'], data['postal_code'], data['country']];
	return pgClient.query(query, values);
};

// returns changed entry
const combineNames = (data) => {
	const nd = {};
	nd.id = data.id * 1;
	nd.full_name = data["first_name"] + ' ' + data["last_name"];
	nd.email_address = data.email_address;
	nd.password = data.password;
	nd.phone = data.phone.replace(/[^0-9]/g, ''); 
	nd.street_address = data.street_address;
	nd.city = data.city;
	nd.postal_code = data.postal_code;
	nd.country = data.country;
	nd["__line"] = (data.id * 1) + 1;
	return nd;
};

const jsonToCsv = (req, res, next) => {
	res.locals.filename = fs.createReadStream('MOCK_DATA.json', { encoding: 'utf-8' }).pipe(jparser).pipe(csv());
	res.locals.type = 'json';
	collection = jsonCollection;
	return next();
};

const csvToMongo = async (req, res, next) => {
	const fileReader$ = extractCsv(res.locals.type, res.locals.filename);
	res.locals.data = transformObservable(fileReader$, combineNames, storeInMongo);
	return next();
};

const csvToPg = (req, res, next) => {
	const fileReader$ = extractCsv(res.locals.type, res.locals.filename);
	res.locals.data = transformObservable(fileReader$, combineNames, storeInPg);
	return next();
};

app.get('/csvToMongo', chooseMockFile, csvToMongo, (req, res) => {
	res.locals.data.subscribe();
	res.sendStatus(200);
});

app.get('/jsonToMongo', jsonToCsv, csvToMongo, (req, res) => {
	res.locals.data.subscribe();
	res.sendStatus(200);
});

app.get('/csvToPg', chooseMockFilePg, csvToPg, (req, res) => {
	res.locals.data.subscribe();
	res.sendStatus(200);
});

app.get('/etlPg', (req, res) => {

	const stream = pgClient.query(copyFrom('COPY test (id, first_name, last_name, email_address, password, phone, street_address, city, postal_code, country) FROM STDIN CSV HEADER'));
	const fileStream = fs.createReadStream('test.csv');

	fileStream.pipe(stream);
	
	res.sendStatus(200);
});


app.listen(`${PORT}`, () => {
  console.log(`Server listening on PORT: ${PORT}`);
});


/* CSV TO POSTGRES USING ETL */ 
	// fs.createReadStream(res.locals.filename)
	// 	.pipe(etl.csv())
	// 	.pipe(etl.map(data => {
	// 		const d = {};
	// 		d.id = data.id;
	// 		d.full_name = data["first_name"] + ' ' + data["last_name"];
	// 		d.email_address = data.email_address;
	// 		d.password = data.password;
	// 		d.phone = data.phone.replace(/[^0-9]/g, '');
	// 		d.street_address = data.street_address;
	// 	  d.city = data.city;
	// 		d.postal_code = data.postal_code;
	// 		d.country = data.country;
	// 		d["__line"] = (data.id * 1) + 1;
	// 		return d;
	// 	}))
	// 	.pipe(etl.collect(100))
	// 	.pipe(etl.map(data => {
			
	// 		data.forEach(data => {
	// 			const query = 'INSERT INTO test ("full_name", "email_address", "password", "phone", "street_address", "city", "postal_code", "country") VALUES ($1, $2, $3, $4, $5, $6, $7, $8)';
	// 			const values = [data['full_name'], data['email_address'], data['password'], data['phone'], data['street_address'], data['city'], data['postal_code'], data['country']];
				
	// 			pgClient.query(query, values);

	// 			return data;
	// 		})
			
	// 		return data;
	// 	}))
	// return next();

/* USING ETL npm to store from CSV to MONGO */
	// fs.createReadStream(res.locals.filename)
	// 		.pipe(etl.csv())
	// 		.pipe(etl.map(data => {
	// 			const nd = {};
	// 			if (data.country === 'United States') {
	// 				nd.id = data.id;
	// 				nd.full_name = data["first_name"] + ' ' + data["last_name"];
	// 				nd.email_address = data.email_address;
	// 				nd.password = data.password;
	// 				nd.phone = data.phone.replace(/[^0-9]/g, '');
	// 				nd.street_address = data.street_address;
	// 				nd.city = data.city;
	// 				nd.postal_code = data.postal_code;
	// 				nd.country = data.country;
	// 				nd["__line"] = (data.id * 1) + 1;
	// 				return nd;
	// 			}
	// 			return;
	// 		}))
	// 		.pipe(etl.collect(100))
	// 		.pipe(etl.mongo.insert(res.locals.filename === 'test.csv' ? jsonCollection : csvCollection))
