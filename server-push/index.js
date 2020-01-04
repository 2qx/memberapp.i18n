require('dotenv').config()
const webPush = require('web-push');

const https = require('https');
const fs = require('fs');
const express  = require('express');

if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) {
    console.log("You must set the VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY "+
        "environment variables. You can use the following ones:");
    console.log(webPush.generateVAPIDKeys());
    return;
}

webPush.setVapidDetails(
    process.env.SERVICE_DNS_NAME,
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
);


// https credentials
const httpsCredentials = {
    key: fs.readFileSync('cert/localhostService.key'),
    cert: fs.readFileSync('cert/localhostService.crt'),
    passphrase: process.env.SSL_KEYPHRASE
};

// create express server
const app = express();

// replace the guide in index file with readme contents
app.get('/', (req, res) => {
    let html = fs.readFileSync('../index.html', 'utf8');
    res.send(html);
});

app.get('/vapidPublicKey', function(req, res) {
    res.send(process.env.VAPID_PUBLIC_KEY);
});

app.post('/register', function(req, res) {
    res.sendStatus(201);
});

app.post('/sendNotification', function(req, res) {
    let body = [];
    setTimeout(function() {
        //console.log(JSON.stringify(req,null, 2));
        req.on('data', (chunk) => {
            body.push(chunk);
        }).on('end', () => {
            body = JSON.parse(Buffer.concat(body));
            console.log(JSON.stringify(body.subscription, null, 2));
            webPush.sendNotification(body.subscription)
                .then(function() {
                    res.sendStatus(201);
                })
                .catch(function(error) {
                    res.sendStatus(500);
                    console.log(error);
                });
        });
    }, 10000);
});

// serve static files
app.use(express.static('../'));

// create server for https
https.createServer(httpsCredentials, app).listen(process.env.EXPRESS_PORT);

console.log('https server running on https://localhost');