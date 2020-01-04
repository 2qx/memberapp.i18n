# Development with SSL encryption

**This guide was written for a debian like-linux in 2020**

Certain features of service workers and notifications only function over SSL. 
In order to develop this branch live, SSL may be configured with a self signed certificate. 

Creating a simple certificate with commonName set to 'localhost' will cause Chrome 
to complain that the "signing authority" is invalid and that the "subjectAltName" 
is also invalid. Although there is a [chrome flag](chrome://flags/#allow-insecure-localhost) 
that would appear to enable this easily, it does not appear to function as described.

So, to appease modern browsers with a self-sign a certificate... 

The following commands: 
 - create a local authority cert and key, 
 - create a service key and signing request with the correct subjectAltName,
 - and finally sign the certificate with the local authority

Note: these command must be run from the directory with `ssl.config` and `v3.ext`
  
    openssl genrsa -out localhostRootCA.key 4096
    openssl req -x509 -new -nodes -key localhostRootCA.key -days 1024 -out localhostRootCA.crt 
    openssl genrsa -out localhostService.key 4096
    openssl req -new -key localhostService.key -out localhostService.csr  -config ssl.config
    openssl x509 -req -in localhostService.csr -CA localhostRootCA.crt -CAkey localhostRootCA.key -CAcreateserial -out localhostService.crt -days 1024 -extfile v3.ext

By default, the hostname will be `member.local`, however it may be changed to any 
domain controlled by the developer in the configuration files.

Once complete, the **localhostRootCA.crt** must be trusted in the advanced settings each browser used for testing. It should not
be necessary to add the service certificate. The organization will be **"None"**.

**It is not advisable** to trust the self-signed authority in the operating system,
 or leave it trusted forever in your browsers.  

Additionally, as a modern *nix convention, only processes with root may serve 
on low number ports. For this reason, it is necessary to redirect the development port to 443 as follows.

    sudo iptables -t nat -I PREROUTING --src 0/0 --dst localhost -p tcp --dport 443 -j REDIRECT --to-ports <YOUR_DEV_PORT>
    sudo iptables -t nat -I OUTPUT --src 0/0 --dst localhost -p tcp --dport 443 -j REDIRECT --to-ports <YOUR_DEV_PORT>

