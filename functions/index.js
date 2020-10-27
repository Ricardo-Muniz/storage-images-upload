const functions = require('firebase-functions');
const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const cons = require('consolidate');
const uuid = require('uuid');
const fs = require('fs');
const Stream = require('stream');
const Multer = require('multer');
const Blob = require('blob');
const moment = require('moment');
const os = require('os');
const cors = require('cors');
var multiparty = require('multiparty');
var util = require('util');
const {Storage} = require('@google-cloud/storage');
const spawn  = require('child-process-promise').spawn;
const { join } = require('path');
const { tmpdir } = require('os');
const { createWriteStream } = require('fs');
const BusBoy = require('busboy');
//VARIABLE EXPRESS ROUTE
var app = express();

//firebase admin
const admin = require("firebase-admin");

//route service firebase admin JSON
var serviceGoogle = require(__dirname + "/client_secret.json");
var serviceAccount = require(__dirname + "/api-exploit-hunters-admin.json");

var refreshToken;
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://api-exploit-hunters.firebaseio.com",
  storageBucket: "api-exploit-hunters.appspot.com",
  projectId: "api-exploit-hunters",
  authDomain: "api-exploit-hunters.firebaseapp.com"
});


//google cloud storage
const gcs = new Storage({
  credential: admin.credential.cert(serviceAccount),
  projectId: 'api-exploit-hunters',
  keyFilename: __dirname + "/api-exploit-hunters-admin.json"
});

//multer storage image asseted
const multer = Multer({
  storage: Multer.memoryStorage()
});


//create link folder html VIEWS
app.engine('html', cons.swig);
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'html');


//initialize app e request
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(cors({ origin: true }));

//mildleware folder public
app.use(express.static('./public'));
//app.use((req) => console.log(req.originalUrl));

app.get('/', function(req, res) {
  res.render(__dirname + '/views/index', { title: 'Exploit Hunters - upload admin' });
});

app.get('/home', function(req, res) {
  res.render(__dirname + '/views/index', { title: 'Exploit Hunters - upload admin' });
});

//upload image file API
app.post('/upload', function(req, res) {

  const incomingFields = {};
  const incomingFiles = {};
  const writes = [];

  var PATH_DATA_FILE = '';
  var TYPE_DATA_FILE = '';
  var NAME = '';

  let count = 0;
  const uid = uuid.v4();

  let assets = {};
  assets['asset'] = [];

  const busboy = new BusBoy({ headers: req.headers });
  let uploadData = null;

  busboy.on('field', (name, value) => {

    try {
      // This will keep a field created like so form.append('product', JSON.stringify(product)) intact
      incomingFields[name] = JSON.parse(value);
    } catch (e) {
      // Numbers will still be strings here (i.e 1 will be '1')
      incomingFields[name] = value;
    }
  })

  busboy.on('file', (field, file, filename, encoding, contentType) => {

    const filepath = join(tmpdir(), filename);
    PATH_DATA_FILE = filepath;
    TYPE_DATA_FILE = contentType;
    NAME = filename;

    count++;

    let asset = createStreamFile(filename, field, file, filepath, encoding, contentType, incomingFiles, writes);
    assets['asset'].push(asset);

    let arrayParse = JSON.stringify(assets);
    let strArray = JSON.parse(arrayParse);
    let stringAsset = strArray.asset;

    console.log('--------------------');
    console.log('Asset array: ' + JSON.stringify(stringAsset));

  })

  busboy.on('finish', async () => {

    req.files = incomingFiles;
    req.body = incomingFields;
    let countDone = 0;
    let objFiles = [];
    let token = uuid.v4();

    for(let i = 0; i < count; i++) {
      let done;
      let arrayParse = JSON.stringify(assets['asset'][i]);
      let strArray = JSON.parse(arrayParse);
      countDone++;

      let namefile = strArray.asset.name;
      let type = strArray.asset.type;
      let path = strArray.asset.path;

      objFiles[i] = namefile;

      if(countDone === count) done = true;

      fileUploadStreams(token, uid, type, path, namefile, res)
      .then(() => {
        if(done) {
          responseImagesUpload(count, token, uid, objFiles, res);
        }
      })
      .catch(err => {
        return res.status(500).json(err);
      });
    }
  });
 busboy.end(req.rawBody);
});

//function create stream Files
function createStreamFile(filename, field, file, filepath, encoding, contentType, incomingFiles, writes) {
  incomingFiles[field] = incomingFiles[field] || [];
  incomingFiles[field].push({ filepath, encoding, contentType });
  const writeStream = createWriteStream(filepath);

  let asset = {
    asset: {
    path: filepath,
    name: filename,
    type: contentType
    }
  };

  writes.push(new Promise((resolve, reject) => {
    file.on('end', () => {
       writeStream.end()
    });

    writeStream.on('finish', resolve);
    writeStream.on('error', reject);
  }))

  file.pipe(writeStream);
  return asset;
}

//function bucket upload data
async function fileUploadStreams(token, uid, type, path, name, res) {
  var name = name;
  const metadata = {
    metadata: {
      // This line is very important. It's to create a download token.
      firebaseStorageDownloadTokens: token
    },
    contentType: type,
    cacheControl: 'public, max-age=31536000',
  };

  const destination = uid + '/' + name;
  var bucket = gcs.bucket('api-exploit-hunters.appspot.com');
  await bucket.upload(path, {
          destination: destination,
          gzip: true,
          metadata: metadata,
  });
}

async function responseImagesUpload(count, token, uid, obj, response) {
  let size = 0;
  let profileImage;
  let wallpaperImage;
  const content = {};
  content['urls'] = [];
  const bucket = gcs.bucket('api-exploit-hunters.appspot.com');

  for(let i = 0; i < count; i++) {
    size++;
    console.log('Size count for: ' + size);
    const file = bucket.file(`${uid}/${obj[i]}`);
    await file.getSignedUrl({
      action: 'read',
      expires: '03-09-2491'
    }).then(signedUrls => {
      // signedUrls[0] contains the file's public URL
      //if(obj[i] === 'profile.png') profileImage = signedUrls[0];
      //if(obj[i] === 'wallpaper.png') wallpaperImage = signedUrls[0];

      console.log('Media url: ' + signedUrls[0]);
      let urls = signedUrls[0];

      content['urls'].push(urls);
      console.log('Content media then arr: ' + JSON.stringify(content['urls']));
    });

    if(size == count) {

      let contentStr = JSON.stringify(content['urls']);
      let parseStr = JSON.parse(contentStr);

      return preSaveUrls(uid, content, response);
    }
  }
}

//function save form and close Stream
async function preSaveUrls(uid, body, response) {
  let content = PreSave(body);
  let base = admin.database();
  let referenceContents = base.ref('contents').push();
  let message = [];
  let messageBody;
  let contentMessage = '';

  await referenceContents.set({
    content: content
  })
  .then((snap) => {
    console.log('success: ' + referenceContents.key);
    return response.status(200).json({
      message: referenceContents.key,
      result:  body
    });
  })
  .catch(err => {
    console.log(err);
    return response.status(500).json(err);
  });
}

function PreSave(body) {
  var id_asset = uuid.v4();
  //URLS IMAGES ASSTES
  var parseStr = body;
  var uris = [];
  uris.push(parseStr.urls);
  var dataUrl = JSON.stringify(uris);
  var parseUrl = JSON.parse(dataUrl);
  let urls = parseUrl[0];
  var created = getTimestamp();
  let content = {created, id_asset, urls};
  return content;
}

//get timestamp database set item
function getTimestamp() {
  var day =  moment().format("D");
  var hour =  moment().format("M");
  var minutes =  moment().format("mm");
  var period =  moment().format("A");
  var dateStamp = hour + '-' + day + '-' + minutes + '-' + period;
  return dateStamp;
}

exports.app = functions.https.onRequest(app);
