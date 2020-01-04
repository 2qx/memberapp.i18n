# Notification Server

This branch is a playground for push notifications. 

This directory includes a simple express server to handle notification endpoints and serve 
static files on the same endpoint.

## Installation

This project was developed and tested with v10.16.3.  It can be installed with:

    npm i

## Configuration 

In order to run, the following environment variables must be declared either in the environment
or in a `.env` file in this directory.

    VAPID_PUBLIC_KEY=''
    VAPID_PRIVATE_KEY=''
    SSL_KEYPHRASE=''
    SERVICE_DNS_NAME='https://member.local/'
    EXPRESS_PORT=
    
Your vapid key may be generated in node with the following commands:

    const webpush = require('web-push');    
    const vapidKeys = webpush.generateVAPIDKeys()
        
    
For notes about configuring SSL see ./cert/README.md, the `SSL_KEYPHRASE` will
 be entered in that step.
 
The express port may be any high port greater than 1024, but should match 
the routing rules chosen in SSL configuration.

## Run 

The server is currently run under `nodemon` 

    npm run dev