var Instainst = require('./instainst');

var credentials = {
	username: process.env.username,
	password: process.env.password
};

var inst = new Instainst({
    mailercredentials : {
        email       : process.env.mailerEmail,
        password    : process.env.mailerPassword
    },
    recipients : [
        'brian.frisch@gmail.com',
        'tina.lindfors@gmail.com',
    ],
    categories : {
        'uglerne'       : 21597,
        'humlebierne'   : 4740,
        'laerkerne'     : 1613
    },
    credentials : {
	    username: process.env.username,
	    password: process.env.password
    }
});

inst.run();